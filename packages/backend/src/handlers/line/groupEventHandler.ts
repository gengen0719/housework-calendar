import {
  getMessage,
  GROUP_REGISTER_IN_GROUP_ONLY,
  NOTIFICATION_GROUP_ADMIN_ONLY,
  NOTIFICATION_GROUP_REGISTERED,
} from '@housework/shared';
import { describeError, logger } from '../../lib/logger';
import * as groupCommandGate from '../../services/groupCommandGate';
import * as lineApiService from '../../services/lineApiService';
import { isOneToOneRegisterRequest, parseGroupCommand } from './groupCommand';
import type { LineEvent } from './types';

/** reply を送る。失敗しても業務の結果は変えず、記録するだけ（NFR2.20、C4）。 */
async function replyText(event: LineEvent, text: string): Promise<void> {
  if (!event.replyToken) return;
  try {
    await lineApiService.reply(event.replyToken, [{ type: 'text', text }]);
  } catch (cause) {
    logger.warn({ event: 'LINE_REPLY_FAILED', type: event.type, ...describeError(cause) });
  }
}

/**
 * グループの message・postback の入口（message と postback で共通）。ここに届くのは操作にあたるものだけ
 * （entries/line.ts の accepts が、そうでないものを二度処理しない記録の前に打ち切る）。
 * - グループの「登録」の操作 → 管理者の確かめ → 登録 → reply
 * - 1 対 1 のトークの「登録」→ グループの中で行うよう案内（BR4.13）
 * 登録できなかったときの思いがけない失敗は投げる（入口が 500 にして LINE の再送に任せる）。
 */
export async function handleGroupEvent(event: LineEvent, now: Date = new Date()): Promise<void> {
  const command = parseGroupCommand(event);
  if (command?.kind === 'registerNotificationGroup') {
    const groupId = event.source?.groupId;
    if (!groupId) {
      logger.warn({ event: 'LINE_EVENT_SKIPPED', type: event.type, reason: 'no-group-id' });
      return;
    }
    const outcome = await groupCommandGate.runRegister(groupId, event.source?.userId, now);
    if (outcome.status === 'registered') {
      await replyText(event, NOTIFICATION_GROUP_REGISTERED(outcome.familyName));
    } else if (outcome.reason === 'ADMIN_ONLY') {
      await replyText(event, NOTIFICATION_GROUP_ADMIN_ONLY);
    } else {
      await replyText(event, getMessage(outcome.reason));
    }
    return;
  }
  if (isOneToOneRegisterRequest(event)) {
    await replyText(event, GROUP_REGISTER_IN_GROUP_ONLY);
  }
}
