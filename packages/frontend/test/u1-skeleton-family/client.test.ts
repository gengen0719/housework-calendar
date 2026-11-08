import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, createFamily, createSession, getMe } from '../../src/api/client';

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response> | Response) {
  const fn = vi.fn(async (input: string, init?: RequestInit) => impl(input, init));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api/client', () => {
  it('createSession は ID トークンを本文に入れて同じ生成元の道へ送る', async () => {
    const fn = stubFetch(() =>
      Response.json({ sessionToken: 't', expiresAt: 'x' }, { status: 201 }),
    );
    await expect(createSession('id-1')).resolves.toEqual({ sessionToken: 't', expiresAt: 'x' });
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/sessions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ idToken: 'id-1' });
  });

  it('getMe は Authorization: Bearer を付ける', async () => {
    const fn = stubFetch(() => Response.json({ userId: 'u', displayName: 'd', family: null }));
    await getMe('tok');
    const [, init] = fn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('createFamily は Idempotency-Key と名前を送る', async () => {
    const fn = stubFetch(() =>
      Response.json({ familyId: 'f', name: 'n', role: 'admin' }, { status: 201 }),
    );
    await createFamily('tok', '田中家', 'key-1');
    const [url, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/families');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-1');
    expect(JSON.parse(String(init.body))).toEqual({ name: '田中家' });
  });

  it('失敗の本文の理由の印を ApiFailure に入れる', async () => {
    stubFetch(() => Response.json({ error: { reason: 'ALREADY_IN_FAMILY' } }, { status: 409 }));
    await expect(createFamily('tok', 'x', 'k')).rejects.toMatchObject({
      status: 409,
      reason: 'ALREADY_IN_FAMILY',
    });
  });

  it('本文が読めない・知らない印の失敗は INTERNAL にする', async () => {
    stubFetch(() => new Response('<html>', { status: 502 }));
    await expect(getMe('tok')).rejects.toMatchObject({ status: 502, reason: 'INTERNAL' });
    stubFetch(() => Response.json({ error: { reason: 'WHO_KNOWS' } }, { status: 500 }));
    await expect(getMe('tok')).rejects.toMatchObject({ status: 500, reason: 'INTERNAL' });
  });

  it('通信そのものの失敗は status 0 の SERVICE_TEMPORARILY_UNAVAILABLE にする', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const error = await getMe('tok').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error).toMatchObject({ status: 0, reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' });
  });
});
