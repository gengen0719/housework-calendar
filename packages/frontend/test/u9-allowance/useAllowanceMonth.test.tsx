import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAllowanceMonth } from '../../src/hooks/useAllowanceMonth';
import { authorized, view } from './helpers/view';

describe('お小遣いの月の読み取り', () => {
  const fetcher = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    fetcher
      .mockReset()
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(view()))));
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('直接開くと current を一回だけ読む', async () => {
    renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/months/current/allowances');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('カレンダーから指定された月を使い、端末の時計を使わない', async () => {
    vi.setSystemTime(new Date('2040-12-01'));
    renderHook(() => useAllowanceMonth(authorized, view().month));
    await act(async () => {});
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/v1/months/${view().month}/allowances`);
  });
  it('端の月から範囲外に移らない', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify(view({ firstMonth: view().month, lastMonth: view().month }))),
    );
    const { result } = renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    act(() => {
      result.current.previous();
      result.current.next();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('読み込み中も範囲を保ち移れる', async () => {
    const { result } = renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    act(() => result.current.previous());
    expect(result.current.range).toEqual({
      firstMonth: view().firstMonth,
      lastMonth: view().lastMonth,
    });
    expect(result.current.state.kind).toBe('loading');
    act(() => result.current.previous());
    expect(result.current.month).toBe(view().firstMonth);
  });
  it('明示した再読込は同じ月をもう一度読む', async () => {
    const { result } = renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    act(() => result.current.reload());
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`/v1/months/${view().month}/allowances`);
  });
  it('アンマウントは飛んでいる要求とタイマーを止める', async () => {
    fetcher.mockImplementation(() => new Promise(() => undefined));
    const { unmount } = renderHook(() => useAllowanceMonth(authorized));
    const signal = fetcher.mock.calls[0]?.[1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('失敗を状態に残し再試行できる', async () => {
    fetcher.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    expect(result.current.state.kind).toBe('error');
    act(() => result.current.reload());
    await act(async () => {});
    expect(result.current.state.kind).toBe('ready');
  });
  it('二月、三月、二月と戻っても新しい要求を出す', async () => {
    const value = view({ lastMonth: '2027-04' });
    fetcher
      .mockResolvedValueOnce(new Response(JSON.stringify(value)))
      .mockImplementation(() => new Promise(() => undefined));
    const { result } = renderHook(() => useAllowanceMonth(authorized));
    await act(async () => {});
    act(() => result.current.next());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => result.current.next());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    act(() => result.current.previous());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/v1/months/current/allowances',
      '/v1/months/2027-02/allowances',
      '/v1/months/2027-03/allowances',
      '/v1/months/2027-02/allowances',
    ]);
  });
});
