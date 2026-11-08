import type { MeFamily } from '@housework/shared';
import { ApiError } from '../../lib/errors';
import { requireIdempotencyKey } from '../../lib/idempotencyKey';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/**
 * F6: 招待に参加する（C1 POST /invitations/:token/accept）。requireAuth のあと、家族のメンバーでなくてよい。
 * 本文は読まない（家族は招待の記録からだけ決める。NFR4.20）。Idempotency-Key（UUID）は必須。
 */
export async function acceptInvitation(
  auth: AuthContext,
  token: string,
  headers: Record<string, string | undefined> | undefined,
  now: Date = new Date(),
): Promise<MeFamily> {
  const key = requireIdempotencyKey(headers);
  const result = await familyMemberService.acceptInvitation(auth.userId, token, key, now);
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'INVITATION_INVALID':
    case 'ALREADY_IN_OTHER_FAMILY':
    case 'ALREADY_IN_FAMILY':
      throw new ApiError(409, result.reason);
    case 'IDEMPOTENCY_KEY_REUSED':
      throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
    case 'NOT_FRIEND':
      throw new ApiError(403, 'NOT_FRIEND');
    case 'NOT_FOUND':
      throw new ApiError(401, 'UNAUTHENTICATED');
  }
}
