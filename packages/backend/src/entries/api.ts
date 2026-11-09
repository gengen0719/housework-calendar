import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { createChoreType } from '../handlers/choreType/create';
import { listChoreTypes } from '../handlers/choreType/list';
import { removeChoreType } from '../handlers/choreType/remove';
import { setChoreTypeActive } from '../handlers/choreType/setActive';
import { updateChoreType } from '../handlers/choreType/update';
import { createFamily } from '../handlers/family/createFamily';
import { getMe } from '../handlers/family/getMe';
import { getNotificationGroup } from '../handlers/family/getNotificationGroup';
import { listMembers } from '../handlers/family/listMembers';
import { createInvitation } from '../handlers/invitation/create';
import { acceptInvitation } from '../handlers/invitation/accept';
import { getCurrentInvitation } from '../handlers/invitation/getCurrent';
import { previewInvitation } from '../handlers/invitation/preview';
import { changeDutyChild } from '../handlers/calendar/changeDutyChild';
import { recordDuty } from '../handlers/calendar/recordDuty';
import { getAssignment } from '../handlers/calendar/getAssignment';
import { getCalendar } from '../handlers/calendar/getCalendar';
import { saveAssignment } from '../handlers/calendar/saveAssignment';
import { createSession } from '../handlers/session/createSession';
import { getConfig, type AppConfig } from '../lib/config';
import { ApiError } from '../lib/errors';
import { errorResponse, json } from '../lib/http';
import { describeError, logger, setRequestId, takeRequestMetrics } from '../lib/logger';
import { readJsonBody } from '../lib/requestBody';
import { matchRoute } from '../lib/router';
import { requireAuth } from '../middleware/requireAuth';
import { verifyOriginHeader } from '../middleware/verifyOriginHeader';
import { setCalendarPort } from '../services/calendarPort';
import * as calendarService from '../services/calendarService';

/**
 * composition root: C7（種類）の「消す」が使う C8 の窓口に、U5 の本物を取り付ける（BR6.10）。
 * 向きは entries/api → calendarService → choreTypeService → calendarPort で、輪を作らない
 * （choreTypeService は calendarPort の形だけに頼り、calendarService を import しない）。
 * 読み込んだ時点で取り付く。LINE の入口（entries/line）は種類を消さないので取り付けない。
 */
setCalendarPort({ isChoreTypeAssigned: calendarService.isChoreTypeAssigned });

interface RouteInput {
  event: APIGatewayProxyEventV2;
  config: AppConfig;
  now: Date;
  /** パスの型の `:name` の部分（例: 招待の印 `token`）。ログには書かない */
  params: Record<string, string>;
  /** Lambda の残り時間（ミリ秒）。時間切れの前に書き込みを止めるために使う（U5）。ないときは見ない */
  remainingTimeMs?: () => number;
}

interface RouteResult {
  status: number;
  body: unknown;
}

export type Route = (input: RouteInput) => Promise<RouteResult>;

/** 本文を JSON に読む。壊れていたら 400。 */
function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return undefined;
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'INTERNAL', { field: 'body' });
  }
}

/**
 * 画面用 API の振り分け表（`<METHOD> <path>`）。
 * セッションの発行以外は、先頭で requireAuth を通す。家族のデータを扱う操作は、続けて
 * requireMembership（管理者の操作は requireAdmin も）を重ねる。
 * キーは `<METHOD> <パスの型>`。パスの型の `:name` は 1 区切りに合う（lib/router.ts）。
 * 追加するときは、ここに 1 行足す。
 */
