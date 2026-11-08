import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/errors';
import { requireAuth } from '../../src/middleware/requireAuth';
import { signSession } from '../../src/services/tokenService';
import { setupWorld, SIGNING_SECRET } from './helpers/world';

const NOW = new Date('2026-11-01T00:00:00.000Z');

let world: ReturnType<typeof setupWorld>;

function seedUser(overrides: Record<string, unknown> = {}): void {
  world.users.set('user-1', {
    userId: 'user-1',
    lineUserId: 'U_1',
    displayName: '花子',
    friendStatus: 'friend',
    familyId: 'fam-1',
    role: 'child',
    registeredAt: '2026-11-01T00:00:00.000Z',
    friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });
}

async function rejection(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('断られるはずが通った');
}

const bearer = (userId = 'user-1', now = NOW) => ({
  authorization: `Bearer ${signSession(userId, SIGNING_SECRET, now).token}`,
});

beforeEach(() => {
  world = setupWorld();
});

describe('requireAuth', () => {
  it('正しいセッションなら利用者の ID と家族と役割を返す', async () => {
    seedUser();
    expect(await requireAuth(bearer(), SIGNING_SECRET, NOW)).toEqual({
      userId: 'user-1',
      familyId: 'fam-1',
      role: 'child',
    });
  });

  it('家族に入っていない人は familyId と role を持たない', async () => {
    seedUser({ familyId: undefined, role: undefined });
    expect(await requireAuth(bearer(), SIGNING_SECRET, NOW)).toEqual({ userId: 'user-1' });
  });

  it('ヘッダー名の大文字小文字と Bearer の書き方の違いを許す', async () => {
    seedUser();
    const token = signSession('user-1', SIGNING_SECRET, NOW).token;
    const auth = await requireAuth({ Authorization: `bearer ${token}` }, SIGNING_SECRET, NOW);
    expect(auth.userId).toBe('user-1');
  });

  it('ヘッダーがない・Bearer でない・トークンが空なら 401', async () => {
    seedUser();
    for (const headers of [
      undefined,
      {},
      { authorization: 'Basic abc' },
      { authorization: 'Bearer ' },
    ]) {
      const error = await rejection(requireAuth(headers, SIGNING_SECRET, NOW));
      expect([error.status, error.reason]).toEqual([401, 'UNAUTHENTICATED']);
    }
  });

  it('期限切れのセッションは 401', async () => {
    seedUser();
    const later = new Date(NOW.getTime() + 61 * 60_000);
    const error = await rejection(requireAuth(bearer(), SIGNING_SECRET, later));
    expect([error.status, error.reason]).toEqual([401, 'UNAUTHENTICATED']);
  });

  it('署名が合わないセッションは 401', async () => {
    seedUser();
    const forged = {
      authorization: `Bearer ${signSession('user-1', 'other-secret-0123456789', NOW).token}`,
    };
    const error = await rejection(requireAuth(forged, SIGNING_SECRET, NOW));
    expect(error.status).toBe(401);
  });

  it('記録のない利用者のセッションは 401', async () => {
    const error = await rejection(requireAuth(bearer('ghost'), SIGNING_SECRET, NOW));
    expect([error.status, error.reason]).toEqual([401, 'UNAUTHENTICATED']);
  });

  it('ブロック中の利用者は 403 NOT_FRIEND', async () => {
    seedUser({ friendStatus: 'blocked' });
    const error = await rejection(requireAuth(bearer(), SIGNING_SECRET, NOW));
    expect([error.status, error.reason]).toEqual([403, 'NOT_FRIEND']);
  });
});
