import type { Me } from '@housework/shared';
import { ApiError } from '../../lib/errors';
import type { AuthContext } from '../../middleware/requireAuth';
import * as familyMemberService from '../../services/familyMemberService';

/** F4: 最初の画面の情報（C1 GET /me）。家族に入っていなくても返す（BR1.6、BR1.10）。 */
export async function getMe(auth: AuthContext): Promise<Me> {
  const me = await familyMemberService.getMe(auth.userId);
  // セッションの確かめのあとで記録が消えることは通常ない。あれば取り直しを促す
  if (!me.ok) throw new ApiError(401, 'UNAUTHENTICATED');
  return me.value;
}
