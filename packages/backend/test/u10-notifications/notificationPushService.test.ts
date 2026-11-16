import { afterEach, describe, expect, it, vi } from 'vitest';
import * as line from '../../src/services/lineApiService';
import { pushNotification } from '../../src/services/notificationPushService';
import {
  FAKE_U10_GROUP_ID,
  FAKE_U10_RETRY_KEY,
  FAKE_U10_REQUEST_ID,
} from '../fixtures/fakeSecrets';
afterEach(() => vi.restoreAllMocks());
describe('外部受理の分類', () => {
  it('200は一回だけ受理', async () => {
    const call = vi.spyOn(line, 'callLine').mockResolvedValue(new Response('', { status: 200 }));
    expect((await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).accepted).toBe(
      true,
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]?.[2]).toBe(5000);
  });
  it.each([400, 401, 403, 404, 409])('%sは恒久失敗', async (status) => {
    vi.spyOn(line, 'callLine').mockResolvedValue(new Response('', { status }));
    expect(await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).toMatchObject({
      accepted: false,
      retryable: false,
    });
  });
  it.each([429, 500, 502, 503])('%sは再試行可能', async (status) => {
    vi.spyOn(line, 'callLine').mockResolvedValue(
      new Response('', { status, headers: { 'retry-after': '10' } }),
    );
    expect(await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).toMatchObject({
      accepted: false,
      retryable: true,
      retryAfterMs: 10000,
    });
  });
  it('受理済み識別子がなければ409は成功でない', async () => {
    vi.spyOn(line, 'callLine').mockResolvedValue(
      new Response('', { status: 409, headers: { 'x-line-accepted-request-id': 'bad\tvalue' } }),
    );
    expect((await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).accepted).toBe(
      false,
    );
  });
  it('同じキーの受理済みを返す', async () => {
    vi.spyOn(line, 'callLine').mockResolvedValue(
      new Response('', {
        status: 409,
        headers: { 'x-line-accepted-request-id': FAKE_U10_REQUEST_ID },
      }),
    );
    expect(await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).toEqual({
      accepted: true,
      providerRequestId: FAKE_U10_REQUEST_ID,
    });
  });
  it('接続切断は曖昧な結果', async () => {
    vi.spyOn(line, 'callLine').mockRejectedValue(new Error('secret external body'));
    expect(await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).toEqual({
      accepted: false,
      retryable: true,
      reason: 'connection',
      ambiguous: true,
    });
  });
  it('時間切れを区別する', async () => {
    vi.spyOn(line, 'callLine').mockRejectedValue(new line.LineApiError('timeout', undefined, true));
    expect(await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).toMatchObject({
      reason: 'timeout',
    });
  });
});
