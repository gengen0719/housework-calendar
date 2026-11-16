import { jstDateOf, monthOfDate } from '@housework/shared';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import { requireAdmin } from '../../middleware/requireAdmin';
import * as adjustments from '../../services/adjustmentService';
export function listAdjustments(auth: AuthContext, month: string, now: Date) {
  return adjustments.listAdjustments(
    requireAdmin(requireMembership(auth)),
    month === 'current' ? monthOfDate(jstDateOf(now)) : month,
    now,
  );
}
export function deleteAdjustment(auth: AuthContext, id: string, remainingTimeMs?: () => number) {
  return adjustments.deleteAdjustment(
    requireAdmin(requireMembership(auth)),
    id,
    remainingTimeMs ? { remainingTimeMs } : {},
  );
}
