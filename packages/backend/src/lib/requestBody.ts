import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ApiError } from './errors';

/** 本文の大きさの上限（バイト）。64 KB（NFR4.46） */
export const MAX_BODY_BYTES = 65536;

/**
 * 本文を JSON に読む（遅延して呼ぶ。ハンドラーの中で必要になった時点で呼び、担当の 404 などの確かめを先にする。NFR4.52）。
 * 本文がなければ undefined。Base64 の本文は戻してから大きさを数え、JSON に読む前に 64 KB を超えていれば 413 PAYLOAD_TOO_LARGE。
 * JSON として読めないときも undefined を返す（呼び出し側のスキーマの確かめで 422 になる）。
 */
export function readJsonBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return undefined;
  const bytes = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf8');
  if (bytes.byteLength > MAX_BODY_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return undefined;
  }
}
