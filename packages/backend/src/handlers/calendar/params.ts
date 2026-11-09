import { parseMonth } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';

/** ID は小文字の UUID だけ（大文字は受けない。crypto.randomUUID() は小文字。NFR4.46） */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

/**
 * パスの月の形を確かめる（`YYYY-MM`、年 2000〜2100、月 01〜12）。日付の計算に渡す前に確かめる（NFR4.46）。
 * 違えば 422 INVALID_MONTH。
 */
export function requireMonthParam(raw: string): string {
  if (!parseMonth(raw)) throw new ApiError(422, 'INVALID_MONTH');
  return raw;
}

/**
 * パスの担当の ID の形を確かめる（小文字の UUID だけ）。違えば DynamoDB を読まずに 404 NOT_FOUND
 * （ほかの家族の担当があることを漏らさないため、ない担当と同じ応答にする。NFR4.48）。
 */
export function requireDutyIdParam(raw: string): string {
  if (!uuidSchema.safeParse(raw).success) throw new ApiError(404, 'NOT_FOUND');
  return raw;
}
