import { logger } from '../../lib/logger';
import * as familyMemberService from '../../services/familyMemberService';
import type { LineEvent } from './types';

/**
 * F3: 公式アカウントがグループから外された。お知らせ先のグループなら解除する（BR4.9）。返事はしない
 * （reply トークンもなく、グループにはもう送れない）。room とお知らせ先でないグループでは何も変わらない。
 * 解除の失敗は投げる（入口が 500 にして、LINE の再送で処理し直す）。
 */
export async function handleLeave(event: LineEvent): Promise<void> {
  const groupId = event.source?.type === 'group' ? event.source.groupId : undefined;
  if (!groupId) {
    logger.info({ event: 'LINE_EVENT_IGNORED', type: 'leave', sourceType: event.source?.type });
    return;
  }
  await familyMemberService.unregisterNotificationGroupByGroup(groupId, event.timestamp);
}
