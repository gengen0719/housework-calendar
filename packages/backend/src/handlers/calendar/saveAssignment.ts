import { ASSIGNMENT_MAX_CHORE_TYPES, jstDateOf, type MonthCalendar } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireMonthParam, uuidSchema } from './params';

const ruleRow = z.object({
  choreTypeId: uuidSchema,
  childUserId: uuidSchema,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
});

/**
 * PUT の本文。行は 200 まで、種類は 90 まで（割り当ての書き込みが 100 項目に必ず収まる）。
 * 知らない項目は捨てる（zod の既定の strip。familyId や version が付いていても読まない。NFR4.47）。
 */
export const assignmentBodySchema = z.object({
  rules: z
    .array(ruleRow)
    .max(200)
    .refine(
      (rows) => new Set(rows.map((row) => row.choreTypeId)).size <= ASSIGNMENT_MAX_CHORE_TYPES,
    ),
  confirmedChangesHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

export interface SaveAssignmentContext {
  now: Date;
  /** Lambda の残り時間（ミリ秒）。入口が渡す */
  remainingTimeMs?: () => number;
}

/**
 * F3: 割り当てを保存する（C1 PUT /months/:month/assignment）。管理者だけ（BR6.1）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → 月の形（422）→ 本文の大きさ（413）と形（422）→
 * 種類（404）→ 種類の「使わない」（422）→ 子供（404）→ 月の確定（409）→ 今月か来月か（422）→ 重なり（422）→ 上書きの確かめ（409）。
 * 本文は必要になった時点で読む（readBody）。
 */
export async function saveAssignment(
  auth: AuthContext,
  monthParam: string,
  readBody: () => unknown,
  context: SaveAssignmentContext,
): Promise<MonthCalendar> {
  const ctx = requireAdmin(requireMembership(auth));
  const month = requireMonthParam(monthParam);
  const parsed = assignmentBodySchema.safeParse(readBody());
  if (!parsed.success) throw new ApiError(422, 'INVALID_ASSIGNMENT');
  const result = await calendarService.saveAssignment(
    ctx,
    month,
    parsed.data.rules,
    parsed.data.confirmedChangesHash,
    jstDateOf(context.now),
    {
      now: context.now,
      ...(context.remainingTimeMs ? { remainingTimeMs: context.remainingTimeMs } : {}),
    },
  );
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'CHORE_TYPE_INACTIVE':
    case 'MONTH_NOT_EDITABLE':
      throw new ApiError(422, result.reason);
    case 'MONTH_CONFIRMED':
      throw new ApiError(409, 'MONTH_CONFIRMED');
    case 'ASSIGNMENT_OVERLAP':
      throw new ApiError(422, 'ASSIGNMENT_OVERLAP', { overlaps: result.overlaps });
    case 'OVERWRITE_CONFIRMATION_REQUIRED':
      throw new ApiError(409, 'OVERWRITE_CONFIRMATION_REQUIRED', {
        changes: result.changes,
        changesHash: result.changesHash,
      });
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
