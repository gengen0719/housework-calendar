import type { ChoreType } from '@housework/shared';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';

/**
 * F1: お手伝いの種類の一覧（C1 GET /chore-types）。家族のメンバー全員が見られる（BR5.11）。
 * 確かめの順番: requireAuth（入口）→ requireMembership。
 */
export async function listChoreTypes(auth: AuthContext): Promise<ChoreType[]> {
  const ctx = requireMembership(auth);
  return choreTypeService.list(ctx);
}
