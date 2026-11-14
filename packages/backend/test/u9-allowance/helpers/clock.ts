/**
 * U9 の時計の補助。日付だけを差し替える（U8 と同じ `vi.useFakeTimers({ toFake: ['Date'] })`）。
 * 日本時間の境（UTC 15 時の前後、月末、年またぎ、うるう年）を作るための定数も置く。
 */
export { resetNow, setNow } from '../../u1-skeleton-family/helpers/world';

/** 固定の「今」。2027-01-20 12:00（日本時間）。 */
export const NOW_ISO = '2027-01-20T03:00:00.000Z';
/** NOW_ISO の日本時間の今日。 */
export const TODAY = '2027-01-20';
/** 日本時間では翌日になる UTC の時刻（2027-01-31 15:00 UTC＝2027-02-01 0:00 JST）。 */
export const JST_MONTH_BOUNDARY_ISO = '2027-01-31T15:00:00.000Z';
/** 日本時間ではまだ 1 月 31 日の最後の 1 分（UTC 14:59）。 */
export const JST_BEFORE_BOUNDARY_ISO = '2027-01-31T14:59:00.000Z';
/** 年またぎ（日本時間 2027-01-01 0:00）。 */
export const JST_NEW_YEAR_ISO = '2026-12-31T15:00:00.000Z';
/** うるう年の 2 月末（日本時間 2028-02-29 12:00）。 */
export const LEAP_DAY_ISO = '2028-02-29T03:00:00.000Z';
