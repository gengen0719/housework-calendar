import type { AssignmentView } from '@housework/shared';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireMonthParam } from './params';

/**
 * F3: 今の割り当てを読む（C1 GET /months/:month/assignment）。家族のメンバー全員が見られる（BR6.15）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → 月の形（422）。
 */
export async function getAssignment(
  auth: AuthContext,
  monthParam: string,
): Promise<AssignmentView> {
  const ctx = requireMembership(auth);
  const month = requireMonthParam(monthParam);
  return calendarService.getAssignment(ctx, month);
}
