/**
 * U9 の入口の補助。署名つきのセッションで `entries/api.ts` の `handler` を呼ぶ（U5 の `callAs` を再利用）。
 * U9 では `callAs(actor, headers, method, path)` の形で呼ぶ（U5 の引数順と異なる）。
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../../src/entries/api';
import { apiRequest } from '../../u1-skeleton-family/helpers/world';
import { sessionForUser, type Actor, userIdOf } from '../../u5-assignment-calendar/helpers/seed';

export { sessionForUser, userIdOf, type Actor } from '../../u5-assignment-calendar/helpers/seed';

/**
 * 指定した利用者として画面用 API の入口に要求を送る。
 * U9 では callAs(actor, _headers, method, path) の形で呼ぶ（_headers は将来の拡張用で今は使わない）。
 */
export async function callAs(
  actor: Actor,
  _headers: Record<string, string>,
  method: string,
  path: string,
  body?: unknown,
): Promise<APIGatewayProxyStructuredResultV2> {
  const request = apiRequest(method, path, {
    token: sessionForUser(userIdOf(actor)),
    ...(body !== undefined ? { body } : {}),
  });
  return (await handler(request)) as APIGatewayProxyStructuredResultV2;
}

/** 利用者の ID を直接指定して呼ぶ（メンバーでない人・抜けた子供の確認用）。 */
export async function callAsUserId(
  userId: string,
  method: string,
  path: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(
    apiRequest(method, path, { token: sessionForUser(userId) }),
  )) as APIGatewayProxyStructuredResultV2;
}

/** セッションなしで呼ぶ（401 の確認用）。 */
export async function callAnonymous(
  method: string,
  path: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(apiRequest(method, path))) as APIGatewayProxyStructuredResultV2;
}

/** 応答の本文を読む。 */
export function bodyOf<T = unknown>(response: APIGatewayProxyStructuredResultV2): T {
  return JSON.parse(String(response.body)) as T;
}

export const actorUserId = (actor: Actor): string => userIdOf(actor);
