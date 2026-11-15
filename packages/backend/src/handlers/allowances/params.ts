import { jstDateOf, monthOfDate } from '@housework/shared';
import { requireMonthParam } from '../calendar/params';

/**
 * パスの月の読み方（U9。BR10.8、NFR4.88）。
 * `'current'`（完全一致）なら日本時間の今日の月に変換し、それ以外は既存の `requireMonthParam` に渡す。
 * `Current`・`current `・`CURRENT` などは `'current'` として扱わず 422 INVALID_MONTH。
 */
export function resolveMonthParam(raw: string, now: Date): string {
  if (raw === 'current') {
    return monthOfDate(jstDateOf(now));
  }
  return requireMonthParam(raw);
}

export { requireMonthParam };
