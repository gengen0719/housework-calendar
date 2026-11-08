import { describe, expect, it } from 'vitest';
import {
  buildInvitationUrl,
  hashToken,
  isWellFormedToken,
  newInvitationToken,
  tokenPrefix,
} from '../../src/services/invitationTokenService';

describe('invitationTokenService: 招待の印', () => {
  it('作った印は 22 文字ちょうどで、[A-Za-z0-9_-] だけ', () => {
    for (let i = 0; i < 50; i++) {
      expect(newInvitationToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it('作るたびに違う印になる', () => {
    expect(new Set(Array.from({ length: 100 }, newInvitationToken)).size).toBe(100);
  });

  it('形の確かめ: 22 文字の正しい印は通る', () => {
    expect(isWellFormedToken('AbCdEfGhIjKlMnOpQrStUv')).toBe(true);
    expect(isWellFormedToken('-_-_-_-_-_-_-_-_-_-_09')).toBe(true);
  });

  it.each([
    ['短い', 'AbCdEfGhIjKlMnOpQrSt'],
    ['長い', 'AbCdEfGhIjKlMnOpQrStUvW'],
    ['空', ''],
    ['使えない文字', 'AbCdEfGhIjKlMnOpQrSt+/'],
    ['改行を含む', 'AbCdEfGhIjKlMnOpQrSt\nU'],
  ])('形の確かめ: %s は通らない', (_label, token) => {
    expect(isWellFormedToken(token)).toBe(false);
  });

  it('ログ用の先頭は 4 文字だけ', () => {
    expect(tokenPrefix('AbCdEfGhIjKlMnOpQrStUv')).toBe('AbCd');
  });

  it('SHA-256 は同じ印なら同じ、違う印なら違う値で、印そのものを含まない', () => {
    const hash = hashToken('AbCdEfGhIjKlMnOpQrStUv');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken('AbCdEfGhIjKlMnOpQrStUv'));
    expect(hash).not.toBe(hashToken('AbCdEfGhIjKlMnOpQrStUw'));
  });

  it('リンクは LIFF の URL に ?invitation=<印> を付ける', () => {
    expect(buildInvitationUrl('https://liff.line.me/1234-abcd', 'AbCdEfGhIjKlMnOpQrStUv')).toBe(
      'https://liff.line.me/1234-abcd?invitation=AbCdEfGhIjKlMnOpQrStUv',
    );
  });

  it('LIFF の URL にすでにクエリがあっても invitation を足す', () => {
    const url = new URL(
      buildInvitationUrl('https://liff.line.me/1234-abcd?x=1', 'AbCdEfGhIjKlMnOpQrStUv'),
    );
    expect(url.searchParams.get('x')).toBe('1');
    expect(url.searchParams.get('invitation')).toBe('AbCdEfGhIjKlMnOpQrStUv');
  });
});
