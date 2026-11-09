import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../../src/entries/api';
import type {
  AssignmentRecord,
  AssignmentRuleRecord,
  DutyOrigin,
  DutyRecord,
  DutyStatus,
  User,
} from '../../../src/models';
import { signSession } from '../../../src/services/tokenService';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHILD_USER_ID_3,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
  FAKE_CHORE_TYPE_ID_3,
  FAKE_CHORE_TYPE_ID_4,
} from '../../fixtures/fakeSecrets';
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { apiRequest, SIGNING_SECRET } from '../../u1-skeleton-family/helpers/world';
import {
  FAMILY_CREATED_AT,
  FAMILY_ID,
  PEOPLE,
  seedFamily,
  seedUser,
} from '../../u2-invitation/helpers/seed';
import { seedChoreType } from '../../u4-chore-types/helpers/seed';

export { FAMILY_ID, PEOPLE };

/** U5 の筋書きの子供（ID は UUID の形。作り物の値は fakeSecrets に置く） */
export const CHILDREN = {
  taro: { userId: FAKE_CHILD_USER_ID_1, displayName: '太郎' },
  hanako: { userId: FAKE_CHILD_USER_ID_2, displayName: '花子' },
  jiro: { userId: FAKE_CHILD_USER_ID_3, displayName: '次郎' },
} as const;
export type ChildKey = keyof typeof CHILDREN;

/** 種類（「使う」3 つと「使わない」1 つ） */
export const CHORES = {
  dishes: { choreTypeId: FAKE_CHORE_TYPE_ID_1, name: '皿洗い', active: true },
  laundry: { choreTypeId: FAKE_CHORE_TYPE_ID_2, name: '洗濯物たたみ', active: true },
  garbage: { choreTypeId: FAKE_CHORE_TYPE_ID_3, name: 'ゴミ出し', active: true },
  bath: { choreTypeId: FAKE_CHORE_TYPE_ID_4, name: 'お風呂洗い', active: false },
} as const;
export type ChoreKey = keyof typeof CHORES;

export const MONTH = '2027-01';

/** 担当の項目（Calendar）の sk */
export const dutySk = (month: string, date: string, choreTypeId: string): string =>
  `M#${month}#D#${date}#${choreTypeId}`;
export const assignmentSk = (month: string): string => `M#${month}#A`;
export const monthStateSk = (month: string): string => `M#${month}#S`;
export const dutyRefSk = (dutyId: string): string => `DID#${dutyId}`;

/** メモリ上の Calendar の鍵（家族の ID と sk を「#」でつなぐ） */
export const calendarKey = (sk: string, familyId = FAMILY_ID): string => `${familyId}#${sk}`;

function seedChild(users: Table, key: ChildKey, familyId = FAMILY_ID): void {
  const { userId, displayName } = CHILDREN[key];
  const user: User = {
    userId,
    lineUserId: `U_${key}`,
    displayName,
    friendStatus: 'friend',
    familyId,
    role: 'child',
    familyJoinedAt: FAMILY_CREATED_AT,
    registeredAt: FAMILY_CREATED_AT,
    friendStatusChangedAt: FAMILY_CREATED_AT,
  };
  users.set(userId, { ...user });
}

export interface HouseholdTables {
  users: Table;
  families: Table;
  choreTypes: Table;
}

/** 山田家: 管理者のお母さん 1 人、子供 3 人、種類 4 つ（皿洗い・洗濯物たたみ・ゴミ出しは「使う」、お風呂洗いは「使わない」） */
export function seedHousehold(world: HouseholdTables): void {
  seedFamily(world.families);
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
  for (const key of Object.keys(CHILDREN) as ChildKey[]) seedChild(world.users, key);
  for (const chore of Object.values(CHORES)) {
    seedChoreType(world.choreTypes, {
      choreTypeId: chore.choreTypeId,
      name: chore.name,
      active: chore.active,
    });
  }
}

/** ほかの家族の子供を 1 人置く（「ほかの家族の子供は 404」の確認用） */
export function seedOutsideChild(users: Table, familyId: string, key: ChildKey): void {
  seedChild(users, key, familyId);
}

