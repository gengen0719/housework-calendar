import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure, getAllowances } from '../../src/api/client';
import { FAKE_SESSION_TOKEN } from '../fixtures/fakeSecrets';
import { view } from './helpers/view';
describe('お小遣いのクライアント', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('月のパスだけを要求し本文や家族のクエリを送らない', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(view())));
    vi.stubGlobal('fetch', fetcher);
    expect(await getAllowances(FAKE_SESSION_TOKEN, view().month)).toEqual(view());
    expect(fetcher).toHaveBeenCalledWith(`/v1/months/${view().month}/allowances`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${FAKE_SESSION_TOKEN}` },
    });
  });
  it('月を URL エンコードする', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await getAllowances(FAKE_SESSION_TOKEN, 'current /');
    expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/months/current%20%2F/allowances');
  });
  it('中断の signal を渡す', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await getAllowances(FAKE_SESSION_TOKEN, 'current', controller.signal);
    expect(fetcher.mock.calls[0]?.[1].signal).toBe(controller.signal);
  });
  it('認証エラーを共通の失敗として渡す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":{"reason":"NOT_FAMILY_MEMBER"}}', { status: 403 }),
        ),
    );
    await expect(getAllowances(FAKE_SESSION_TOKEN, 'current')).rejects.toMatchObject({
      status: 403,
      reason: 'NOT_FAMILY_MEMBER',
    });
  });
  it('通信エラーを共通の失敗として渡す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getAllowances(FAKE_SESSION_TOKEN, 'current')).rejects.toBeInstanceOf(ApiFailure);
  });
});
