/**
 * 日本時間（Asia/Tokyo）の日付の計算（U5。NFR8.10、NFR11.4）。
 * 標準の Intl.DateTimeFormat だけを使い、新しい依存は足さない。
 * 日付は `YYYY-MM-DD`、月は `YYYY-MM` の文字列で扱う。
 */

/** 整形のインスタンスはモジュールの先頭で 1 つだけ作る（呼ぶたびに作らない） */
const JST_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** ある瞬間の、日本時間の日付（`YYYY-MM-DD`）。 */
export function jstDateOf(at: Date): string {
  const parts = JST_FORMAT.formatToParts(at);
  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** 月の形（`YYYY-MM`、2000-01〜2100-12）を確かめて、年と月を返す。違えば null。 */
export function parseMonth(value: string): { year: number; month: number } | null {
  const match = MONTH_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  return { year, month };
}

/** 月を前後にずらす。12 月の次は翌年 1 月、1 月の前は前年 12 月。 */
export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month);
  if (!parsed) throw new RangeError(`月の形が正しくありません: ${month}`);
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1, 2)}`;
}

/** 日付（`YYYY-MM-DD`）の月（`YYYY-MM`）。 */
export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

/** その月の 1 日から月末までの日付。 */
export function datesOfMonth(month: string): string[] {
  const parsed = parseMonth(month);
  if (!parsed) throw new RangeError(`月の形が正しくありません: ${month}`);
  // 翌月の 0 日 = 当月の末日（UTC で数えるので時差の影響を受けない）
  const last = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  return Array.from({ length: last }, (_, index) => `${month}-${pad(index + 1, 2)}`);
}

/** 曜日（日曜 0〜土曜 6）。日付は日本時間のカレンダー上の日付として扱う。 */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** 割り当てを入力できる月か（今月と来月だけ。BR6.2）。today は日本時間の今日。 */
export function isEditableMonth(month: string, today: string): boolean {
  const thisMonth = monthOfDate(today);
  return month === thisMonth || month === shiftMonth(thisMonth, 1);
}
