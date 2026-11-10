import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireMonthParam } from './params';

export interface ConfirmMonthContext {
  now: Date;
}

/**
 * F3: 月を確定する（C1 PUT /months/:month/confirmation）。管理者だけ（BR8.1）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → month の形（422 INVALID_MONTH。
 * DynamoDB を読む前）→ confirmMonth。本文は読まない（NFR4.68）。
 */
export async function confirmMonth(
  auth: AuthContext,
  monthParam: string,
  context: ConfirmMonthContext,
): Promise<Record<string, never>> {
  const ctx = requireAdmin(requireMembership(auth));
  const month = requireMonthParam(monthParam);
  await calendarService.confirmMonth(ctx, month, { now: context.now });
  return {};
}

/**
 * F4: 月の確定を取り消す（C1 DELETE /months/:month/confirmation）。管理者だけ（BR8.1）。
 * 確かめの順番は confirmMonth と同じ。本文は読まない。
 */
export async function unconfirmMonth(
  auth: AuthContext,
  monthParam: string,
): Promise<Record<string, never>> {
  const ctx = requireAdmin(requireMembership(auth));
  const month = requireMonthParam(monthParam);
  await calendarService.unconfirmMonth(ctx, month);
  return {};
}
