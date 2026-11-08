import type { ChoreType } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireIdempotencyKey } from '../../lib/idempotencyKey';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';

/**
 * 本文の形。値の確かめ（名前・単価・説明）は共有の関数で行う（choreTypeService）。
 * 知らない項目（familyId、choreTypeId、active、createdAt など）は捨てる。
 */
export const ChoreTypeBodySchema = z.object({
  name: z.unknown().optional(),
  unitPrice: z.unknown().optional(),
  description: z.unknown().optional(),
});

/**
 * F2: 種類を登録する（C1 POST /chore-types）。管理者だけ（BR5.1）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → Idempotency-Key の形 → 本文（422）→ 名前の重なり（409）。
 */
export async function createChoreType(
  auth: AuthContext,
  body: unknown,
  headers: Record<string, string | undefined> | undefined,
  now: Date = new Date(),
): Promise<ChoreType> {
  const ctx = requireAdmin(requireMembership(auth));
  const key = requireIdempotencyKey(headers);
  const parsed = ChoreTypeBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
  const result = await choreTypeService.create(
    ctx,
    {
      name: parsed.data.name,
      unitPrice: parsed.data.unitPrice,
      description: parsed.data.description,
    },
    key,
    now,
  );
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'INVALID_CHORE_TYPE_NAME':
    case 'INVALID_UNIT_PRICE':
    case 'INVALID_DESCRIPTION':
    case 'IDEMPOTENCY_KEY_REUSED':
      throw new ApiError(422, result.reason);
    case 'CHORE_TYPE_NAME_TAKEN':
      throw new ApiError(409, 'CHORE_TYPE_NAME_TAKEN', {
        conflictActive: result.conflictActive,
      });
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
