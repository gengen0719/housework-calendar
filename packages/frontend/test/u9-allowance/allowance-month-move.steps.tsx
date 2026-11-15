import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { act, cleanup, renderHook } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { useAllowanceMonth } from '../../src/hooks/useAllowanceMonth';
import { authorized, view } from './helpers/view';
const feature = await loadFeature(
  'packages/frontend/test/u9-allowance/allowance-month-move.feature',
);
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  Scenario('続けて押した最後の月だけを読む', ({ Given, When, Then }) => {
    Given('今月のお小遣いを開いた', () => undefined);
    When('前の月を続けて押す', () => undefined);
    Then('250ミリ秒後に最後の月だけを読む', async () => {
      vi.useFakeTimers();
      const fetcher = vi
        .fn()
        .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(view()))));
      vi.stubGlobal('fetch', fetcher);
      const { result } = renderHook(() => useAllowanceMonth(authorized));
      await act(async () => {});
      expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/months/current/allowances');
      act(() => result.current.previous());
      act(() => result.current.previous());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(249);
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(fetcher.mock.calls[1]?.[0]).toBe('/v1/months/2026-11/allowances');
    });
  });
  Scenario('古い応答が届いても表示しない', ({ Given, When, Then }) => {
    Given('先の月の要求が待っている', () => undefined);
    When('別の月に移って古い応答が届く', () => undefined);
    Then('最新の月だけを表示する', async () => {
      vi.useFakeTimers();
      let resolveOld!: (value: Response) => void;
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(view())))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              resolveOld = resolve;
            }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify(view({ month: '2026-11' }))));
      vi.stubGlobal('fetch', fetcher);
      const { result } = renderHook(() => useAllowanceMonth(authorized));
      await act(async () => {});
      act(() => result.current.previous());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      const oldSignal = fetcher.mock.calls[1]?.[1].signal as AbortSignal;
      act(() => result.current.previous());
      expect(oldSignal.aborted).toBe(true);
      await act(async () => {
        resolveOld(new Response(JSON.stringify(view({ month: '2026-12' }))));
      });
      expect(result.current.state.kind).toBe('loading');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(result.current.month).toBe('2026-11');
      expect(result.current.state.kind === 'ready' && result.current.state.value.month).toBe(
        '2026-11',
      );
    });
  });
});
