import type { InvitationPreview } from '@housework/shared';
import { ApiError } from '../../lib/errors';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/**
 * F5: 招待を開く（C1 GET /invitations/:token）。requireAuth のあと、家族のメンバーでなくてよい。
 * 本文・クエリは読まない。家族は招待の記録からだけ決める（NFR4.20）。
 */
export async function previewInvitation(
  auth: AuthContext,
  token: string,
  now: Date = new Date(),
): Promise<InvitationPreview> {
  const result = await familyMemberService.previewInvitation(auth.userId, token, now);
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'INVITATION_INVALID':
    case 'ALREADY_IN_OTHER_FAMILY':
    case 'ALREADY_IN_FAMILY':
      throw new ApiError(409, result.reason);
    case 'NOT_FRIEND':
      throw new ApiError(403, 'NOT_FRIEND');
    case 'NOT_FOUND':
      // セッションの確かめのあとで記録が消えることは通常ない。取り直しを促す
      throw new ApiError(401, 'UNAUTHENTICATED');
  }
}
