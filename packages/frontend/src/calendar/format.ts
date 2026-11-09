import {
  getMessage,
  weekdayOf,
  type CalendarChild,
  type Duty,
  type DutyStatus,
} from '@housework/shared';

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

/**
 * 画面に、その担当について何を出すか（F3 の 2.〜3. の表。BR7.10）。
 * - `record`: 「やった」ボタンを出す（自分の「未」で、今日まで、月が確定していない）
 * - `reason`: 記録できない理由の文字（明日以降・「×」・確定した月）
 * - `done`: 「済」の表示だけ（状態の文字・時刻・記録した人）
 * - `none`: ほかの子供の担当、または管理者が見ているとき（ボタンも理由も出さない）
 * 今日の判断は応答の today だけを使う（端末の時計は使わない）。
 */
export type RecordView =
  { kind: 'record' } | { kind: 'reason'; text: string } | { kind: 'done' } | { kind: 'none' };

export function recordViewOf(
  duty: Duty,
  input: { currentUserId: string | undefined; isAdmin: boolean; confirmed: boolean; today: string },
): RecordView {
  // ほかの子供の担当・管理者が見ているときは、ボタンも理由も出さない
  if (input.isAdmin || duty.childUserId !== input.currentUserId) return { kind: 'none' };
  if (duty.status === 'done') return { kind: 'done' };
  if (duty.status === 'skipped')
    return { kind: 'reason', text: getMessage('DUTY_SKIPPED_BY_ADMIN') };
  if (input.confirmed) return { kind: 'reason', text: getMessage('MONTH_CONFIRMED') };
  // 明日以降（文字列の比べ。YYYY-MM-DD は辞書順と日付順が一致）
  if (duty.date > input.today) return { kind: 'reason', text: getMessage('FUTURE_DUTY') };
  return { kind: 'record' };
}
