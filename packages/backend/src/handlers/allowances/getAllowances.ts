import { jstDateOf, type AllowanceMonthView } from '@housework/shared';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as allowanceService from '../../services/allowanceService';
import { resolveMonthParam } from './params';

/**
 * GET /v1/months/:month/allowances の薄い入口（U9。F1〜F3）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → 月の形（422）。
 * 管理者でなくてよい（家族のメンバー全員が見られる。BR10.1、AC4.1.3）。
 * 読み取り専用の内部処理の文脈は受け取らない（NFR4.90）。
 * now は入口で 1 回取ったものを受け取る（端末の時計・new Date() の直接呼びを使わない）。
 */
export async function getAllowances(
  auth: AuthContext,
  monthParam: string,
  now: Date,
): Promise<AllowanceMonthView> {
  const ctx = requireMembership(auth);
  const month = resolveMonthParam(monthParam, now);
  return allowanceService.getAllowanceMonthView(ctx, month, {
    today: jstDateOf(now),
    emitLogs: false,
  });
}
