import {
  CHORE_TYPE_DESCRIPTION_MAX_LENGTH,
  CHORE_TYPE_NAME_MAX_LENGTH,
  CHORE_TYPE_NAME_MIN_LENGTH,
} from './api-types';
import { err, ok, type Result } from './result';

/**
 * お手伝いの種類の入力の確かめ（BR5.2、BR5.5、BR5.6）。画面（入力欄の下の文言）と裏側（422）で同じものを使う。
 * 長さは Unicode のコードポイントで数える。
 */

const CONTROL_CHARACTER = /\p{Cc}/u;

const codePointLength = (text: string): number => [...text].length;

/** 名前: NFC、前後の空白（全角を含む）を除き、1〜20 コードポイント、制御文字なし。 */
export function normalizeChoreName(raw: unknown): Result<string, 'INVALID_CHORE_TYPE_NAME'> {
  if (typeof raw !== 'string') return err('INVALID_CHORE_TYPE_NAME');
  const name = raw.normalize('NFC').trim();
  const length = codePointLength(name);
  if (
    length < CHORE_TYPE_NAME_MIN_LENGTH ||
    length > CHORE_TYPE_NAME_MAX_LENGTH ||
    CONTROL_CHARACTER.test(name)
  ) {
    return err('INVALID_CHORE_TYPE_NAME');
  }
  return ok(name);
}

/** 単価: JSON の数値で、安全な整数かつ 0 以上。文字列は受けない。-0 は 0 にそろえる。 */
export function validateUnitPrice(raw: unknown): Result<number, 'INVALID_UNIT_PRICE'> {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) {
    return err('INVALID_UNIT_PRICE');
  }
  return ok(raw === 0 ? 0 : raw);
}

/** 説明: なし・空は説明なし。NFC、前後の空白を除き、100 コードポイントまで。改行は許し、ほかの制御文字は断る。 */
export function normalizeDescription(
  raw: unknown,
): Result<string | undefined, 'INVALID_DESCRIPTION'> {
  if (raw === undefined || raw === null) return ok(undefined);
  if (typeof raw !== 'string') return err('INVALID_DESCRIPTION');
  const description = raw.normalize('NFC').trim();
  if (description === '') return ok(undefined);
  if (
    codePointLength(description) > CHORE_TYPE_DESCRIPTION_MAX_LENGTH ||
    CONTROL_CHARACTER.test(description.replaceAll('\n', ''))
  ) {
    return err('INVALID_DESCRIPTION');
  }
  return ok(description);
}
