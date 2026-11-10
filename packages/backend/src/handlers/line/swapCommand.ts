import { MESSAGE_TEXT_MAX_LENGTH, POSTBACK_DATA_MAX_LENGTH } from './groupCommand';
import type { LineEvent } from './types';

/**
 * 代わりにやる（U8）の操作の読み取り（BR9.1、BR9.16、NFR4.75、NFR4.76）。純粋な関数で、読み取りと書き込みはしない。
 * - 言葉: 「家事交代」と前後の空白を除いて完全に一致したものだけ（「代わって」「かわって」などは受け付けない）
 * - ボタンの値: 生の文字列に対する正規表現 3 つ。URLSearchParams は使わない（U6 の recordCommand と同じ作り）
 */
export const SWAP_KEYWORD = '家事交代';

export type SwapPostbackCommand =
  | { kind: 'offer'; dutyId: string }
  | { kind: 'accept'; dutyId: string; offerId: string }
  | { kind: 'withdraw'; dutyId: string; offerId: string };

/** 小文字の 16 進数の UUID の形（version・variant のビットは見ない。権限は読んだ担当と申し出で決める）。 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SWAP_OFFER = new RegExp(`^action=swap\\.offer&dutyId=(${UUID})$`);
const SWAP_ACCEPT = new RegExp(`^action=swap\\.accept&dutyId=(${UUID})&offerId=(${UUID})$`);
const SWAP_WITHDRAW = new RegExp(`^action=swap\\.withdraw&dutyId=(${UUID})&offerId=(${UUID})$`);

/**
 * 「家事交代」の言葉か。message が text で、5000 文字以内で、trim して「家事交代」と完全に一致するときだけ true。
 * 送られた場所は、グループ（一覧）か 1 対 1（案内）のときだけ。ルームなど、それ以外は null（何もしない。BR9.4）。
 */
export function parseSwapMessage(event: LineEvent): { kind: 'list' } | null {
  if (event.type !== 'message' || event.message?.type !== 'text') return null;
  if (event.source?.type !== 'group' && event.source?.type !== 'user') return null;
  const text = event.message.text;
  if (text === undefined || text.length > MESSAGE_TEXT_MAX_LENGTH) return null;
  return text.trim() === SWAP_KEYWORD ? { kind: 'list' } : null;
}

/**
 * swap のボタンの値を読む。source.type が group で、replyToken があり、300 文字以内のときだけ読む。
 * 形が違えば null（何もしない）。
 */
export function parseSwapPostback(event: LineEvent): SwapPostbackCommand | null {
  if (event.type !== 'postback' || event.source?.type !== 'group' || !event.replyToken) return null;
  const data = event.postback?.data;
  if (data === undefined || data.length > POSTBACK_DATA_MAX_LENGTH) return null;
  const offer = SWAP_OFFER.exec(data);
  if (offer?.[1]) return { kind: 'offer', dutyId: offer[1] };
  const accept = SWAP_ACCEPT.exec(data);
  if (accept?.[1] && accept[2]) return { kind: 'accept', dutyId: accept[1], offerId: accept[2] };
  const withdraw = SWAP_WITHDRAW.exec(data);
  if (withdraw?.[1] && withdraw[2]) {
    return { kind: 'withdraw', dutyId: withdraw[1], offerId: withdraw[2] };
  }
  return null;
}

/** entries/line.ts の accepts 用: message か postback が代わりにやる操作にあたるか。 */
export function isSwapOperation(event: LineEvent): boolean {
  return parseSwapMessage(event) !== null || parseSwapPostback(event) !== null;
}
