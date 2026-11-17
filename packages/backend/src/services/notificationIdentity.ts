import { createHash, createHmac } from 'node:crypto';
import type { NotificationTrigger } from '@housework/shared';
/** 通知のキーは環境も含め、LINEのUUID形式にする。運用の匿名識別とは別。 */
export function notificationKey(
  env: string,
  familyId: string,
  trigger: NotificationTrigger,
): string {
  const bytes = createHash('sha256')
    .update(JSON.stringify([env, familyId, trigger.kind, trigger.targetDate]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function familyRef(familyId: string, secret: string): string {
  if (!secret) throw new Error('MISSING_OPERATIONAL_KEY');
  return createHmac('sha256', secret).update(familyId).digest('hex').slice(0, 24);
}
