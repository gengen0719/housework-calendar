import type { Role } from '@housework/shared';
import { ApiError } from '../lib/errors';
import type { AuthContext } from './requireAuth';

/** 家族のデータを扱う操作が受け取る文脈（C6）。家族はセッションの利用者から決める。 */
export interface FamilyContext {
  familyId: string;
  userId: string;
  role: Role;
}

/** 段階 2: 家族のメンバーであることを確かめ、`ctx` を作る（BR2.3）。メンバーでなければ 403 NOT_FAMILY_MEMBER。 */
export function requireMembership(auth: AuthContext): FamilyContext {
  if (!auth.familyId || !auth.role) throw new ApiError(403, 'NOT_FAMILY_MEMBER');
  return { familyId: auth.familyId, userId: auth.userId, role: auth.role };
}
