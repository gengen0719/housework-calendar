import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as lineApiService from '../../src/services/lineApiService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';

function stubFetch(handler: (url: string) => Response | Error) {
  const stub = vi.fn(async (input: string | URL | Request) => {
    const result = handler(String(input));
    if (result instanceof Error) throw result;
    return result;
  });
  vi.stubGlobal('fetch', stub);
  return stub;
}

describe('lineApiService.getGroupSummary', () => {
  beforeEach(() => {
    setupWorld();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('グループの名前を受け取れる', async () => {
    const stub = stubFetch(
      () => new Response(JSON.stringify({ groupId: 'C_g1', groupName: '山田家' }), { status: 200 }),
    );
    expect(await lineApiService.getGroupSummary('C_g1')).toEqual({
      ok: true,
      value: { groupName: '山田家' },
    });
    expect(String(stub.mock.calls[0]?.[0])).toBe('https://api.line.me/v2/bot/group/C_g1/summary');
  });

  it('打ち切りは 2000 ミリ秒（reply などは 5000 ミリ秒のまま）', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    stubFetch(() => new Response(JSON.stringify({ groupName: '山田家' }), { status: 200 }));
    await lineApiService.getGroupSummary('C_g1');
    expect(timeout).toHaveBeenLastCalledWith(2000);
    await lineApiService.reply('token', [{ type: 'text', text: 'x' }]);
    expect(timeout).toHaveBeenLastCalledWith(5000);
    expect(lineApiService.GROUP_SUMMARY_TIMEOUT_MS).toBe(2000);
  });

  it('時間切れは投げずに timeout の理由で返す', async () => {
    stubFetch(() => new DOMException('timed out', 'TimeoutError'));
    expect(await lineApiService.getGroupSummary('C_g1')).toEqual({ ok: false, reason: 'timeout' });
  });

  it('通信の失敗は connection', async () => {
    stubFetch(() => new TypeError('network down'));
    expect(await lineApiService.getGroupSummary('C_g1')).toEqual({
      ok: false,
      reason: 'connection',
    });
  });

  it('LINE が 404・500 を返したら http_<status>', async () => {
    stubFetch(() => new Response('{}', { status: 404 }));
    expect(await lineApiService.getGroupSummary('C_g1')).toEqual({ ok: false, reason: 'http_404' });
    stubFetch(() => new Response('{}', { status: 500 }));
    expect(await lineApiService.getGroupSummary('C_g1')).toEqual({ ok: false, reason: 'http_500' });
  });

  it('名前がない・空・文字でない応答は invalid', async () => {
    for (const body of [{}, { groupName: '' }, { groupName: 5 }]) {
      stubFetch(() => new Response(JSON.stringify(body), { status: 200 }));
      expect(await lineApiService.getGroupSummary('C_g1')).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
  });

  it('グループ ID は URL に載せる前にエスケープする', async () => {
    const stub = stubFetch(() => new Response('{}', { status: 404 }));
    await lineApiService.getGroupSummary('C/../x');
    expect(String(stub.mock.calls[0]?.[0])).toBe(
      'https://api.line.me/v2/bot/group/C%2F..%2Fx/summary',
    );
  });

  it('buildPostbackButtonMessage: postback のボタン 1 つの template を作る', () => {
    expect(
      lineApiService.buildPostbackButtonMessage({
        altText: 'a',
        text: 't',
        label: 'l',
        data: 'action=x',
      }),
    ).toEqual({
      type: 'template',
      altText: 'a',
      template: {
        type: 'buttons',
        text: 't',
        actions: [{ type: 'postback', label: 'l', data: 'action=x' }],
      },
    });
  });
});
