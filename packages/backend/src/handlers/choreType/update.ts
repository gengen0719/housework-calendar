import type { ChoreType } from '@housework/shared';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';
import { requireOwnedChoreType } from './choreTypeId';
import { ChoreTypeBodySchema } from './create';

/**
 * F3: 種類の名前・単価・説明を変える（C1 PUT /chore-types/:choreTypeId）。管理者だけ（BR5.1）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → ID の形（404）→ 種類（404）→ 本文（422）→ 名前の重なり（409）。
 */
export async function updateChoreType(
  auth: AuthContext,
  choreTypeId: string,
  body: unknown,
  now: Date = new Date(),
): Promise<ChoreType> {
  const ctx = requireAdmin(requireMembership(auth));
  const current = await requireOwnedChoreType(ctx, choreTypeId);
  const parsed = ChoreTypeBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
  const result = await choreTypeService.update(
    ctx,
    current,
    {
      name: parsed.data.name,
      unitPrice: parsed.data.unitPrice,
      description: parsed.data.description,
    },
    now,
  );
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'INVALID_CHORE_TYPE_NAME':
    case 'INVALID_UNIT_PRICE':
    case 'INVALID_DESCRIPTION':
      throw new ApiError(422, result.reason);
    case 'CHORE_TYPE_NAME_TAKEN':
      throw new ApiError(409, 'CHORE_TYPE_NAME_TAKEN', {
        conflictActive: result.conflictActive,
      });
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
