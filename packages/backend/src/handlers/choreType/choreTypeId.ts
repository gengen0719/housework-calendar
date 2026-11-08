import { ApiError } from '../../lib/errors';
import type { FamilyContext } from '../../middleware/requireMembership';
import type { ChoreTypeRecord } from '../../models';
import * as choreTypeService from '../../services/choreTypeService';

/** 種類の ID の形（UUID。crypto.randomUUID() で作る）。合わなければ DynamoDB を読まずに 404（security-design.md）。 */
const CHORE_TYPE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * パスの ID の形を確かめ、自分の家族の種類を読む。形が違う・ない・ほかの家族の種類は、どれも同じ 404 NOT_FOUND
 * （本文の確かめより先。ほかの家族の種類があることを 422・409 で漏らさない。BR5.10、NFR4.36）。
 */
export async function requireOwnedChoreType(
  ctx: FamilyContext,
  choreTypeId: string,
): Promise<ChoreTypeRecord> {
  if (!CHORE_TYPE_ID.test(choreTypeId)) throw new ApiError(404, 'NOT_FOUND');
  const record = await choreTypeService.get(ctx, choreTypeId);
  if (!record) throw new ApiError(404, 'NOT_FOUND');
  return record;
}
