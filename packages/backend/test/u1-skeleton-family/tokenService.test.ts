import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { SESSION_TTL_SECONDS, signSession, verifySession } from '../../src/services/tokenService';

const SECRET = 'test-signing-secret-0123456789abcdef'; // gitleaks:allow テスト用の作り物の鍵
const NOW = new Date('2026-11-01T00:00:00.000Z');

function decode(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1] as string, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

describe('tokenService', () => {
  it('HS256 で署名し、中身は userId と exp だけにする', () => {
    const { token } = signSession('user-1', SECRET, NOW);
    const header = JSON.parse(Buffer.from(token.split('.')[0] as string, 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(Object.keys(decode(token)).sort()).toEqual(['exp', 'userId']);
  });

  it('期限は 1 時間後で、expiresAt と exp が一致する', () => {
    const { token, expiresAt } = signSession('user-1', SECRET, NOW);
    expect(SESSION_TTL_SECONDS).toBe(3600);
    expect(decode(token).exp).toBe(NOW.getTime() / 1000 + 3600);
    expect(expiresAt).toBe('2026-11-01T01:00:00.000Z');
  });

  it('作ったトークンは期限内なら確かめを通り、userId が取れる', () => {
    const { token } = signSession('user-1', SECRET, NOW);
    const result = verifySession(token, SECRET, new Date(NOW.getTime() + 59 * 60_000));
    expect(result).toEqual({ ok: true, value: { userId: 'user-1' } });
  });

  it('期限を過ぎたトークンは UNAUTHENTICATED', () => {
    const { token } = signSession('user-1', SECRET, NOW);
    const result = verifySession(token, SECRET, new Date(NOW.getTime() + 3601_000));
    expect(result).toEqual({ ok: false, reason: 'UNAUTHENTICATED' });
  });

  it('別の鍵で署名されたトークンは UNAUTHENTICATED', () => {
    const { token } = signSession('user-1', 'another-secret-0123456789abcdef', NOW);
    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  it('alg none のトークンは断る', () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ userId: 'user-1', exp: NOW.getTime() / 1000 + 60 })}.`;
    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  it('HS256 以外（HS384）で同じ鍵で署名したトークンも断る', () => {
    const token = jwt.sign({ userId: 'user-1', exp: NOW.getTime() / 1000 + 60 }, SECRET, {
      algorithm: 'HS384',
    });
    expect(verifySession(token, SECRET, NOW).ok).toBe(false);
  });

  it('userId がない・文字列でない中身のトークンは断る', () => {
    const exp = NOW.getTime() / 1000 + 60;
    const noUser = jwt.sign({ exp }, SECRET, { algorithm: 'HS256' });
    const badUser = jwt.sign({ userId: 123, exp }, SECRET, { algorithm: 'HS256' });
    expect(verifySession(noUser, SECRET, NOW).ok).toBe(false);
    expect(verifySession(badUser, SECRET, NOW).ok).toBe(false);
  });

  it('壊れた文字列や文字列だけの中身は断る', () => {
    expect(verifySession('not-a-jwt', SECRET, NOW).ok).toBe(false);
    expect(verifySession('', SECRET, NOW).ok).toBe(false);
    const stringPayload = jwt.sign('plain-text', SECRET, { algorithm: 'HS256' });
    expect(verifySession(stringPayload, SECRET, NOW).ok).toBe(false);
  });
});
