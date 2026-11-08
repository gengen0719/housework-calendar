import { GROUP_JOIN_GUIDE, GROUP_REGISTER_BUTTON } from '@housework/shared';
import { describeError, logger } from '../../lib/logger';
import * as lineApiService from '../../services/lineApiService';
import { REGISTER_POSTBACK_ACTION } from './groupCommand';
import type { LineEvent } from './types';

/** 参加の案内: 登録の手順の文と、「このグループをお知らせ先にする」ボタン（BR4.1）。 */
export function buildJoinReply(): lineApiService.LineMessage[] {
  return [
    lineApiService.buildPostbackButtonMessage({
      altText: GROUP_JOIN_GUIDE,
      text: GROUP_JOIN_GUIDE,
      label: GROUP_REGISTER_BUTTON,
      data: `action=${REGISTER_POSTBACK_ACTION}`,
    }),
  ];
}

/**
 * F7: 公式アカウントがグループに参加した。案内を reply する。複数人のトーク（room）では何もしない。
 * reply の失敗は記録するだけ（C4）。
 */
export async function handleJoin(event: LineEvent): Promise<void> {
  if (event.source?.type !== 'group') {
    logger.info({ event: 'LINE_EVENT_IGNORED', type: 'join', sourceType: event.source?.type });
    return;
  }
  logger.info({ event: 'GROUP_JOINED', groupId: event.source.groupId });
  if (!event.replyToken) return;
  try {
    await lineApiService.reply(event.replyToken, buildJoinReply());
  } catch (cause) {
    logger.warn({ event: 'LINE_REPLY_FAILED', type: 'join', ...describeError(cause) });
  }
}
