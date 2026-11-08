import type { ChoreType } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';
import { requireOwnedChoreType } from './choreTypeId';

/** PATCH の本文は `active`（真偽値）だけ。"false" や 0 は受けない（z.boolean。逆に切り替わらないため）。ほかの項目は捨てる。 */
const SetActiveBodySchema = z.object({ active: z.boolean() });

/**
 * F4: 「使わない」「使う」を切り替える（C1 PATCH /chore-types/:choreTypeId）。管理者だけ（BR5.8）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → ID の形（404）→ 種類（404）→ 本文の active（422）。
 */
export async function setChoreTypeActive(
  auth: AuthContext,
  choreTypeId: string,
  body: unknown,
  now: Date = new Date(),
): Promise<ChoreType> {
  const ctx = requireAdmin(requireMembership(auth));
  await requireOwnedChoreType(ctx, choreTypeId);
  const parsed = SetActiveBodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
  const result = await choreTypeService.setActive(ctx, choreTypeId, parsed.data.active, now);
  if (result.ok) return result.value;
  throw new ApiError(404, 'NOT_FOUND');
}
