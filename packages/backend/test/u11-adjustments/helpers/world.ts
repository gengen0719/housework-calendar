import { randomUUID } from 'node:crypto';
import { handler } from '../../../src/entries/api';
import { apiRequest } from '../../u1-skeleton-family/helpers/world';
import { beginScenario, seedToday, NOON } from '../../u5-assignment-calendar/helpers/scenario';
import { CHILDREN, sessionForUser, userIdOf } from '../../u5-assignment-calendar/helpers/seed';
export const validInput = () => ({
  childUserId: CHILDREN.taro.userId,
  kind: 'add' as const,
  amount: 200,
  reason: '理由',
});
export function setup() {
  const state = beginScenario();
  seedToday(state, NOON.jan13);
  return state;
}
export function request(
  method: string,
  path: string,
  body?: unknown,
  options: { actor?: 'mother' | 'taro'; key?: string | null; unauthenticated?: boolean } = {},
) {
  const event = apiRequest(method, path, {
    ...(options.unauthenticated
      ? {}
      : { token: sessionForUser(userIdOf(options.actor ?? 'mother')) }),
    ...(body === undefined ? {} : { body }),
  });
  if (options.key !== null) event.headers['idempotency-key'] = options.key ?? randomUUID();
  return handler(event);
}
export const create = (body: unknown = validInput(), options: Parameters<typeof request>[3] = {}) =>
  request('POST', '/v1/months/2027-01/adjustments', body, options);
export const bodyOf = (response: { body?: string }) => JSON.parse(String(response.body));
