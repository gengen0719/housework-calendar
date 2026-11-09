import { jstDateOf, type MonthCalendar } from '@housework/shared';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireMonthParam } from './params';

/**
 * F4: 月のカレンダーを読む（C1 GET /months/:month/calendar）。家族のメンバー全員（子供も）が見られる（BR6.15）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → 月の形（422）。今日は日本時間の今日を応答に付ける。
 */
export async function getCalendar(
  auth: AuthContext,
  monthParam: string,
  now: Date,
): Promise<MonthCalendar> {
  const ctx = requireMembership(auth);
  const month = requireMonthParam(monthParam);
  return calendarService.getMonthCalendar(ctx, month, jstDateOf(now));
}
