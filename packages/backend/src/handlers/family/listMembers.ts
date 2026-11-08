import type { Member } from '@housework/shared';
import { requireMembership } from '../../middleware/requireMembership';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/** F1: 家族のメンバーの一覧（C1 GET /family/members）。管理者も子供も見られる（BR3.11）。家族はセッションの利用者から決める。 */
export async function listMembers(auth: AuthContext): Promise<Member[]> {
  return familyMemberService.listMembers(requireMembership(auth));
}
