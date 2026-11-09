import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as calendarRepository from '../../src/repositories/calendarRepository';
import type { DutyRecord } from '../../src/models';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
  FAKE_OTHER_FAMILY_ID,
} from '../fixtures/fakeSecrets';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { seedAssignment, seedDuty, seedMonthState } from './helpers/seed';

let world: ReturnType<typeof setupWorld>;

beforeEach(() => {
  world = setupWorld();
  process.env.ENTRY = 'api';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = new Date('2027-01-13T03:00:00.000Z');

const duty = (overrides: Partial<DutyRecord> = {}): DutyRecord => ({
  dutyId: randomUUID(),
  familyId: FAMILY_ID,
  month: '2027-01',
  date: '2027-01-18',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 2,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

interface ExpressionItem {
  ConditionExpression?: string;
  UpdateExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
}

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'SET',
  'REMOVE',
  'attribute_exists',
  'attribute_not_exists',
  'begins_with',
  'contains',
]);

/** 取引の 1 項目の条件式・更新式を調べ、属性名がすべて # の別名で書かれ、値の置き場もそろっていることを確かめる */
function expectNamesReplaced(entry: Record<string, unknown>): void {
  const operation = Object.values(entry)[0] as ExpressionItem;
  const names = operation.ExpressionAttributeNames ?? {};
  const values = operation.ExpressionAttributeValues ?? {};
  for (const expression of [operation.ConditionExpression, operation.UpdateExpression]) {
    if (!expression) continue;
    const usedNames = expression.match(/#\w+/g) ?? [];
    const usedValues = expression.match(/:\w+/g) ?? [];
    const bare =
      expression
        .replace(/#\w+/g, ' ')
        .replace(/:\w+/g, ' ')
        .match(/[A-Za-z_]\w*/g)
        ?.filter((word) => !KEYWORDS.has(word)) ?? [];
    expect(bare, `別名を使っていない属性名: ${expression}`).toEqual([]);
    for (const name of usedNames) expect(names).toHaveProperty([name]);
    for (const value of usedValues) expect(values).toHaveProperty([value]);
  }
}

describe('calendarRepository（キー、条件式、取り消しの読み分け）', () => {
  it('キー: すべてのキーに家族の ID が入り、sk は割り当て・担当・月の状態・引き当てで決まった形になる', () => {
    expect(calendarRepository.assignmentSortKey('2027-01')).toBe('M#2027-01#A');
    expect(calendarRepository.monthStateSortKey('2027-01')).toBe('M#2027-01#S');
    expect(calendarRepository.dutySortKey('2027-01', '2027-01-18', 'chore-1')).toBe(
      'M#2027-01#D#2027-01-18#chore-1',
    );
    expect(calendarRepository.dutyRefSortKey('duty-1')).toBe('DID#duty-1');
    const created = calendarRepository.buildCreateDutyItems(duty());
    for (const entry of created) {
      expect((entry.Put.Item as { familyId: string }).familyId).toBe(FAMILY_ID);
    }
    for (const entry of calendarRepository.buildDeleteDutyItems(duty())) {
      expect(entry.Delete.Key.familyId).toBe(FAMILY_ID);
    }
    expect(calendarRepository.buildMonthGuard(FAMILY_ID, '2027-01').ConditionCheck.Key).toEqual({
      familyId: FAMILY_ID,
      sk: 'M#2027-01#S',
    });
  });

  it('条件式・更新式の属性名は、すべての書き込みで # の別名に置き換えられている', () => {
    const target = duty();
    const items = [
      ...calendarRepository.buildCreateDutyItems(target),
      ...calendarRepository.buildDeleteDutyItems(target),
      calendarRepository.buildChangeChildItem(target, FAKE_CHILD_USER_ID_2, 'rule', NOW),
      calendarRepository.buildMonthGuard(FAMILY_ID, '2027-01'),
      calendarRepository.buildChoreTypeGuard(FAMILY_ID, FAKE_CHORE_TYPE_ID_1),
    ];
    expect(items).toHaveLength(7);
    for (const item of items) expectNamesReplaced(item);
  });

  it('子供を変える条件は「未」「読んだ version」「同じ dutyId」で、version は 1 増える', () => {
    const target = duty({ version: 4 });
    const change = calendarRepository.buildChangeChildItem(
      target,
      FAKE_CHILD_USER_ID_2,
      'manual',
      NOW,
    ).Update;
    expect(change.ConditionExpression).toBe('#status = :todo AND #version = :v AND #dutyId = :id');
    expect(change.UpdateExpression).toContain('#version = #version + :one');
    expect(change.ExpressionAttributeValues).toMatchObject({
      ':todo': 'todo',
      ':v': 4,
      ':id': target.dutyId,
      ':origin': 'manual',
      ':child': FAKE_CHILD_USER_ID_2,
    });
  });

  it('月の確かめは ChoreTypes ではなく Calendar、種類の確かめは ChoreTypes の「使う」を見る', () => {
    expect(calendarRepository.buildMonthGuard(FAMILY_ID, '2027-01').ConditionCheck.TableName).toBe(
      CALENDAR_TABLE,
    );
    const guard = calendarRepository.buildChoreTypeGuard(
      FAMILY_ID,
      FAKE_CHORE_TYPE_ID_2,
    ).ConditionCheck;
    expect(guard.TableName).toBe(CHORE_TYPES_TABLE);
    expect(guard.Key).toEqual({ familyId: FAMILY_ID, sk: `TYPE#${FAKE_CHORE_TYPE_ID_2}` });
    expect(guard.ConditionExpression).toBe('#active = :true');
  });

  it('割り当ての Put: 行が 0 行のときは choreTypeIds を置かない', () => {
    const base = {
      familyId: FAMILY_ID,
      month: '2027-01',
      updatedAt: NOW.toISOString(),
      updatedByUserId: 'user-mother',
    };
    const empty = calendarRepository.buildAssignmentPut({ ...base, rules: [] });
    expect(empty.Put.Item).not.toHaveProperty('choreTypeIds');
    const some = calendarRepository.buildAssignmentPut({
      ...base,
      rules: [],
      choreTypeIds: new Set([FAKE_CHORE_TYPE_ID_1]),
    });
    expect(
      (some.Put.Item as { choreTypeIds: Set<string> }).choreTypeIds.has(FAKE_CHORE_TYPE_ID_1),
    ).toBe(true);
    expect(calendarRepository.choreTypeIdsOf([])).toBeUndefined();
  });

  it('月の読み取り: 強い整合性で、続きがあっても最後まで読み、ほかの家族の項目は読まない', async () => {
    seedAssignment(world.calendar, '2027-01', []);
    seedMonthState(world.calendar, '2027-01', true);
    for (const date of ['2027-01-18', '2027-01-21', '2027-01-25']) {
      seedDuty(world.calendar, {
        dutyId: randomUUID(),
        date,
        choreTypeId: FAKE_CHORE_TYPE_ID_1,
        childUserId: FAKE_CHILD_USER_ID_1,
      });
    }
    seedDuty(world.calendar, {
      dutyId: randomUUID(),
      date: '2027-01-18',
      choreTypeId: FAKE_CHORE_TYPE_ID_1,
      childUserId: FAKE_CHILD_USER_ID_1,
      familyId: FAKE_OTHER_FAMILY_ID,
    });
    seedDuty(world.calendar, {
      dutyId: randomUUID(),
      date: '2027-02-01',
      choreTypeId: FAKE_CHORE_TYPE_ID_1,
      childUserId: FAKE_CHILD_USER_ID_1,
    });
    world.hooks.queryPageSize = 2;
    const month = await calendarRepository.loadMonth(FAMILY_ID, '2027-01');
    expect(month.duties.map((d) => d.date)).toEqual(['2027-01-18', '2027-01-21', '2027-01-25']);
    expect(month.assignment).toMatchObject({ rules: [] });
    expect(month.state?.confirmed).toBe(true);
    expect(month.duties[0]).not.toHaveProperty('sk');
    const reads = world.hooks.readLog.filter((entry) => entry.table === CALENDAR_TABLE);
    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(reads.every((entry) => entry.operation === 'Query' && entry.consistent)).toBe(true);
  });

  it('種類の使用: 担当か割り当てに使われていれば true、1 件当たったら続きを読まない', async () => {
    for (const date of ['2027-01-18', '2027-01-21', '2027-01-25']) {
      seedDuty(world.calendar, {
        dutyId: randomUUID(),
        date,
        choreTypeId: FAKE_CHORE_TYPE_ID_1,
        childUserId: FAKE_CHILD_USER_ID_1,
      });
    }
    world.hooks.queryPageSize = 1;
    expect(await calendarRepository.isChoreTypeUsed(FAMILY_ID, FAKE_CHORE_TYPE_ID_1)).toBe(true);
    const reads = world.hooks.readLog.filter((entry) => entry.table === CALENDAR_TABLE);
    expect(reads).toHaveLength(1);
    expect(reads[0]?.consistent).toBe(true);
    expect(await calendarRepository.isChoreTypeUsed(FAMILY_ID, FAKE_CHORE_TYPE_ID_2)).toBe(false);
    expect(
      await calendarRepository.isChoreTypeUsed(FAKE_OTHER_FAMILY_ID, FAKE_CHORE_TYPE_ID_1),
    ).toBe(false);
  });

  it('取り消しの読み分け: 競合の Code だけを競合とし、ほかの Code と読み取れない失敗は投げ直す', async () => {
    expect(
      calendarRepository.classifyCancellation([
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'TransactionConflict' },
      ]),
    ).toBe('conflict');
    expect(
      calendarRepository.classifyCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ThrottlingError' },
      ]),
    ).toBeUndefined();
    expect(calendarRepository.classifyCancellation([{ Code: 'None' }])).toBeUndefined();
    expect(calendarRepository.classifyCancellation(undefined)).toBeUndefined();

    world.hooks.failTransaction(1, 'TransactionConflict');
    const items = calendarRepository.buildCreateDutyItems(duty());
    expect(await calendarRepository.writeTransaction(items)).toBe('conflict');
    world.hooks.failTransaction(2, 'ThrottlingError');
    await expect(calendarRepository.writeTransaction(items)).rejects.toThrow();
    expect(await calendarRepository.writeTransaction(items)).toBe('written');
  });
});
