import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import * as calendarService from '../../src/services/calendarService';
import { FAKE_DUTY_ID_1, FAKE_DUTY_ID_2 } from '../fixtures/fakeSecrets';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import { calendarKey, CHILDREN, CHORES, dutySk, seedDuty, seedHousehold } from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' };
const NOW = new Date('2027-01-14T03:00:00.000Z');
const DISHES = CHORES.dishes.choreTypeId;

beforeEach(() => {
  world = setupWorld();
  process.env.ENTRY = 'api';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  seedHousehold(world);
  seedDuty(world.calendar, {
    dutyId: FAKE_DUTY_ID_1,
    date: '2027-01-18',
    choreTypeId: DISHES,
    childUserId: CHILDREN.taro.userId,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const stored = () => world.calendar.get(calendarKey(dutySk('2027-01', '2027-01-18', DISHES)));
const change = (child: keyof typeof CHILDREN, dutyId = FAKE_DUTY_ID_1) =>
  calendarService.changeDutyChild(ctx, dutyId, CHILDREN[child].userId, { now: NOW });

describe('changeDutyChild', () => {
  it('取引は 2 項目で、条件式と更新式の属性名はすべて ExpressionAttributeNames で置き換える', async () => {
    const outcome = await change('hanako');
    expect(outcome.ok).toBe(true);
    const items = world.mock.commandCalls(TransactWriteCommand).at(-1)?.args[0].input.TransactItems;
    expect(items).toHaveLength(2);
    const update = items?.[0]?.Update;
    expect(update?.ConditionExpression).toBe('#status = :todo AND #version = :v AND #dutyId = :id');
    expect(update?.UpdateExpression).toBe(
      'SET #childUserId = :child, #origin = :origin, #version = #version + :one, #updatedAt = :now',
    );
    for (const expression of [update?.ConditionExpression, update?.UpdateExpression]) {
      // 別名（# や :）の付かない属性名が式に残っていない
      expect(expression?.replace(/[#:]\w+/g, '').match(/\b(?!SET|AND)[a-z]\w*\b/g) ?? []).toEqual(
        [],
      );
    }
    expect(update?.ExpressionAttributeValues).toMatchObject({
      ':todo': 'todo',
      ':v': 1,
      ':id': FAKE_DUTY_ID_1,
      ':origin': 'manual',
    });
    const guard = items?.[1]?.ConditionCheck;
    expect(guard?.ConditionExpression).toBe(
      'attribute_not_exists(#confirmed) OR #confirmed = :false',
    );
    expect(guard?.ExpressionAttributeNames).toEqual({ '#confirmed': 'confirmed' });
  });

  it('書けたら version が 1 増え、origin は manual、updatedAt は渡した時刻になる', async () => {
    await change('jiro');
    expect(stored()).toMatchObject({
      childUserId: CHILDREN.jiro.userId,
      origin: 'manual',
      version: 2,
      updatedAt: NOW.toISOString(),
    });
  });

  it('version だけが競合したときは、読み直して 1 回だけやり直す', async () => {
    world.hooks.beforeTransaction(1, () => {
      const duty = stored();
      if (duty) Object.assign(duty, { version: 7 });
    });
    const outcome = await change('hanako');
    expect(outcome.ok && outcome.value.version).toBe(8);
    expect(world.hooks.transactionSizes).toEqual([2, 2]);
  });

  it('2 回続けて競合すると INTERNAL になり、担当は変わらない', async () => {
    world.hooks.failTransaction(1, 'TransactionConflict');
    world.hooks.failTransaction(2, 'TransactionConflict');
    expect(await change('hanako')).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(stored()?.childUserId).toBe(CHILDREN.taro.userId);
  });

  it('ConditionalCheckFailed と TransactionConflict 以外の Code は読み直さず投げる', async () => {
    world.hooks.failTransaction(1, 'ThrottlingError');
    await expect(change('hanako')).rejects.toBeDefined();
    expect(world.hooks.transactionSizes).toEqual([2]);
  });

  it('担当がなければ NOT_FOUND で、子供の指定は読まれない', async () => {
    const childUserId = vi.fn(() => CHILDREN.hanako.userId);
    const outcome = await calendarService.changeDutyChild(ctx, FAKE_DUTY_ID_2, childUserId);
    expect(outcome).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(childUserId).not.toHaveBeenCalled();
  });

  it('同じ子供なら書かずに、いまの担当を返す', async () => {
    const outcome = await change('taro');
    expect(outcome.ok && outcome.value).toMatchObject({ version: 1, origin: 'rule' });
    expect(world.hooks.transactionSizes).toEqual([]);
  });
});
