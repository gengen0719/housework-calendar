import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ApiError } from './errors';

/** 追加のヘッダーは先に、content-type を後に書く（content-type は常に application/json が勝つ）。 */
export function json(
  statusCode: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { ...extraHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** 画面用 API の共通のエラーの形: `{ error: { reason, details? } }` */
export function errorResponse(error: ApiError): APIGatewayProxyStructuredResultV2 {
  return json(error.status, {
    error: { reason: error.reason, ...(error.details ? { details: error.details } : {}) },
  });
}
