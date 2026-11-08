import { createHash, timingSafeEqual } from 'node:crypto';

export const ORIGIN_VERIFY_HEADER = 'x-origin-verify';

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * CloudFront が付ける秘密のヘッダーを確かめる（NFR4.13）。
 * 関数 URL のヘッダー名は小文字で届く。長さの違いで比べ方に差が出ないよう、ダイジェストで比べる。
 */
export function verifyOriginHeader(
  headers: Record<string, string | undefined> | undefined,
  expectedSecret: string,
): boolean {
  const received = headers?.[ORIGIN_VERIFY_HEADER];
  if (!received || !expectedSecret) return false;
  return timingSafeEqual(digest(received), digest(expectedSecret));
}
