import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { createFamily } from '../handlers/family/createFamily';
import { getMe } from '../handlers/family/getMe';
import { createSession } from '../handlers/session/createSession';
import { getConfig, type AppConfig } from '../lib/config';
import { ApiError } from '../lib/errors';
import { errorResponse, json } from '../lib/http';
import { describeError, logger, setRequestId } from '../lib/logger';
import { requireAuth } from '../middleware/requireAuth';
import { verifyOriginHeader } from '../middleware/verifyOriginHeader';

interface RouteInput {
  event: APIGatewayProxyEventV2;
  config: AppConfig;
  now: Date;
}

interface RouteResult {
  status: number;
  body: unknown;
}

type Route = (input: RouteInput) => Promise<RouteResult>;

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
 * 追加するときは、ここに 1 行足す。
 */
const routes: Record<string, Route> = {
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
};

/** 画面用 API の受け口（Lambda 関数 URL）。決まりで断るときは `{ error: { reason, details? } }`。思いがけない失敗は 500。 */
export async function handler(
  event: APIGatewayProxyEventV2,
  context?: Pick<Context, 'awsRequestId'>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const startedAt = Date.now();
  setRequestId(context?.awsRequestId ?? event.requestContext?.requestId);
  const method = event.requestContext?.http?.method;
  logger.info({ event: 'REQUEST_START', method, path: event.rawPath });
  try {
    const config = await getConfig();
    if (!verifyOriginHeader(event.headers, config.originVerifySecret)) {
      logger.warn({ event: 'REQUEST_REJECTED', reason: 'ORIGIN_HEADER' });
      return json(403, { error: { reason: 'FORBIDDEN' } });
    }
    const route = routes[`${method} ${event.rawPath}`];
    if (!route) throw new ApiError(404, 'NOT_FOUND');
    const result = await route({ event, config, now: new Date() });
    return json(result.status, result.body);
  } catch (err) {
    if (err instanceof ApiError) {
      logger.info({ event: 'REQUEST_REJECTED', status: err.status, reason: err.reason });
      return errorResponse(err);
    }
    logger.error({ event: 'REQUEST_ERROR', ...describeError(err) });
    return json(500, { error: { reason: 'INTERNAL' } });
  } finally {
    logger.info({ event: 'REQUEST_END', durationMs: Date.now() - startedAt });
  }
}
