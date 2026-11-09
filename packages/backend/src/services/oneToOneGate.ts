import type { FamilyContext } from '../middleware/requireMembership';
import * as familyMemberService from './familyMemberService';

/**
 * 1 対 1 の入口の結果（security-design.md「1 対 1 の入口で利用者を決める」、NFR4.56、BR7.1）。
 * - child: 友だちで、家族に入っていて、役割が子供。記録に進む
 * - admin: 友だちで、家族に入っていて、役割が管理者。記録のメニューの案内を返す
 * - outsider: 記録なし・ブロック中・家族なし・役割が子供でも管理者でもない・lineUserId なし。参加の案内を返す
 */
export type OneToOneAuthResult =
  { kind: 'child'; ctx: FamilyContext } | { kind: 'admin' } | { kind: 'outsider' };

/**
 * source.userId の利用者を 1 つの結果に分ける（judgeRegister と同じ考えで、子供を通す別の小さな入口）。
 * findUserByLineId（lineUserId-index の Query。読むだけで利用者は作らない）の結果だけから決める。
 * 家族・役割はイベントや postback の data からは決めない。LINE のプロフィール取得は呼ばない（NFR2.38）。
 */
export async function authorizeChild(lineUserId: string | undefined): Promise<OneToOneAuthResult> {
  if (!lineUserId) return { kind: 'outsider' };
  const found = await familyMemberService.findUserByLineId(lineUserId);
  if (!found.ok) return { kind: 'outsider' };
  const user = found.value;
  if (user.friendStatus !== 'friend' || !user.familyId) return { kind: 'outsider' };
  if (user.role === 'child') {
    return {
      kind: 'child',
      ctx: { familyId: user.familyId, userId: user.userId, role: 'child' },
    };
  }
  if (user.role === 'admin') return { kind: 'admin' };
  return { kind: 'outsider' };
}