export const routes: Record<string, Route> = {
  'POST /v1/sessions': async ({ event, config, now }) => ({
    status: 200,
    body: await createSession(parseJsonBody(event), config, now),
  }),
  'GET /v1/me': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await getMe(auth) };
  },
  // 家族に入る前の人の操作なので、requireMembership は通さない
  'POST /v1/families': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 201,
      body: await createFamily(auth, parseJsonBody(event), event.headers, now),
    };
  },
  // U4: お手伝いの種類の一覧（メンバー全員）と登録（管理者だけ。権限の確かめは各ハンドラーで requireMembership → requireAdmin）
  'GET /v1/chore-types': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await listChoreTypes(auth) };
  },
  'POST /v1/chore-types': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 201,
      body: await createChoreType(auth, parseJsonBody(event), event.headers, now),
    };
  },
  // U4: 変更（PUT）・使わない／使う（PATCH）・消す（DELETE）。ID の形と種類の確かめは各ハンドラーで（本文の確かめより先に 404）
  'PUT /v1/chore-types/:choreTypeId': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await updateChoreType(auth, params.choreTypeId ?? '', parseJsonBody(event), now),
    };
  },
  'PATCH /v1/chore-types/:choreTypeId': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await setChoreTypeActive(auth, params.choreTypeId ?? '', parseJsonBody(event), now),
    };
  },
  'DELETE /v1/chore-types/:choreTypeId': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    await removeChoreType(auth, params.choreTypeId ?? '', now);
    return { status: 204, body: undefined };
  },
  // U5: 月の割り当て。読む（メンバー全員）と保存（管理者だけ。権限の確かめは各ハンドラーで requireMembership → requireAdmin）。
  // 本文は保存の中で必要になった時点で読む（64 KB まで。413）
  'GET /v1/months/:month/assignment': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await getAssignment(auth, params.month ?? '') };
  },
  'PUT /v1/months/:month/assignment': async ({ event, config, now, params, remainingTimeMs }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await saveAssignment(auth, params.month ?? '', () => readJsonBody(event), {
        now,
        ...(remainingTimeMs ? { remainingTimeMs } : {}),
      }),
    };
  },
  // U5: 月のカレンダー（メンバー全員。子供も）と、日ごとの担当の子供の変更（管理者だけ。本文は担当の 404 のあとで読む）
  'GET /v1/months/:month/calendar': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await getCalendar(auth, params.month ?? '', now) };
  },
  'PATCH /v1/duties/:dutyId': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await changeDutyChild(auth, params.dutyId ?? '', () => readJsonBody(event), { now }),
    };
  },
  // U6: 画面から担当を記録する（子供本人だけ。本文は担当の 404 のあとで読む）
  'POST /v1/duties/:dutyId/record': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await recordDuty(auth, params.dutyId ?? '', () => readJsonBody(event), { now }),
    };
  },
  // U2: 家族のメンバーの一覧（メンバー全員）と招待（管理者だけ。権限の確かめは各ハンドラーで requireMembership → requireAdmin）
  'GET /v1/family/members': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await listMembers(auth) };
  },
  // U3: お知らせ先の表示（メンバー全員。グループ ID は返さない）
  'GET /v1/family/notification-group': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await getNotificationGroup(auth) };
  },
  'GET /v1/family/invitation': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await getCurrentInvitation(auth, config.liffUrl, now) };
  },
  // 招待を開く・参加する: 家族に入る前の人の操作なので、requireMembership は通さない（ブロック中は requireAuth が 403）
  'GET /v1/invitations/:token': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return { status: 200, body: await previewInvitation(auth, params.token ?? '', now) };
  },
  'POST /v1/invitations/:token/accept': async ({ event, config, now, params }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 200,
      body: await acceptInvitation(auth, params.token ?? '', event.headers, now),
    };
  },
  'POST /v1/family/invitations': async ({ event, config, now }) => {
    const auth = await requireAuth(event.headers, config.signingSecret, now);
    return {
      status: 201,
      body: await createInvitation(auth, event.headers, config.liffUrl, now),
    };
  },
};

/** 画面用 API の受け口（Lambda 関数 URL）。決まりで断るときは `{ error: { reason, details? } }`。思いがけない失敗は 500。 */
export async function handler(
  event: APIGatewayProxyEventV2,
  context?: Partial<Pick<Context, 'awsRequestId' | 'getRemainingTimeInMillis'>>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const startedAt = Date.now();
  setRequestId(context?.awsRequestId ?? event.requestContext?.requestId);
  const method = event.requestContext?.http?.method;
  // パスの型を先に決め、ログにはパスそのものではなく型を書く（招待の印を出さない。NFR4.26）
  const match = matchRoute(routes, method, event.rawPath);
  const path = match?.route ?? 'unmatched';
  logger.info({ event: 'REQUEST_START', method, path });
  try {
    const config = await getConfig();
    if (!verifyOriginHeader(event.headers, config.originVerifySecret)) {
      logger.warn({ event: 'REQUEST_REJECTED', reason: 'ORIGIN_HEADER', path });
      return json(403, { error: { reason: 'FORBIDDEN' } });
    }
    if (!match) throw new ApiError(404, 'NOT_FOUND');
    const remaining = context?.getRemainingTimeInMillis;
    const result = await match.handler({
      event,
      config,
      now: new Date(),
      params: match.params,
      ...(remaining ? { remainingTimeMs: () => remaining.call(context) } : {}),
    });
    return json(result.status, result.body);
  } catch (err) {
    if (err instanceof ApiError) {
      logger.info({ event: 'REQUEST_REJECTED', status: err.status, reason: err.reason, path });
      return errorResponse(err);
    }
    logger.error({ event: 'REQUEST_ERROR', path, ...describeError(err) });
    return json(500, { error: { reason: 'INTERNAL' } });
  } finally {
    logger.info({
      event: 'REQUEST_END',
      path,
      durationMs: Date.now() - startedAt,
      ...takeRequestMetrics(),
    });
  }
}
