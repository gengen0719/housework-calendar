import type { InvitationView } from '@housework/shared';
import { ApiError } from '../../lib/errors';
import { requireIdempotencyKey } from '../../lib/idempotencyKey';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as familyMemberService from '../../services/familyMemberService';

/**
 * F2: 招待を作る・作り直す（C1 POST /family/invitations）。管理者だけ（BR3.1）。
 * 本文は受け取らない（家族はセッションの利用者から決める。NFR4.20）。Idempotency-Key（UUID）は必須。
 */
export async function createInvitation(
  auth: AuthContext,
  headers: Record<string, string | undefined> | undefined,
  liffUrl: string,
  now: Date = new Date(),
): Promise<InvitationView> {
  const ctx = requireAdmin(requireMembership(auth));
  const key = requireIdempotencyKey(headers);
  const result = await familyMemberService.createInvitation(ctx, key, liffUrl, now);
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'IDEMPOTENCY_KEY_REUSED':
      throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
