import type { InvitationView } from '@housework/shared';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as familyMemberService from '../../services/familyMemberService';

/** F1: いま使える招待（C1 GET /family/invitation）。管理者だけ。なければ null（BR3.12）。 */
export async function getCurrentInvitation(
  auth: AuthContext,
  liffUrl: string,
  now: Date = new Date(),
): Promise<InvitationView | null> {
  const ctx = requireAdmin(requireMembership(auth));
  return familyMemberService.getCurrentInvitation(ctx, liffUrl, now);
}
