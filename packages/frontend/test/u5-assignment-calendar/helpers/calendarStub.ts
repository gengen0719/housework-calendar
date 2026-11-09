import { jstDateOf, type MonthCalendar } from '@housework/shared';

/** 担当が 1 件もない、割り当て済みの月（画面の既存テストがカレンダーを出すための既定の応答） */
export function emptyMonthCalendar(
  month: string,
  today: string = jstDateOf(new Date()),
): MonthCalendar {
  return {
    month,
    confirmed: false,
    hasAssignment: true,
    today,
    duties: [],
    children: [],
    choreTypes: [],
  };
}

const CALENDAR_PATH = /^\/v1\/months\/(\d{4}-\d{2})\/calendar$/;

/**
 * 画面の既存テスト（U1・U2・U3・U4）の差し替えの fetch が、カレンダー API に答えるための既定の差し替え。
 * 関係のない要求なら undefined を返す（呼び出し側が自分の応答を続ける）。
 */
export function defaultCalendarResponse(method: string, path: string): Response | undefined {
  const match = CALENDAR_PATH.exec(path);
  if (method !== 'GET' || !match) return undefined;
  return new Response(JSON.stringify(emptyMonthCalendar(match[1] as string)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
