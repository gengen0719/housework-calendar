import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { handleFollow } from '../handlers/line/followHandler';
import { isOneToOneRegisterRequest, parseGroupCommand } from '../handlers/line/groupCommand';
import { handleJoin } from '../handlers/line/joinHandler';
import { handleLeave } from '../handlers/line/leaveHandler';
import { handleMessage } from '../handlers/line/messageHandler';
import { handlePostback } from '../handlers/line/postbackHandler';
import { parseRecordCommand } from '../handlers/line/recordCommand';
import { parseSwapMessage, parseSwapPostback } from '../handlers/line/swapCommand';
import { handleUnfollow } from '../handlers/line/unfollowHandler';
import { WebhookBodySchema, type LineEvent } from '../handlers/line/types';
import { getConfig } from '../lib/config';
import { describeError, logger, setRequestId } from '../lib/logger';
import {
  LINE_SIGNATURE_HEADER,
  getRawBody,
  verifyLineSignature,
} from '../middleware/verifyLineSignature';
import { verifyOriginHeader } from '../middleware/verifyOriginHeader';
import * as lineEventRepository from '../repositories/lineEventRepository';
import { registerSwapHooks } from '../services/swapService';

// 起動の枠で 1 回だけ登録する（U8。BR9.11）。line は担当の子供を変える書き込みを持たないので、記録の通知だけ
registerSwapHooks({ reassigned: false, recorded: true });

const json = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

interface EventRoute {
  /** false なら、二度処理しない記録を書く前に終える（NFR3.4、NFR4.28） */
  accepts: (event: LineEvent) => boolean;
  handle: (event: LineEvent, now: Date) => Promise<void>;
}

const always = (): boolean => true;
const isGroupOperation = (event: LineEvent): boolean =>
  parseGroupCommand(event) !== null || isOneToOneRegisterRequest(event);

const handlers: Record<string, EventRoute> = {
  follow: { accepts: always, handle: handleFollow },
  join: { accepts: always, handle: handleJoin },
  leave: { accepts: always, handle: handleLeave },
  unfollow: { accepts: always, handle: handleUnfollow },
  // message は、グループの操作（U3 の「登録」）か、「家事交代」（U8）を受け付ける
  message: {
    accepts: (event) => isGroupOperation(event) || parseSwapMessage(event) !== null,
    handle: handleMessage,
  },
  // postback は、グループの操作か、1 対 1 の記録の操作（U6。record.list / record.do）を受け付ける（security-design.md）
  postback: {
    accepts: (event) =>
      isGroupOperation(event) ||
      parseRecordCommand(event) !== null ||
      parseSwapPostback(event) !== null,
    handle: handlePostback,
  },
};

/** 1 件のイベントを、二度処理しないようにして扱う（BR2.7）。思いがけない失敗は記録を消して投げる。 */
async function processEvent(event: LineEvent, now: Date): Promise<void> {
  const route = Object.hasOwn(handlers, event.type) ? handlers[event.type] : undefined;
  if (!route || !route.accepts(event)) {
    logger.info({ event: 'LINE_EVENT_IGNORED', type: event.type });
    return;
  }
  const { handle } = route;
  const { webhookEventId } = event;
  if (!webhookEventId) {
    logger.warn({ event: 'LINE_EVENT_SKIPPED', type: event.type, reason: 'no-event-id' });
    return;
  }
  if ((await lineEventRepository.begin(webhookEventId, now)) === 'duplicate') {
    logger.info({ event: 'LINE_EVENT_DUPLICATE', type: event.type });
    return;
  }
  const startedAt = Date.now();
  try {
    await handle(event, now);
  } catch (err) {
    await lineEventRepository.release(webhookEventId).catch((releaseErr: unknown) => {
      logger.error({ event: 'LINE_EVENT_RELEASE_FAILED', ...describeError(releaseErr) });
    });
    throw err;
  }
  await lineEventRepository.markDone(webhookEventId, now);
  logger.info({ event: 'LINE_EVENT_DONE', type: event.type, durationMs: Date.now() - startedAt });
}

/** LINE 用の受け口（Lambda 関数 URL）。確かめたあと、業務の結果にかかわらず 200。思いがけない失敗だけ 500（NFR4.8）。 */
export async function handler(
  event: APIGatewayProxyEventV2,
  context?: Pick<Context, 'awsRequestId'>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const startedAt = Date.now();
  setRequestId(context?.awsRequestId ?? event.requestContext?.requestId);
  logger.info({
    event: 'REQUEST_START',
    method: event.requestContext?.http?.method,
    path: event.rawPath,
  });
  try {
    const config = await getConfig();

    if (!verifyOriginHeader(event.headers, config.originVerifySecret)) {
      logger.warn({ event: 'REQUEST_REJECTED', reason: 'ORIGIN_HEADER' });
      return json(403, { error: { reason: 'FORBIDDEN' } });
    }

    const rawBody = getRawBody(event);
    if (
      !verifyLineSignature(rawBody, event.headers?.[LINE_SIGNATURE_HEADER], config.channelSecret)
    ) {
      logger.warn({ event: 'REQUEST_REJECTED', reason: 'LINE_SIGNATURE' });
      return json(401, { error: { reason: 'UNAUTHENTICATED' } });
    }

    let parsed: ReturnType<typeof WebhookBodySchema.safeParse>;
    try {
      parsed = WebhookBodySchema.safeParse(JSON.parse(rawBody.toString('utf8')));
    } catch {
      parsed = WebhookBodySchema.safeParse(undefined);
    }
    if (!parsed.success) {
      logger.warn({ event: 'REQUEST_REJECTED', reason: 'BAD_BODY' });
      return json(400, { error: { reason: 'INTERNAL' } });
    }

    const now = new Date();
    for (const lineEvent of parsed.data.events) {
      await processEvent(lineEvent, now);
    }
    return json(200, {});
  } catch (err) {
    logger.error({ event: 'REQUEST_ERROR', ...describeError(err) });
    return json(500, { error: { reason: 'INTERNAL' } });
  } finally {
    logger.info({ event: 'REQUEST_END', durationMs: Date.now() - startedAt });
  }
}
