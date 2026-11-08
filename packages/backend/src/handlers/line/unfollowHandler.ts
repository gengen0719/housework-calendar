import { logger } from '../../lib/logger';
import * as familyMemberService from '../../services/familyMemberService';
import type { LineEvent } from './types';

/** F2: ブロック。「ブロック中」と記録するだけで、返事はしない（BR1.3）。 */
export async function handleUnfollow(event: LineEvent, now: Date = new Date()): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) {
    logger.warn({ event: 'LINE_EVENT_SKIPPED', type: 'unfollow', reason: 'no-user-id' });
    return;
  }
  await familyMemberService.markBlocked(lineUserId, now);
  logger.info({ event: 'LINE_EVENT_PROCESSED', type: 'unfollow', result: 'blocked' });
}
