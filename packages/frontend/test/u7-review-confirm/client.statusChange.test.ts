import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Duty } from '@housework/shared';
import { ApiFailure, changeDutyStatus, confirmMonth, unconfirmMonth } from '../../src/api/client';
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

const changed: Duty = {
  dutyId: FAKE_DUTY_ID_1,
  date: '2027-01-05',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  choreName: '皿洗い',
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 3,
  recordedAt: null,
  recordedBy: null,
  recordedByName: null,
  unitPrice: null,
};

const authHeader = { Authorization: `Bearer ${FAKE_SESSION_TOKEN}` };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('changeDutyStatus・confirmMonth・unconfirmMonth（U7 の API クライアント）', () => {
  it('changeDutyStatus: POST で action と version を本文にして送り、変更後の担当を返す', async () => {
    const fetchMock = stubFetch(json(200, changed));

    const result = await changeDutyStatus(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, {
      action: 'cancel',
      version: 2,
    });

    expect(result).toEqual(changed);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe(`/v1/duties/${FAKE_DUTY_ID_1}/status`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ ...authHeader, 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ action: 'cancel', version: 2 });
  });

  it('changeDutyStatus: dutyId は URL 用に符号化し、signal は渡したときだけ fetch に渡す', async () => {
    const fetchMock = stubFetch(json(200, changed));
    await changeDutyStatus(FAKE_SESSION_TOKEN, '../x', { action: 'markDone', version: 0 });
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/duties/..%2Fx/status');
    expect('signal' in init).toBe(false);

    const withSignal = stubFetch(json(200, changed));
    const controller = new AbortController();
    await changeDutyStatus(
      FAKE_SESSION_TOKEN,
      FAKE_DUTY_ID_1,
      { action: 'markSkipped', version: 1 },
      controller.signal,
    );
    expect(firstCall(withSignal)[1].signal).toBe(controller.signal);
  });

  it('changeDutyStatus: 409 の印は ApiFailure に状態と理由を持たせる', async () => {
    stubFetch(json(409, { error: { reason: 'MONTH_CONFIRMED' } }));
    const failure = await changeDutyStatus(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, {
      action: 'unmarkSkipped',
      version: 1,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 409, reason: 'MONTH_CONFIRMED' });
  });

  it('confirmMonth: PUT で /confirmation に、本文なしで送る', async () => {
    const fetchMock = stubFetch(json(200, {}));

    await confirmMonth(FAKE_SESSION_TOKEN, '2027-01');

    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/2027-01/confirmation');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual(authHeader);
    expect('body' in init).toBe(false);
  });

  it('unconfirmMonth: DELETE で /confirmation に、本文なしで送る', async () => {
    const fetchMock = stubFetch(json(200, {}));

    await unconfirmMonth(FAKE_SESSION_TOKEN, '2027-01');

    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/2027-01/confirmation');
    expect(init.method).toBe('DELETE');
    expect('body' in init).toBe(false);
  });

  it('confirmMonth・unconfirmMonth: signal を渡すと fetch にも渡す', async () => {
    const controller = new AbortController();
    const put = stubFetch(json(200, {}));
    await confirmMonth(FAKE_SESSION_TOKEN, '2027-01', controller.signal);
    expect(firstCall(put)[1].signal).toBe(controller.signal);

    const del = stubFetch(json(200, {}));
    await unconfirmMonth(FAKE_SESSION_TOKEN, '2027-01', controller.signal);
    expect(firstCall(del)[1].signal).toBe(controller.signal);
  });

  it('confirmMonth: 403 ADMIN_ONLY は ApiFailure になる', async () => {
    stubFetch(json(403, { error: { reason: 'ADMIN_ONLY' } }));
    const failure = await confirmMonth(FAKE_SESSION_TOKEN, '2027-01').catch((e: unknown) => e);
    expect(failure).toMatchObject({ status: 403, reason: 'ADMIN_ONLY' });
  });

  it('通信そのものが失敗したら status 0 の SERVICE_TEMPORARILY_UNAVAILABLE にする', async () => {
    stubFetch(new TypeError('network down'));
    const failure = await unconfirmMonth(FAKE_SESSION_TOKEN, '2027-01').catch((e: unknown) => e);
    expect(failure).toMatchObject({ status: 0, reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' });
  });
});
