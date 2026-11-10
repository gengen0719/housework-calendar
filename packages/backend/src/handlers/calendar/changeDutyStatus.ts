import type { Duty } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireDutyIdParam } from './params';

/**
 * 本文は action と version だけ。status・recordedAt・recordedBy・unitPrice などの余分な項目は strip で捨てる（NFR4.67）。
 * version は 0 以上の安全な整数。
 */
export const statusChangeBodySchema = z.object({
  action: z.enum(['cancel', 'markDone', 'markSkipped', 'unmarkSkipped']),
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export interface ChangeDutyStatusContext {
  now: Date;
}

/**
 * F2: 担当の状態を変える（C1 POST /duties/:dutyId/status）。管理者だけ（BR8.1）。
 * 確かめの順番（security-design.md、NFR4.65〜NFR4.67）: requireAuth（入口）→ requireMembership → requireAdmin
 * （子供は 403 ADMIN_ONLY。DynamoDB を読まない）→ 本文の形（422 INVALID_REQUEST。担当を探す前。BR8.2）→
 * dutyId の形（404）→ changeDutyStatus（担当の 404、月の 409、表の 409、500）。
 */
export async function changeDutyStatus(
  auth: AuthContext,
  dutyIdParam: string,
  readBody: () => unknown,
  context: ChangeDutyStatusContext,
): Promise<Duty> {
  const ctx = requireAdmin(requireMembership(auth));
  const parsed = statusChangeBodySchema.safeParse(readBody());
  if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
  const dutyId = requireDutyIdParam(dutyIdParam);
  const result = await calendarService.changeDutyStatus(ctx, dutyId, parsed.data.action, {
    now: context.now,
    version: parsed.data.version,
  });
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'MONTH_CONFIRMED':
    case 'INVALID_TRANSITION':
      throw new ApiError(409, result.reason);
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
