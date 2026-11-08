import { z } from 'zod';
import { ApiError } from './errors';

const IdempotencyKeySchema = z.string().uuid();

/** 関数 URL のヘッダー名は小文字で届くが、念のため大文字小文字を区別せずに探す。 */
function headerOf(headers: Record<string, string | undefined> | undefined, name: string) {
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];
}

/** Idempotency-Key（UUID）を読む。なければ・UUID でなければ 400 IDEMPOTENCY_KEY_REQUIRED（NFR4.10）。 */
export function requireIdempotencyKey(
  headers: Record<string, string | undefined> | undefined,
): string {
  const key = IdempotencyKeySchema.safeParse(headerOf(headers, 'idempotency-key'));
  if (!key.success) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
  return key.data;
}
