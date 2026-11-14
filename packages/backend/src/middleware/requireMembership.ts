import type { Role } from '@housework/shared';
import { ApiError } from '../lib/errors';
import type { AuthContext } from './requireAuth';

/** 家族のデータを扱う操作が受け取る文脈（C6）。家族はセッションの利用者から決める。 */
export interface FamilyContext {
  familyId: string;
  userId: string;
  role: Role;
}

/** 家族だけを決める文脈。読み取りの窓口のうち、利用者を使わないものが受ける（U9）。 */
export interface FamilyScope {
  familyId: string;
}

/**
 * お知らせ用の裏側の文脈（U10 の月末のまとめ）。利用者も役割も持たない。
 * この型を作る関数は U10 が持つ。U9 は型だけで、handlers・entries/api.ts は使わない。
 */
export interface SystemContext extends FamilyScope {
  role: 'system';
}

/** 読み取りの窓口が受ける文脈。書き込みの窓口は FamilyContext のままで、system を渡すと tsc が落ちる。 */
export type ReadContext = FamilyContext | SystemContext;

/** 段階 2: 家族のメンバーであることを確かめ、`ctx` を作る（BR2.3）。メンバーでなければ 403 NOT_FAMILY_MEMBER。 */
export function requireMembership(auth: AuthContext): FamilyContext {
  if (!auth.familyId || !auth.role) throw new ApiError(403, 'NOT_FAMILY_MEMBER');
  return { familyId: auth.familyId, userId: auth.userId, role: auth.role };
}
