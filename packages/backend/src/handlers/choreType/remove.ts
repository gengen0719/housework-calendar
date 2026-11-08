import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';
import { requireOwnedChoreType } from './choreTypeId';

/**
 * F5: 種類を消す（C1 DELETE /chore-types/:choreTypeId）。管理者だけ（BR5.9）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → ID の形（404）→ 種類（404）→
 * 使わないにする → C8 の確かめ（409 CHORE_TYPE_IN_USE）→ 消す（409 CHORE_TYPE_STATE_CHANGED）。
 */
export async function removeChoreType(
  auth: AuthContext,
  choreTypeId: string,
  now: Date = new Date(),
): Promise<void> {
  const ctx = requireAdmin(requireMembership(auth));
  await requireOwnedChoreType(ctx, choreTypeId);
  const result = await choreTypeService.remove(ctx, choreTypeId, now);
  if (result.ok) return;
  switch (result.reason) {
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'CHORE_TYPE_IN_USE':
    case 'CHORE_TYPE_STATE_CHANGED':
      throw new ApiError(409, result.reason);
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
