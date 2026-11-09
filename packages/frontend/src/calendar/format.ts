import { weekdayOf, type CalendarChild, type DutyStatus } from '@housework/shared';

export const WEEKDAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 状態は色だけに頼らず、文字で出す（AC4.1.7） */
export const STATUS_LABEL: Record<DutyStatus, string> = {
  todo: '未',
  done: '済',
  skipped: '×',
};

/** 日本時間の時刻の整形（時:分）。インスタンスは 1 つだけ作る。 */
const JST_TIME = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** UTC の時刻（ISO 8601）を、日本時間の「18:30」の形にする。 */
export function formatTimeJst(iso: string): string {
  return JST_TIME.format(new Date(iso));
}

/** `2026-11` → 「2026年11月」 */
export function monthHeading(month: string): string {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return `${year}年${m}月`;
}

/** `2026-11-10` → 「10日(火)」 */
export function dayLabel(date: string): string {
  return `${Number(date.slice(8, 10))}日(${WEEKDAY_NAMES[weekdayOf(date)]})`;
}

/** `2026-11-10` → 「11月10日(火)」 */
export function longDayLabel(date: string): string {
  return `${Number(date.slice(5, 7))}月${dayLabel(date)}`;
}

/** 子供の ID から表示名を引く。見つからなければ空の文字。 */
export function childName(children: readonly CalendarChild[], userId: string): string {
  return children.find((c) => c.userId === userId)?.displayName ?? '';
}
