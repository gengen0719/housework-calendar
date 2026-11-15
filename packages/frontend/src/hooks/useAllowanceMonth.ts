import { useCallback, useEffect, useRef, useState } from 'react';
import { parseMonth, shiftMonth, type AllowanceMonthView, type Reason } from '@housework/shared';
import { ApiFailure, getAllowances } from '../api/client';
import type { Authorized } from './useSession';

export type AllowanceState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: AllowanceMonthView }
  | { kind: 'error'; reason?: Reason };

/** 端末の時計を使わず、最後に選んだ月だけを読む。待ち時間中の応答も捨てる。 */
export function useAllowanceMonth(authorized: Authorized, initialMonth = 'current') {
  const [month, setMonth] = useState(initialMonth);
  const [state, setState] = useState<AllowanceState>({ kind: 'loading' });
  const [range, setRange] = useState<{ firstMonth: string; lastMonth: string }>();
  const target = useRef(initialMonth);
  const rangeRef = useRef(range);
  const sequence = useRef(0);
  const pending = useRef<
    { month: string; sequence: number; controller: AbortController } | undefined
  >(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const request = useCallback(
    (requested: string) => {
      if (pending.current?.month === requested && !pending.current.controller.signal.aborted)
        return;
      pending.current?.controller.abort();
      const controller = new AbortController();
      const id = ++sequence.current;
      pending.current = { month: requested, sequence: id, controller };
      setState({ kind: 'loading' });
      authorized((token) => getAllowances(token, requested, controller.signal)).then(
        (value) => {
          if (controller.signal.aborted || id !== sequence.current || target.current !== requested)
            return;
          pending.current = undefined;
          target.current = value.month;
          setMonth(value.month);
          rangeRef.current = { firstMonth: value.firstMonth, lastMonth: value.lastMonth };
          setRange(rangeRef.current);
          setState({ kind: 'ready', value });
        },
        (error: unknown) => {
          if (controller.signal.aborted || id !== sequence.current || target.current !== requested)
            return;
          pending.current = undefined;
          setState({
            kind: 'error',
            ...(error instanceof ApiFailure ? { reason: error.reason } : {}),
          });
        },
      );
    },
    [authorized],
  );

  useEffect(() => {
    request(target.current);
    return () => {
      clearTimeout(timer.current);
      pending.current?.controller.abort();
    };
  }, [request]);

  const move = useCallback(
    (delta: number) => {
      if (!parseMonth(target.current)) return;
      const next = shiftMonth(target.current, delta);
      if (
        !parseMonth(next) ||
        (rangeRef.current &&
          (next < rangeRef.current.firstMonth || next > rangeRef.current.lastMonth))
      )
        return;
      target.current = next;
      setMonth(next);
      setState({ kind: 'loading' });
      pending.current?.controller.abort();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => request(target.current), 250);
    },
    [request],
  );
  const reload = useCallback(() => {
    clearTimeout(timer.current);
    pending.current?.controller.abort();
    request(target.current);
  }, [request]);
  return {
    month,
    state,
    range,
    previous: useCallback(() => move(-1), [move]),
    next: useCallback(() => move(1), [move]),
    reload,
  };
}
