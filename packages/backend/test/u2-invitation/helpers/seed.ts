import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../../src/entries/api';
import type { Family, User } from '../../../src/models';
import { signSession } from '../../../src/services/tokenService';
import { apiRequest, SIGNING_SECRET } from '../../u1-skeleton-family/helpers/world';
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';

/** テストの中で作る決まった値（本物ではない） */
export const FAMILY_ID = 'fam-yamada';
export const FAMILY_NAME = '山田家';
export const FAMILY_CREATED_AT = '2026-11-01T00:00:00.000Z';
export const NOW = new Date('2026-11-02T00:00:00.000Z');
export const KEY_1 = '00000000-0000-4000-8000-000000000001'; // gitleaks:allow テスト用の作り物の Idempotency-Key
export const KEY_2 = '00000000-0000-4000-8000-000000000002'; // gitleaks:allow テスト用の作り物の Idempotency-Key
export const LIFF_URL = 'https://liff.line.me/test-liff-id';

export const PEOPLE = {
  mother: { userId: 'user-mother', displayName: 'お母さん' },
  taro: { userId: 'user-taro', displayName: '太郎' },
  hanako: { userId: 'user-hanako', displayName: '花子' },
  jiro: { userId: 'user-jiro', displayName: '次郎' },
} as const;
export type PersonKey = keyof typeof PEOPLE;

export interface SeedUserOptions {
  familyId?: string;
  role?: 'admin' | 'child';
  familyJoinedAt?: string;
  friendStatus?: 'friend' | 'blocked';
}

export function seedUser(users: Table, person: PersonKey, options: SeedUserOptions = {}): void {
  const { userId, displayName } = PEOPLE[person];
  const user: User = {
    userId,
    lineUserId: `U_${person}`,
    displayName,
    friendStatus: options.friendStatus ?? 'friend',
    registeredAt: FAMILY_CREATED_AT,
    friendStatusChangedAt: FAMILY_CREATED_AT,
    ...(options.familyId ? { familyId: options.familyId } : {}),
    ...(options.role ? { role: options.role } : {}),
    ...(options.familyJoinedAt ? { familyJoinedAt: options.familyJoinedAt } : {}),
  };
  users.set(userId, { ...user });
}

export function seedFamily(families: Table, overrides: Partial<Family> = {}): void {
  const family: Family = {
    familyId: FAMILY_ID,
    name: FAMILY_NAME,
    adminUserId: PEOPLE.mother.userId,
    createdAt: FAMILY_CREATED_AT,
    ...overrides,
  };
  families.set(family.familyId, { ...family });
}

export function sessionOf(person: PersonKey): string {
  return signSession(PEOPLE[person].userId, SIGNING_SECRET, new Date()).token;
}

export interface CallOptions {
  person?: PersonKey;
  key?: string;
  body?: unknown;
}

/** 画面用 API の入口に要求を送り、応答を返す。 */
export async function call(
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<APIGatewayProxyStructuredResultV2> {
  const request = apiRequest(method, path, {
    ...(options.person ? { token: sessionOf(options.person) } : {}),
    ...(options.key ? { headers: { 'idempotency-key': options.key } } : {}),
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
  return (await handler(request)) as APIGatewayProxyStructuredResultV2;
}

export function bodyOf<T = unknown>(response: APIGatewayProxyStructuredResultV2): T {
  return JSON.parse(String(response.body)) as T;
}
