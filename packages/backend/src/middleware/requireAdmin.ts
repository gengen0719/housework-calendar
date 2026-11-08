import { ApiError } from '../lib/errors';
import type { FamilyContext } from './requireMembership';

/** 管理者の操作に重ねる確かめ（BR2.4）。管理者でなければ 403 ADMIN_ONLY。 */
export function requireAdmin(ctx: FamilyContext): FamilyContext {
  if (ctx.role !== 'admin') throw new ApiError(403, 'ADMIN_ONLY');
  return ctx;
}
