import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import { requireAdmin } from '../../middleware/requireAdmin';
import { requireIdempotencyKey } from '../../lib/idempotencyKey';
import { createAdjustment } from '../../services/adjustmentService';
export async function addAdjustment(
  auth: AuthContext,
  month: string,
  readBody: () => unknown,
  headers: Record<string, string | undefined>,
  now: Date,
  remainingTimeMs?: () => number,
) {
  const ctx = requireAdmin(requireMembership(auth));
  const key = requireIdempotencyKey(headers);
  return createAdjustment(ctx, month, readBody(), key, {
    now,
    ...(remainingTimeMs ? { remainingTimeMs } : {}),
  });
}
