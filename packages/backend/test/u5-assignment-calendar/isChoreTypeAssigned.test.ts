import { randomUUID } from 'node:crypto';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import * as calendarService from '../../src/services/calendarService';
import { FAKE_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
import { CALENDAR_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import { CHILDREN, CHORES, seedAssignment, seedDuty } from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' };

beforeEach(() => {
  world = setupWorld();
  process.env.ENTRY = 'api';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const addDuty = (date: string, chore: keyof typeof CHORES, familyId = FAMILY_ID) =>
  seedDuty(world.calendar, {
    dutyId: randomUUID(),
    date,
    choreTypeId: CHORES[chore].choreTypeId,
    childUserId: CHILDREN.taro.userId,
    familyId,
  });

const rows = (chore: keyof typeof CHORES) => [
  { choreTypeId: CHORES[chore].choreTypeId, childUserId: CHILDREN.taro.userId, weekdays: [1] },
];

describe('isChoreTypeAssigned', () => {
  it('割り当てに入っている種類は使われている', async () => {
    seedAssignment(world.calendar, '2027-01', rows('dishes'));
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(true);
  });

  it('担当だけに残っている種類（割り当てなし）も使われている', async () => {
    addDuty('2026-12-10', 'laundry');
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.laundry.choreTypeId)).toBe(true);
  });

  it('どこにも出ていない種類は使われていない', async () => {
    seedAssignment(world.calendar, '2027-01', rows('dishes'));
    addDuty('2027-01-18', 'dishes');
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.garbage.choreTypeId)).toBe(false);
  });

  it('ほかの家族の使用は見ない', async () => {
    seedAssignment(world.calendar, '2027-01', rows('dishes'), FAKE_OTHER_FAMILY_ID);
    addDuty('2027-01-18', 'dishes', FAKE_OTHER_FAMILY_ID);
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(false);
  });

  it('担当の引き当て（DID#）は使用に数えない', async () => {
    addDuty('2027-01-18', 'dishes');
    for (const [key, item] of world.calendar) {
      if (!String(item.sk).startsWith('DID#')) world.calendar.delete(key);
    }
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(false);
  });

  it('1 件当たったら続きを読まない', async () => {
    addDuty('2027-01-01', 'dishes');
    for (let day = 2; day <= 9; day++) addDuty(`2027-01-0${day}`, 'garbage');
    world.hooks.queryPageSize = 1;
    world.hooks.readLog.length = 0;
    expect(await calendarService.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(true);
    expect(world.hooks.readLog.filter((entry) => entry.table === CALENDAR_TABLE)).toHaveLength(1);
  });

  it('Query は強い整合性で、属性名はすべて ExpressionAttributeNames で置き換える', async () => {
    await calendarService.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId);
    const input = world.mock.commandCalls(QueryCommand).at(-1)?.args[0].input;
    expect(input?.ConsistentRead).toBe(true);
    expect(input?.IndexName).toBeUndefined();
    expect(input?.KeyConditionExpression).toBe('#familyId = :f AND begins_with(#sk, :p)');
    expect(input?.FilterExpression).toBe('contains(#choreTypeIds, :c) OR #choreTypeId = :c');
    expect(input?.ProjectionExpression).toBe('#sk');
    expect(input?.ExpressionAttributeNames).toEqual({
      '#familyId': 'familyId',
      '#sk': 'sk',
      '#choreTypeIds': 'choreTypeIds',
      '#choreTypeId': 'choreTypeId',
    });
  });
});
