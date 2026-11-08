import type { Role } from '@housework/shared';
import { ApiError } from '../lib/errors';
import * as familyMemberService from '../services/familyMemberService';
import { verifySession } from '../services/tokenService';

/** セッションを確かめた結果。家族と役割は利用者の記録から取る（URL や本文からは決めない。BR2.3）。 */
export interface AuthContext {
  userId: string;
  familyId?: string;
  role?: Role;
}

/** 関数 URL のヘッダー名は小文字で届くが、念のため大文字小文字を区別せずに探す。 */
function bearerToken(headers: Record<string, string | undefined> | undefined): string | undefined {
  if (!headers) return undefined;
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization');
  const match = /^Bearer\s+(\S+)$/i.exec(entry?.[1] ?? '');
  return match?.[1];
}

/**
 * 段階 1: セッションの JWT を確かめ、利用者を取り出す（BR2.2）。
 * ない・署名が合わない・期限切れ・方式が違う・記録がない: 401。ブロック中: 403 NOT_FRIEND（BR1.11）。
 */
export async function requireAuth(
  headers: Record<string, string | undefined> | undefined,
  signingSecret: string,
  now: Date = new Date(),
): Promise<AuthContext> {
  const token = bearerToken(headers);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED');
  const session = verifySession(token, signingSecret, now);
  if (!session.ok) throw new ApiError(401, 'UNAUTHENTICATED');
  const status = await familyMemberService.getUserStatus(session.value.userId);
  if (!status.ok) throw new ApiError(401, 'UNAUTHENTICATED');
  if (status.value.friendStatus === 'blocked') throw new ApiError(403, 'NOT_FRIEND');
  return {
    userId: session.value.userId,
    ...(status.value.familyId ? { familyId: status.value.familyId } : {}),
    ...(status.value.role ? { role: status.value.role } : {}),
  };
}