export function seedAssignment(
  calendar: Table,
  month: string,
  rules: AssignmentRuleRecord[],
  familyId = FAMILY_ID,
): void {
  const record: AssignmentRecord & { sk: string } = {
    sk: assignmentSk(month),
    familyId,
    month,
    rules,
    ...(rules.length > 0 ? { choreTypeIds: new Set(rules.map((rule) => rule.choreTypeId)) } : {}),
    updatedAt: '2026-12-20T00:00:00.000Z',
    updatedByUserId: PEOPLE.mother.userId,
  };
  calendar.set(calendarKey(record.sk, familyId), { ...record });
}

export interface SeedDutyOptions {
  dutyId: string;
  date: string;
  choreTypeId: string;
  childUserId: string;
  status?: DutyStatus;
  origin?: DutyOrigin;
  version?: number;
  familyId?: string;
  recordedAt?: string;
  recordedBy?: string;
  unitPrice?: number;
}

/** 担当と、その引き当て（DID#）を置く。「済」「×」、manual・swap の担当もここで前提データとして用意する。 */
export function seedDuty(calendar: Table, options: SeedDutyOptions): void {
  const familyId = options.familyId ?? FAMILY_ID;
  const month = options.date.slice(0, 7);
  const duty: DutyRecord & { sk: string } = {
    sk: dutySk(month, options.date, options.choreTypeId),
    dutyId: options.dutyId,
    familyId,
    month,
    date: options.date,
    choreTypeId: options.choreTypeId,
    childUserId: options.childUserId,
    status: options.status ?? 'todo',
    origin: options.origin ?? 'rule',
    version: options.version ?? 1,
    createdAt: '2026-12-20T00:00:00.000Z',
    updatedAt: '2026-12-20T00:00:00.000Z',
    ...(options.recordedAt ? { recordedAt: options.recordedAt } : {}),
    ...(options.recordedBy ? { recordedBy: options.recordedBy } : {}),
    ...(options.unitPrice !== undefined ? { unitPrice: options.unitPrice } : {}),
  };
  calendar.set(calendarKey(duty.sk, familyId), { ...duty });
  calendar.set(calendarKey(dutyRefSk(options.dutyId), familyId), {
    sk: dutyRefSk(options.dutyId),
    familyId,
    dutyId: options.dutyId,
    month,
    date: options.date,
    choreTypeId: options.choreTypeId,
  });
}

/** 月の状態（確定）を置く。 */
export function seedMonthState(
  calendar: Table,
  month: string,
  confirmed: boolean,
  familyId = FAMILY_ID,
): void {
  const sk = monthStateSk(month);
  calendar.set(calendarKey(sk, familyId), {
    sk,
    familyId,
    month,
    confirmed,
    ...(confirmed ? { confirmedAt: '2027-02-01T00:00:00.000Z' } : {}),
  });
}

/** Calendar の中の担当の項目だけを日付・種類の順に取り出す。 */
export function dutyItems(calendar: Table, familyId = FAMILY_ID): Record<string, unknown>[] {
  return [...calendar.values()]
    .filter((item) => item.familyId === familyId && String(item.sk).includes('#D#'))
    .sort((a, b) => (String(a.sk) < String(b.sk) ? -1 : 1));
}

/** Calendar の中の引き当て（DID#）だけを取り出す。 */
export function dutyRefItems(calendar: Table, familyId = FAMILY_ID): Record<string, unknown>[] {
  return [...calendar.values()].filter(
    (item) => item.familyId === familyId && String(item.sk).startsWith('DID#'),
  );
}

/** 子供でも管理者でも使える、利用者の ID からのセッション */
export function sessionForUser(userId: string): string {
  return signSession(userId, SIGNING_SECRET, new Date()).token;
}

export type Actor = 'mother' | ChildKey;

export const userIdOf = (actor: Actor): string =>
  actor === 'mother' ? PEOPLE.mother.userId : CHILDREN[actor].userId;

/** 画面用 API の入口に、指定した利用者として要求を送る。 */
export async function callAs(
  actor: Actor,
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
