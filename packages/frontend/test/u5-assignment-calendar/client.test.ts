import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonthCalendar, SaveAssignmentRequest } from '@housework/shared';
import {
  ApiFailure,
  changeDutyChild,
  getAssignment,
  getMonthCalendar,
  saveAssignment,
} from '../../src/api/client';
import {
  FAKE_CHANGES_HASH,
  FAKE_CHILD_USER_ID_1,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_DUTY_ID_1,
  FAKE_SESSION_TOKEN,
} from '../fixtures/fakeSecrets';
import { emptyMonthCalendar } from './helpers/calendarStub';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** fetch を差し替え、同じ it の中で呼び出しを読む */
function stubFetch(result: Response | Error) {
  const fetchMock = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 最初の呼び出しの [path, init] */
function firstCall(fetchMock: ReturnType<typeof stubFetch>): [string, RequestInit] {
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined;
  if (!call) throw new Error('fetch が呼ばれていません');
  return call;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('U5 の API クライアント', () => {
  it('getMonthCalendar は GET で月のカレンダーを、セッションの印と AbortSignal つきで求める', async () => {
    const calendar: MonthCalendar = emptyMonthCalendar('2026-11', '2026-11-15');
    const fetchMock = stubFetch(json(200, calendar));
    const controller = new AbortController();

    const result = await getMonthCalendar(FAKE_SESSION_TOKEN, '2026-11', controller.signal);

    expect(result).toEqual(calendar);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/2026-11/calendar');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Authorization: `Bearer ${FAKE_SESSION_TOKEN}` });
    expect(init.body).toBeUndefined();
    expect(init.signal).toBe(controller.signal);
  });

  it('signal を渡さなければ、fetch にも signal を渡さない。月の文字は URL 用に符号化する', async () => {
    const fetchMock = stubFetch(json(200, emptyMonthCalendar('2026-11')));

    await getMonthCalendar(FAKE_SESSION_TOKEN, '../x');

    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/..%2Fx/calendar');
    expect('signal' in init).toBe(false);
  });

  it('getAssignment は GET で月の割り当てを求める（signal つき）', async () => {
    const view = { exists: false };
    const fetchMock = stubFetch(json(200, view));
    const controller = new AbortController();

    const result = await getAssignment(FAKE_SESSION_TOKEN, '2026-12', controller.signal);

    expect(result).toEqual(view);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/2026-12/assignment');
    expect(init.method).toBe('GET');
    expect(init.signal).toBe(controller.signal);
  });

  it('saveAssignment は PUT で本文を JSON にして送り、保存後のカレンダーを返す', async () => {
    const calendar = emptyMonthCalendar('2026-11', '2026-11-15');
    const fetchMock = stubFetch(json(200, calendar));
    const body: SaveAssignmentRequest = {
      rules: [
        { choreTypeId: FAKE_CHORE_TYPE_ID_1, childUserId: FAKE_CHILD_USER_ID_1, weekdays: [1, 3] },
      ],
      confirmedChangesHash: FAKE_CHANGES_HASH,
    };

    const result = await saveAssignment(FAKE_SESSION_TOKEN, '2026-11', body);

    expect(result).toEqual(calendar);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe('/v1/months/2026-11/assignment');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${FAKE_SESSION_TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('changeDutyChild は PATCH で担当の子供だけを送り、担当を返す', async () => {
    const changed = { dutyId: FAKE_DUTY_ID_1, childUserId: FAKE_CHILD_USER_ID_1 };
    const fetchMock = stubFetch(json(200, changed));

    const result = await changeDutyChild(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, FAKE_CHILD_USER_ID_1);

    expect(result).toEqual(changed);
    const [path, init] = firstCall(fetchMock);
    expect(path).toBe(`/v1/duties/${FAKE_DUTY_ID_1}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ childUserId: FAKE_CHILD_USER_ID_1 });
  });

  it('エラー応答は ApiFailure にし、状態・理由の印・補足（details）を持たせる', async () => {
    const details = { changes: [{ date: '2026-11-22' }], changesHash: FAKE_CHANGES_HASH };
    stubFetch(json(409, { error: { reason: 'OVERWRITE_CONFIRMATION_REQUIRED', details } }));

    const failure = await saveAssignment(FAKE_SESSION_TOKEN, '2026-11', { rules: [] }).catch(
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({
      status: 409,
      reason: 'OVERWRITE_CONFIRMATION_REQUIRED',
      details,
    });
  });

  it('本文が読めない、または知らない理由の印のエラー応答は INTERNAL にする', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const unreadable = await getMonthCalendar(FAKE_SESSION_TOKEN, '2026-11').catch(
      (e: unknown) => e,
    );
    expect(unreadable).toMatchObject({ status: 502, reason: 'INTERNAL' });

    stubFetch(json(403, { error: { reason: 'NOT_A_REAL_REASON' } }));
    const unknown = await getAssignment(FAKE_SESSION_TOKEN, '2026-11').catch((e: unknown) => e);
    expect(unknown).toMatchObject({ status: 403, reason: 'INTERNAL' });
    expect((unknown as ApiFailure).details).toBeUndefined();
  });

  it('通信そのものが失敗（取り消しを含む）したら、status 0 の SERVICE_TEMPORARILY_UNAVAILABLE にする', async () => {
    stubFetch(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const controller = new AbortController();
    controller.abort();

    const failure = await getMonthCalendar(FAKE_SESSION_TOKEN, '2026-11', controller.signal).catch(
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(ApiFailure);
    expect(failure).toMatchObject({ status: 0, reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' });
  });
});
