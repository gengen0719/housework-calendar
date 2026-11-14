/**
 * U9 の入口の補助。署名つきのセッションで `entries/api.ts` の `handler` を呼ぶ（U5 の `callAs` を再利用）。
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../../src/entries/api';
import { apiRequest } from '../../u1-skeleton-family/helpers/world';
import { sessionForUser, type Actor, userIdOf } from '../../u5-assignment-calendar/helpers/seed';

export {
  callAs,
  sessionForUser,
  userIdOf,
  type Actor,
} from '../../u5-assignment-calendar/helpers/seed';

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
