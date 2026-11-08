import { describe, expect, it } from 'vitest';
import { getRawBody, verifyLineSignature } from '../../src/middleware/verifyLineSignature';
import { CHANNEL_SECRET, sign } from './helpers/world';

const body = Buffer.from(JSON.stringify({ events: [{ type: 'follow', text: '花子' }] }), 'utf8');

describe('verifyLineSignature', () => {
  it('正しい署名は通る', () => {
    expect(verifyLineSignature(body, sign(body), CHANNEL_SECRET)).toBe(true);
  });

  it('別のチャネルシークレットで作った署名は断る', () => {
    expect(verifyLineSignature(body, sign(body, 'other-secret'), CHANNEL_SECRET)).toBe(false);
  });

  it('本文が書き換えられていたら断る', () => {
    const tampered = Buffer.from(body.toString('utf8').replace('花子', '太郎'), 'utf8');
    expect(verifyLineSignature(tampered, sign(body), CHANNEL_SECRET)).toBe(false);
  });

  it('署名のヘッダーがなければ断る', () => {
    expect(verifyLineSignature(body, undefined, CHANNEL_SECRET)).toBe(false);
    expect(verifyLineSignature(body, '', CHANNEL_SECRET)).toBe(false);
  });

  it('長さが違う署名は例外にならず断る', () => {
    expect(verifyLineSignature(body, 'c2hvcnQ=', CHANNEL_SECRET)).toBe(false);
  });

  it('チャネルシークレットが空なら断る', () => {
    expect(verifyLineSignature(body, sign(body, ''), '')).toBe(false);
  });

  it('Base64 で届いた本文は元のバイト列に戻して確かめる', () => {
    const encoded = body.toString('base64');
    const raw = getRawBody({ body: encoded, isBase64Encoded: true });
    expect(raw.equals(body)).toBe(true);
    expect(verifyLineSignature(raw, sign(body), CHANNEL_SECRET)).toBe(true);
  });

  it('Base64 でない本文と、本文がない場合を扱える', () => {
    expect(getRawBody({ body: 'abc', isBase64Encoded: false }).toString('utf8')).toBe('abc');
    expect(getRawBody({ body: undefined, isBase64Encoded: false }).length).toBe(0);
  });
});
