import { getMessage } from '@housework/shared';
import { logger } from '../lib/logger';
import type { FamilyContext } from '../middleware/requireMembership';
import * as familyMemberService from './familyMemberService';

/**
 * 登録の操作の確かめ（security-design.md の「グループの操作の入口」2、BR4.3、BR4.4）。
 * 家族はまだ決めない。source.userId の利用者が、友だちで、家族に入っていて、管理者のときだけ ctx を返す。
 * 利用者の記録がない・ブロック中・家族に入っていない・子供・source.userId がない人は、どれも null
 * （断る文言は同じ。家族の情報は返さない）。
 */
export async function authorizeRegister(
  lineUserId: string | undefined,
): Promise<FamilyContext | null> {
  return (await judgeRegister(lineUserId)).ctx ?? null;
}

async function judgeRegister(
  lineUserId: string | undefined,
): Promise<{ ctx?: FamilyContext; userId?: string }> {
  if (!lineUserId) return {};
  const found = await familyMemberService.findUserByLineId(lineUserId);
  if (!found.ok) return {};
  const user = found.value;
  if (user.friendStatus !== 'friend' || !user.familyId || user.role !== 'admin') {
    return { userId: user.userId };
  }
  return { ctx: { familyId: user.familyId, userId: user.userId, role: 'admin' } };
}

export type GateRejection = 'GROUP_NOT_REGISTERED' | 'NOT_FAMILY_MEMBER';

export type GateOutcome<T> =
  { status: 'done'; value: T } | { status: 'rejected'; reason: GateRejection; message: string };

/**
 * 登録以外のグループの操作の入口（security-design.md の「グループの操作の入口」3、4、BR4.10）。U8 の「代わって」はここに操作を差し込む。
 * 1. findFamilyByGroup で家族を決める。登録されていなければ GROUP_NOT_REGISTERED（操作は呼ばない）
 * 2. source.userId の利用者が友だちで、その家族のメンバーのときだけ、ctx = { familyId, userId, role } で操作を呼ぶ。違えば NOT_FAMILY_MEMBER
 * 断るときの message は決まった文だけで、家族の名前・メンバー・担当を入れない。呼び出し側は message をそのまま reply する。
 * source.type が group かどうかの確かめは呼び出し側（1 対 1 は案内、room は何もしない）。
 */
export async function runGroupOperation<T>(
  groupId: string,
  lineUserId: string | undefined,
  operation: (ctx: FamilyContext) => Promise<T>,
): Promise<GateOutcome<T>> {
  const reject = (reason: GateRejection, userId?: string): GateOutcome<T> => {
    logger.info({
      event: 'GROUP_COMMAND_REJECTED',
      groupId,
      reason,
      ...(userId ? { userId } : {}),
    });
    return { status: 'rejected', reason, message: getMessage(reason) };
  };

  const group = await familyMemberService.findFamilyByGroup(groupId);
  if (!group.ok) return reject('GROUP_NOT_REGISTERED');

  const found = lineUserId ? await familyMemberService.findUserByLineId(lineUserId) : undefined;
  if (!found?.ok) return reject('NOT_FAMILY_MEMBER');
  const user = found.value;
  if (user.friendStatus !== 'friend' || user.familyId !== group.value.familyId || !user.role) {
    return reject('NOT_FAMILY_MEMBER', user.userId);
  }
  const ctx: FamilyContext = {
    familyId: group.value.familyId,
    userId: user.userId,
    role: user.role,
  };
  return { status: 'done', value: await operation(ctx) };
}

export type RegisterOutcome =
  | { status: 'registered'; familyName: string }
  | { status: 'rejected'; reason: 'ADMIN_ONLY' | 'GROUP_USED_BY_OTHER_FAMILY' | 'INTERNAL' };

/**
 * グループでの登録の操作を通す。確かめ（authorizeRegister）→ 登録（registerNotificationGroup）の順。
 * 断ったときは、LINE に返す文言を選べるよう理由を返す（NOTIFICATION_GROUP_REJECTED を残す）。
 */
export async function runRegister(
  groupId: string,
  lineUserId: string | undefined,
  now: Date = new Date(),
): Promise<RegisterOutcome> {
  const { ctx, userId } = await judgeRegister(lineUserId);
  if (!ctx) {
    logger.info({
      event: 'NOTIFICATION_GROUP_REJECTED',
      groupId,
      ...(userId ? { userId } : {}),
      reason: 'ADMIN_ONLY',
    });
    return { status: 'rejected', reason: 'ADMIN_ONLY' };
  }
  const result = await familyMemberService.registerNotificationGroup(ctx, groupId, now);
  if (result.ok) return { status: 'registered', familyName: result.value.familyName };
  if (result.reason !== 'INTERNAL') {
    logger.info({
      event: 'NOTIFICATION_GROUP_REJECTED',
      groupId,
      userId: ctx.userId,
      reason: result.reason,
    });
  }
  return { status: 'rejected', reason: result.reason };
}
