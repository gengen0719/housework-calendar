import { createHash, randomBytes } from 'node:crypto';

/** 招待の印の形: 22 文字ちょうど、`[A-Za-z0-9_-]` のみ（NFR4.14、NFR4.24） */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** ログに書く印の先頭の文字数（NFR5.7） */
const TOKEN_PREFIX_LENGTH = 4;

/** 招待の期限: 作ってから 24 時間（BR3.2） */
export const INVITATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** 期限が過ぎた招待の項目を残す日数（TTL は期限 + 7 日。NFR1.8） */
export const INVITATION_RETENTION_SECONDS = 7 * 24 * 60 * 60;

/** 128 ビットのランダムな印を作る（NFR4.14）。 */
export function newInvitationToken(): string {
  return randomBytes(16).toString('base64url');
}

/** 印の形を確かめる。合わなければ DynamoDB を読まずに INVITATION_INVALID にする。 */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** ログ用: 印の先頭 4 文字だけ。 */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}

/** 送り直しの記録の `target` に使う、印の SHA-256（印そのものは持たない。レビュー R-06）。 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 招待のリンク: LIFF の URL に `?invitation=<印>` を付けたもの。 */
export function buildInvitationUrl(liffUrl: string, token: string): string {
  const url = new URL(liffUrl);
  url.searchParams.set('invitation', token);
  return url.toString();
}
