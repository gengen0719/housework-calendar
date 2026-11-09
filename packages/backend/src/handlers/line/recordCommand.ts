import { POSTBACK_DATA_MAX_LENGTH } from './groupCommand';
import type { LineEvent } from './types';

/**
 * 記録の操作（U6）。リッチメニューの「やった」と、担当の選択肢のボタンの 2 つ（security-design.md の ADR-U6-02）。
 * - list: リッチメニューの「やった」（action=record.list）
 * - do: 担当の選択肢のボタン（action=record.do&dutyId=<ID>&v=<version>）
 */
export type RecordCommand = { kind: 'list' } | { kind: 'do'; dutyId: string; version: number };

/** 1 対 1 の記録の返事で見せる担当の上限（LINE の carousel のバブルの数の仮定。BR7.2）。 */
export const MAX_RECORD_CHOICES = 12;

/** 小文字の 16 進数の UUID の形（version・variant のビットは見ない。権限は裏側が決める）。 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** action=record.do&dutyId=<UUID>&v=<0 以上 9 桁以内の整数（先頭 0 は 0 のみ）> */
const RECORD_DO = new RegExp(`^action=record\\.do&dutyId=(${UUID})&v=(0|[1-9][0-9]{0,8})$`);

/**
 * postback の data を、生の文字列に対する正規表現 1 つで厳密に読む（security-design.md、NFR4.54、NFR4.55）。
 * URLSearchParams は使わない（項目の重複・順序・エンコードの違いなど「同じ値に見える違う文字列」を通さないため）。
 * source.type が user で、replyToken があり、長さが 300 文字以内のときだけ読む。それ以外・形が違えば null。
 */
export function parseRecordCommand(event: LineEvent): RecordCommand | null {
  if (event.type !== 'postback' || event.source?.type !== 'user' || !event.replyToken) return null;
  const data = event.postback?.data;
  // 長さは正規表現より先に確かめる（300 文字。U3 の NFR4.28）
  if (data === undefined || data.length > POSTBACK_DATA_MAX_LENGTH) return null;
  if (data === 'action=record.list') return { kind: 'list' };
  const match = RECORD_DO.exec(data);
  return match?.[1] && match[2]
    ? { kind: 'do', dutyId: match[1], version: Number(match[2]) }
    : null;
}
