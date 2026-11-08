import type { CreateSessionResponse } from '@housework/shared';
import { z } from 'zod';
import type { AppConfig } from '../../lib/config';
import { ApiError } from '../../lib/errors';
import { describeError, logger } from '../../lib/logger';
import * as familyMemberService from '../../services/familyMemberService';
import * as lineApiService from '../../services/lineApiService';
import { signSession } from '../../services/tokenService';

export const CreateSessionBodySchema = z.object({
  idToken: z.string().min(1).max(8192),
});

/**
 * F3: セッションの発行（C2 POST /sessions）。
 * ID トークンを LINE で確かめ（BR2.1）、友だちであることを確かめて（BR1.5、BR1.11）、JWT を出す。
 */
export async function createSession(
  body: unknown,
  config: Pick<AppConfig, 'loginChannelId' | 'signingSecret'>,
  now: Date = new Date(),
): Promise<CreateSessionResponse> {
  const parsed = CreateSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, 'INTERNAL', { field: 'idToken' });
  }
  let verified: Awaited<ReturnType<typeof lineApiService.verifyIdToken>>;
  try {
    verified = await lineApiService.verifyIdToken(parsed.data.idToken, config.loginChannelId, now);
  } catch (cause) {
    if (cause instanceof lineApiService.LineApiError) {
      logger.error({
        event: 'LINE_API_UNAVAILABLE',
        step: 'verifyIdToken',
        ...describeError(cause),
      });
      throw new ApiError(503, 'SERVICE_TEMPORARILY_UNAVAILABLE');
    }
    throw cause;
  }
  if (!verified.ok) throw new ApiError(401, 'UNAUTHENTICATED');

  const resolved = await familyMemberService.resolveSessionUser(verified.value.sub, now);
  if (!resolved.ok) {
    if (resolved.reason === 'NOT_FRIEND') throw new ApiError(403, 'NOT_FRIEND');
    logger.error({ event: 'LINE_API_UNAVAILABLE', step: 'getProfile' });
    throw new ApiError(503, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  }
  const session = signSession(resolved.value.userId, config.signingSecret, now);
  logger.info({ event: 'SESSION_ISSUED', userId: resolved.value.userId });
  return { sessionToken: session.token, expiresAt: session.expiresAt };
}
