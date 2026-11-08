import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ApiError } from './errors';

export function json(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** 画面用 API の共通のエラーの形: `{ error: { reason, details? } }` */
export function errorResponse(error: ApiError): APIGatewayProxyStructuredResultV2 {
  return json(error.status, {
    error: { reason: error.reason, ...(error.details ? { details: error.details } : {}) },
  });
}
