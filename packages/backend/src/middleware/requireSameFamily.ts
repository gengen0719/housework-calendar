import { ApiError } from '../lib/errors';
import type { FamilyContext } from './requireMembership';

/**
 * URL や本文で指定された ID の持ち主の家族が、セッションの利用者の家族かを確かめる（BR2.5）。
 * 持ち主が見つからない場合（undefined）も、ほかの家族の場合も、同じ 404 NOT_FOUND で断る
 * （ほかの家族のデータがあることを知らせない）。
 */
export function requireSameFamily(ctx: FamilyContext, ownerFamilyId: string | undefined): void {
  if (ownerFamilyId === undefined || ownerFamilyId !== ctx.familyId) {
    throw new ApiError(404, 'NOT_FOUND');
  }
}
