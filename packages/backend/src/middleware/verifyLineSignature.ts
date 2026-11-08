import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export const LINE_SIGNATURE_HEADER = 'x-line-signature';

/** 署名の計算に使う、届いたままの本文のバイト列。Base64 で届いたら戻す（NFR4.7）。 */
export function getRawBody(
  event: Pick<APIGatewayProxyEventV2, 'body' | 'isBase64Encoded'>,
): Buffer {
  const body = event.body ?? '';
  return event.isBase64Encoded ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf8');
}

/**
 * LINE の Webhook の署名（チャネルシークレットでの HMAC-SHA256 を Base64 にしたもの）を確かめる。
 * 本文のバイト列そのもので計算し、時間で差が出ない比べ方をする（長さが違えば先に断る）。
 */
export function verifyLineSignature(
  rawBody: Buffer,
  signature: string | undefined,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  const received = Buffer.from(signature, 'base64');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
