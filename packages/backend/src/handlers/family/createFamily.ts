import type { CreateFamilyResponse } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireIdempotencyKey } from '../../lib/idempotencyKey';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/** 本文の name が文字列でなければ、名前の決まりに合わないものとして扱う（BR1.9）。 */
const BodySchema = z.object({ name: z.string() });

/**
 * F5: 家族を作る（C1 POST /families）。requireAuth のあと、requireMembership は通さない（まだ家族がない人の操作）。
 * Idempotency-Key（UUID）がなければ 400（NFR4.10）。
 */
export async function createFamily(
  auth: AuthContext,
  body: unknown,
  headers: Record<string, string | undefined> | undefined,
  now: Date = new Date(),
): Promise<CreateFamilyResponse> {
  const key = requireIdempotencyKey(headers);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'INVALID_FAMILY_NAME');
  const result = await familyMemberService.createFamily(auth.userId, parsed.data.name, key, now);
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'INVALID_FAMILY_NAME':
      throw new ApiError(422, 'INVALID_FAMILY_NAME');
    case 'ALREADY_IN_FAMILY':
      throw new ApiError(409, 'ALREADY_IN_FAMILY');
    case 'IDEMPOTENCY_KEY_REUSED':
      throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
    case 'NOT_FOUND':
      // セッションの確かめのあとで記録が消えることは通常ない。取り直しを促す
      throw new ApiError(401, 'UNAUTHENTICATED');
  }
}
