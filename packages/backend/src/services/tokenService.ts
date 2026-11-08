import { err, ok, type Result } from '@housework/shared';
import jwt from 'jsonwebtoken';

/** セッションの期限は 1 時間（NFR4.2） */
export const SESSION_TTL_SECONDS = 3600;

/** 署名の方式は HS256 だけ。作るときも確かめるときも決め打ちで、alg none を含む他の方式は断る。 */
const ALGORITHM = 'HS256';

export interface SessionToken {
  token: string;
  /** UTC の ISO 8601 */
  expiresAt: string;
}

/** セッションの JWT を作る。中身は `userId` と `exp` だけ（iat も入れない）。 */
export function signSession(userId: string, secret: string, now: Date = new Date()): SessionToken {
  const exp = Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS;
  const token = jwt.sign({ userId, exp }, secret, { algorithm: ALGORITHM, noTimestamp: true });
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** JWT を確かめる。署名・方式・期限のどれかが合わなければ UNAUTHENTICATED（理由は区別しない）。 */
export function verifySession(
  token: string,
  secret: string,
  now: Date = new Date(),
): Result<{ userId: string }, 'UNAUTHENTICATED'> {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: [ALGORITHM],
      clockTimestamp: Math.floor(now.getTime() / 1000),
    });
    if (typeof payload === 'string') return err('UNAUTHENTICATED');
    const { userId } = payload as { userId?: unknown };
    if (typeof userId !== 'string' || userId.length === 0) return err('UNAUTHENTICATED');
    return ok({ userId });
  } catch {
    return err('UNAUTHENTICATED');
  }
}
