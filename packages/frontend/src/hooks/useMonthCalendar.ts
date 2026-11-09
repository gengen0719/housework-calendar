import { useCallback, useEffect, useRef, useState } from 'react';
import {
  jstDateOf,
  monthOfDate,
  parseMonth,
  shiftMonth,
  type MonthCalendar,
} from '@housework/shared';
import { getMonthCalendar } from '../api/client';
import type { Authorized } from './useSession';

export type MonthCalendarState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: MonthCalendar };

/**
 * 月のカレンダーを読む。画面の中のキャッシュは持たず、月を替えるたびに読み直す。
 * 最初の 1 回だけ端末の時計を日本時間にした月で要求し、応答の今日の月と食い違えば、今日の月で 1 回だけ読み直す。
 * 以後の判断は応答の today だけを使う。古い月の要求は AbortController で取り消し、届いても捨てる（NFR7.20）。
 */
export function useMonthCalendar(authorized: Authorized) {
  const [month, setMonth] = useState(() => monthOfDate(jstDateOf(new Date())));
  const [state, setState] = useState<MonthCalendarState>({ kind: 'loading' });
  // 読み直しの合図。値が変わると読み込みの効果がもう一度動く
  const [reloadCount, setReloadCount] = useState(0);
  const firstRequest = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    const requested = month;
    const isFirst = firstRequest.current;
    authorized((token) => getMonthCalendar(token, requested, controller.signal)).then(
      (value) => {
        if (controller.signal.aborted) return;
        firstRequest.current = false;
        const todayMonth = monthOfDate(value.today);
        if (isFirst && todayMonth !== requested) {
          setMonth(todayMonth);
          return;
        }
        setState({ kind: 'ready', value });
      },
      () => {
        if (controller.signal.aborted) return;
        firstRequest.current = false;
        setState({ kind: 'error' });
      },
    );
    return () => controller.abort();
  }, [authorized, month, reloadCount]);

  const go = useCallback((delta: number) => {
    setMonth((current) => {
      const next = shiftMonth(current, delta);
      return parseMonth(next) ? next : current;
    });
    setState({ kind: 'loading' });
  }, []);

  /** 画面を「読み込み中」に戻して読み直す（失敗のあとの「読み込み直す」） */
  const reload = useCallback(() => {
    setState({ kind: 'loading' });
    setReloadCount((n) => n + 1);
  }, []);

  /** 見えている画面は残したまま、裏で読み直す（変更が断られたあとの確かめ） */
  const refresh = useCallback(() => setReloadCount((n) => n + 1), []);

  /** 保存や変更の応答で、いまの月の画面を差し替える */
  const replace = useCallback((value: MonthCalendar) => {
    setMonth(value.month);
    setState({ kind: 'ready', value });
  }, []);

  return {
    month,
    state,
    previous: useCallback(() => go(-1), [go]),
    next: useCallback(() => go(1), [go]),
    reload,
    refresh,
    replace,
  };
}
