import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthCalendar } from '@housework/shared';
import { getMonthCalendar } from '../../src/api/client';
import { useMonthCalendar } from '../../src/hooks/useMonthCalendar';
import type { Authorized } from '../../src/hooks/useSession';
import { FAKE_SESSION_TOKEN } from '../fixtures/fakeSecrets';
import { emptyMonthCalendar } from './helpers/calendarStub';

vi.mock('../../src/api/client', () => ({ getMonthCalendar: vi.fn() }));

// 再描画で変わらない 1 つの関数（変わると読み込みの効果が動き直す）
const authorized: Authorized = (call) => call(FAKE_SESSION_TOKEN);

const mockedGet = vi.mocked(getMonthCalendar);

/** 月と、応答の「今日」から、その月を返す既定の応答を作る */
const calendarOf = (month: string, today = '2026-11-15'): MonthCalendar =>
  emptyMonthCalendar(month, today);

/** 呼び出された月の並び */
const requestedMonths = (): string[] => mockedGet.mock.calls.map((call) => call[1]);

interface Deferred {
  resolve: (value: MonthCalendar) => void;
  reject: (reason: unknown) => void;
}
/** 手で開ける応答。mockImplementation の中で呼び出しごとに 1 つ作る */
function deferredResponses(): Deferred[] {
  const list: Deferred[] = [];
  mockedGet.mockImplementation(
    () =>
      new Promise<MonthCalendar>((resolve, reject) => {
        list.push({ resolve, reject });
      }),
  );
  return list;
}

beforeEach(() => {
  mockedGet.mockReset();
  // 端末の時計: 日本時間で 2026年11月15日 12:00
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMonthCalendar', () => {
  it('最初の要求は端末の時計の日本時間の月で、応答が今日の月と同じなら 1 回で ready になる', async () => {
    mockedGet.mockResolvedValue(calendarOf('2026-11'));

    const { result } = renderHook(() => useMonthCalendar(authorized));

    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(requestedMonths()).toEqual(['2026-11']);
    expect(mockedGet.mock.calls[0]?.[0]).toBe(FAKE_SESSION_TOKEN);
    expect(mockedGet.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(result.current.month).toBe('2026-11');
  });

  it('端末の時計は UTC では 11月でも、日本時間で 12月なら 12月で要求する', async () => {
    vi.setSystemTime(new Date('2026-11-30T16:00:00.000Z'));
    mockedGet.mockResolvedValue(calendarOf('2026-12', '2026-12-01'));

    const { result } = renderHook(() => useMonthCalendar(authorized));

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(requestedMonths()).toEqual(['2026-12']);
  });

  it('応答の today の月が違えば、その月で 1 回だけ読み直す（端末の時計がずれている場合）', async () => {
    // 端末は 12月だと思っているが、裏側の今日は 11月30日
    vi.setSystemTime(new Date('2026-11-30T16:00:00.000Z'));
    mockedGet.mockImplementation((_token, month) =>
      Promise.resolve(calendarOf(month, '2026-11-30')),
    );

    const { result } = renderHook(() => useMonthCalendar(authorized));

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
      expect(result.current.month).toBe('2026-11');
    });
    expect(requestedMonths()).toEqual(['2026-12', '2026-11']);
    expect(result.current.state).toMatchObject({ value: { month: '2026-11' } });
  });

  it('読み直しは最初の 1 回だけ。あとで月を替えて today と食い違っても、そのまま表示する', async () => {
    mockedGet.mockImplementation((_token, month) =>
      Promise.resolve(calendarOf(month, '2026-11-15')),
    );
    const { result } = renderHook(() => useMonthCalendar(authorized));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    act(() => result.current.next());

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(result.current.month).toBe('2026-12');
    expect(requestedMonths()).toEqual(['2026-11', '2026-12']);
  });

  it('前後の月へ移ると「読み込み中」に戻って要求し直す。12月の次は翌年1月', async () => {
    mockedGet.mockImplementation((_token, month) =>
      Promise.resolve(calendarOf(month, '2026-12-10')),
    );
    vi.setSystemTime(new Date('2026-12-10T03:00:00.000Z'));
    const { result } = renderHook(() => useMonthCalendar(authorized));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(result.current.month).toBe('2026-12');

    act(() => result.current.next());
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(result.current.month).toBe('2027-01');

    act(() => result.current.previous());
    await waitFor(() => expect(result.current.month).toBe('2026-12'));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(requestedMonths()).toEqual(['2026-12', '2027-01', '2026-12']);
  });

  it('古い月の要求は取り消し、あとから届いても捨てる（新しい月の表示を上書きしない）', async () => {
    const responses = deferredResponses();
    const { result } = renderHook(() => useMonthCalendar(authorized));
    await waitFor(() => expect(responses).toHaveLength(1));
    await act(async () => responses[0]?.resolve(calendarOf('2026-11')));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    // 12月を求めたあと、返事を待たずに 11月へ戻る
    act(() => result.current.next());
    await waitFor(() => expect(responses).toHaveLength(2));
    act(() => result.current.previous());
    await waitFor(() => expect(responses).toHaveLength(3));
    expect((mockedGet.mock.calls[1]?.[2] as AbortSignal).aborted).toBe(true);

    // 古い 12月の返事が先に届く: 捨てられる
    await act(async () => responses[1]?.resolve(calendarOf('2026-12')));
    expect(result.current.state).toEqual({ kind: 'loading' });
    // 11月の返事が届いて ready
    await act(async () => responses[2]?.resolve(calendarOf('2026-11')));
    expect(result.current.state).toMatchObject({ kind: 'ready', value: { month: '2026-11' } });
  });

  it('失敗したら error になる。reload で読み込み中から読み直せる', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network'));
    mockedGet.mockResolvedValue(calendarOf('2026-11'));
    const { result } = renderHook(() => useMonthCalendar(authorized));

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'error' }));

    act(() => result.current.reload());
    expect(result.current.state).toEqual({ kind: 'loading' });
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(requestedMonths()).toEqual(['2026-11', '2026-11']);
  });

  it('refresh は見えている画面を残したまま読み直し、replace は応答で月と画面を差し替える', async () => {
    const responses = deferredResponses();
    const { result } = renderHook(() => useMonthCalendar(authorized));
    await waitFor(() => expect(responses).toHaveLength(1));
    await act(async () => responses[0]?.resolve(calendarOf('2026-11')));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    act(() => result.current.refresh());
    await waitFor(() => expect(responses).toHaveLength(2));
    expect(result.current.state.kind).toBe('ready');
    await act(async () => responses[1]?.resolve(calendarOf('2026-11')));

    const saved = calendarOf('2026-12');
    act(() => result.current.replace(saved));
    expect(result.current.month).toBe('2026-12');
    expect(result.current.state).toEqual({ kind: 'ready', value: saved });
  });
});
