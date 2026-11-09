import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Duty } from '@housework/shared';
import { ApiFailure, recordDuty } from '../../src/api/client';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_DUTY_ID_1,
  FAKE_SESSION_TOKEN,
} from '../fixtures/fakeSecrets';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function stubFetch(result: Response | Error) {
  const fetchMock = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function firstCall(fetchMock: ReturnType<typeof stubFetch>): [string, RequestInit] {
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
  if (!call) throw new Error('fetch が呼ばれていません');
  return call;
}

const recorded: Duty = {
  dutyId: FAKE_DUTY_ID_1,
  date: '2027-01-05',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  choreName: '皿洗い',
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'done',
  origin: 'rule',
  version: 2,
  recordedAt: '2027-01-05T07:42:00.000Z',
  recordedBy: FAKE_CHILD_USER_ID_1,
  recordedByName: '太郎',
  unitPrice: 100,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordDuty（記録の API クライアント。U6）', () => {
  it('POST で version だけを本文にして送り、記録後の担当を返す', async () => {
    const fetchMock = stubFetch(json(200, recorded));

    const result = await recordDuty(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 1 });

    expect(result).toEqual(recorded);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe(`/v1/duties/${FAKE_DUTY_ID_1}/record`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({ version: 1 });
  });

  it('dutyId は URL 用に符号化する', async () => {
    const fetchMock = stubFetch(json(200, recorded));

    await recordDuty(FAKE_SESSION_TOKEN, '../x', { version: 0 });

    const [path] = firstCall(fetchMock);
    expect(path).toBe('/v1/duties/..%2Fx/record');
  });

  it('signal を渡すと fetch にも渡す', async () => {
    const fetchMock = stubFetch(json(200, recorded));
    const controller = new AbortController();

    await recordDuty(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 1 }, controller.signal);

    const [, init] = firstCall(fetchMock);
    expect(init.signal).toBe(controller.signal);
  });

  it('signal を渡さなければ fetch にも渡さない', async () => {
    const fetchMock = stubFetch(json(200, recorded));

    await recordDuty(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 1 });

    const [, init] = firstCall(fetchMock);
    expect('signal' in init).toBe(false);
  });

  it('エラー応答は ApiFailure にし、状態と理由の印を持たせる', async () => {
    stubFetch(json(409, { error: { reason: 'DUTY_CHANGED' } }));

    const failure = await recordDuty(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 1 }).catch(
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 409, reason: 'DUTY_CHANGED' });
  });

  it('通信そのものが失敗したら status 0 の SERVICE_TEMPORARILY_UNAVAILABLE にする', async () => {
    stubFetch(new TypeError('network down'));

    const failure = await recordDuty(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 1 }).catch(
      (e: unknown) => e,
    );

    expect(failure).toMatchObject({ status: 0, reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' });
  });
});
