import type { AssignmentRule } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../../src/entries/api';
import { resetDutyReassignedHooks } from '../../../src/services/dutyReassignedHook';
import { CALENDAR_TABLE } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { apiRequest, resetNow, setNow, setupWorld } from '../../u1-skeleton-family/helpers/world';
import { bodyOf } from '../../u2-invitation/helpers/seed';
import {
  assignmentSk,
  calendarKey,
  CHILDREN,
  CHORES,
  dutyItems,
  dutyRefItems,
  seedHousehold,
  sessionForUser,
  userIdOf,
  type Actor,
  type ChildKey,
  type ChoreKey,
} from './seed';

export type World = ReturnType<typeof setupWorld>;

/** 筋書きの今日（日本時間の正午）。日付の境目を試すときは別の時刻を使う */
export const NOON = {
  jan13: '2027-01-13T03:00:00.000Z',
  jan14: '2027-01-14T03:00:00.000Z',
  dec15: '2026-12-15T03:00:00.000Z',
} as const;

export interface ScenarioState {
  world: World;
  logs: Record<string, unknown>[];
}

/** 筋書きの最初に呼ぶ: 偽の DynamoDB と API の入口を作り、ログを集める。 */
export function beginScenario(): ScenarioState {
  const world = setupWorld();
  process.env.ENTRY = 'api';
  const logs: Record<string, unknown>[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    try {
      logs.push(JSON.parse(String(line)) as Record<string, unknown>);
    } catch {
      // JSON でない出力は集めない
    }
  });
  return { world, logs };
}

/**
 * 筋書きの終わりに呼ぶ: 固定した時刻と通知の登録を戻す。
 * C8 の窓口は戻さない（entries/api.ts が読み込み時に取り付けた本物を、ファイルの中の全場面で使う）。
 */
export function endScenario(): void {
  resetNow();
  resetDutyReassignedHooks();
  vi.restoreAllMocks();
}

/** 山田家（管理者 1 人、子供 3 人、種類 4 つ）を置いて、今日を固定する。 */
export function seedToday(state: ScenarioState, nowIso: string): void {
  seedHousehold(state.world);
  setNow(nowIso);
}

export function rule(chore: ChoreKey, child: ChildKey, weekdays: number[]): AssignmentRule {
  return {
    choreTypeId: CHORES[chore].choreTypeId,
    childUserId: CHILDREN[child].userId,
    weekdays,
  };
}

export const MONDAY = 1;
export const TUESDAY = 2;
export const THURSDAY = 4;

export const savePath = (month: string): string => `/v1/months/${month}/assignment`;

export async function saveAs(
  actor: Actor,
  month: string,
  rules: unknown,
  extra: Record<string, unknown> = {},
  context?: { getRemainingTimeInMillis?: () => number },
): Promise<APIGatewayProxyStructuredResultV2> {
  const request = apiRequest('PUT', savePath(month), {
    token: sessionForUser(userIdOf(actor)),
    body: { rules, ...extra },
  });
  return (await handler(request, context)) as APIGatewayProxyStructuredResultV2;
}

/** 本文をそのまま送る（形の違う本文の確認用） */
export async function sendBody(
  actor: Actor,
  month: string,
  body: unknown,
): Promise<APIGatewayProxyStructuredResultV2> {
  const request = apiRequest('PUT', savePath(month), {
    token: sessionForUser(userIdOf(actor)),
    ...(body !== undefined ? { body } : {}),
  });
  return (await handler(request)) as APIGatewayProxyStructuredResultV2;
}

/** 利用者の ID を指定して要求を送る（家族に入っていない人など、Actor にない人用） */
export async function callAsUserId(
  userId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<APIGatewayProxyStructuredResultV2> {
  const request = apiRequest(method, path, {
    token: sessionForUser(userId),
    ...(body !== undefined ? { body } : {}),
  });
  return (await handler(request)) as APIGatewayProxyStructuredResultV2;
}

export const calendarPath = (month: string): string => `/v1/months/${month}/calendar`;
export const dutyPath = (dutyId: string): string => `/v1/duties/${dutyId}`;

/** Calendar の表への読み取りの記録（強い整合性か、Scan がないかの確認用） */
export function calendarReads(world: World) {
  return world.hooks.readLog.filter((entry) => entry.table === CALENDAR_TABLE);
}

export const errorOf = (
  response: APIGatewayProxyStructuredResultV2,
): { reason: string; details?: Record<string, unknown> } =>
  bodyOf<{ error: { reason: string; details?: Record<string, unknown> } }>(response).error;

const choreNameById = new Map<string, string>(
  Object.values(CHORES).map((c) => [c.choreTypeId, c.name]),
);
const childNameById = new Map<string, string>(
  Object.values(CHILDREN).map((c) => [c.userId, c.displayName]),
);
export const choreNameOf = (id: unknown): string => choreNameById.get(String(id)) ?? String(id);
export const childNameOf = (id: unknown): string => childNameById.get(String(id)) ?? String(id);

/** Calendar の担当を「日付 種類 子供 状態 origin vN」の行にして、日付・種類の順に返す。 */
export function dutyLines(world: World): string[] {
  return dutyItems(world.calendar)
    .map(
      (d) =>
        `${String(d.date).slice(5)} ${choreNameOf(d.choreTypeId)} ${childNameOf(d.childUserId)} ${String(d.status)} ${String(d.origin)} v${String(d.version)}`,
    )
    .sort();
}

/** 応答の担当を「月-日 種類 子供」の行にする */
export function responseDutyLines(
  response: APIGatewayProxyStructuredResultV2,
  withStatus = false,
): string[] {
  const calendar = bodyOf<{ duties: Record<string, unknown>[] }>(response);
  return calendar.duties.map(
    (d) =>
      `${String(d.date).slice(5)} ${String(d.choreName)} ${childNameOf(d.childUserId)}${withStatus ? ` ${String(d.status)}` : ''}`,
  );
}

export const storedAssignment = (world: World, month: string) =>
  world.calendar.get(calendarKey(assignmentSk(month)));

/** 引き当て（DID#）が担当と 1 対 1 でそろっていること */
export function expectRefsMatchDuties(world: World): void {
  const duties = dutyItems(world.calendar);
  const refs = dutyRefItems(world.calendar);
  expect(refs.map((r) => r.dutyId).sort()).toEqual(duties.map((d) => d.dutyId).sort());
}
