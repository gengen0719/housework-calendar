import { describe, expect, it } from 'vitest';
import {
  buildMarkDoneItems,
  buildResetStatusItems,
} from '../../src/repositories/calendarRepository';
import type { DutyRecord } from '../../src/models';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  FAKE_U7_DUTY_ID_A,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHILD_USER_ID_1,
  FAKE_ADMIN_USER_ID,
} from '../fixtures/fakeSecrets';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const baseDuty: DutyRecord = {
  dutyId: FAKE_U7_DUTY_ID_A,
  familyId: FAMILY_ID,
  month: '2027-01',
  date: '2027-01-05',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 3,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2026-12-20T00:00:00.000Z',
};
const NOW = new Date('2027-01-07T11:00:00.000Z');
const ADMIN = { userId: FAKE_ADMIN_USER_ID };

/**
 * 式に「素の属性名」（# の別名でも :値 でも関数名でもない識別子）が残っていないかを確かめる（NFR4.69）。
 */
function rawAttributeNames(expression: string): string[] {
  const cleaned = expression
    .replace(/attribute_not_exists|attribute_exists|begins_with|contains/g, '')
    .replace(/#[A-Za-z_][A-Za-z0-9_]*/g, '')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '')
    .replace(/\b(SET|REMOVE|AND|OR)\b/g, '');
  return cleaned.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

type AnyItem = Record<
  string,
  {
    ExpressionAttributeNames?: Record<string, string>;
    ConditionExpression?: string;
    UpdateExpression?: string;
  }
>;

function assertAllAliased(items: readonly unknown[]): void {
  for (const item of items) {
    const inner = item as AnyItem;
    const op = inner.Update ?? inner.ConditionCheck!;
    const names = op.ExpressionAttributeNames ?? {};
    const expressions = [op.UpdateExpression, op.ConditionExpression].filter(
      (e): e is string => typeof e === 'string',
    );
    for (const expression of expressions) {
      expect(rawAttributeNames(expression)).toEqual([]);
      expect(Object.keys(names).length).toBeGreaterThan(0);
    }
  }
}

describe('buildMarkDoneItems（U7。BR8.6、NFR4.69）', () => {
  it('取引は 3 項目（担当の Update・月の ConditionCheck・種類の ConditionCheck）', () => {
    const items = buildMarkDoneItems(baseDuty, 120, ADMIN, NOW);
    expect(items).toHaveLength(3);
    expect('Update' in items[0]!).toBe(true);
    expect('ConditionCheck' in items[1]!).toBe(true);
    expect('ConditionCheck' in items[2]!).toBe(true);
  });

  it('担当の Update は記録の 3 項目を同時に書き、version を +1 する', () => {
    const update = (
      buildMarkDoneItems(baseDuty, 120, ADMIN, NOW)[0] as {
        Update: { UpdateExpression: string; ExpressionAttributeValues: Record<string, unknown> };
      }
    ).Update;
    expect(update.UpdateExpression).toContain('#status = :done');
    expect(update.UpdateExpression).toContain('#recordedAt = :now');
    expect(update.UpdateExpression).toContain('#recordedBy = :by');
    expect(update.UpdateExpression).toContain('#unitPrice = :price');
    expect(update.UpdateExpression).toContain('#version = #version + :one');
    // 記録した人は管理者、単価は読んだ値
    expect(update.ExpressionAttributeValues[':by']).toBe(FAKE_ADMIN_USER_ID);
    expect(update.ExpressionAttributeValues[':price']).toBe(120);
  });

  it('条件は #status=:from・version・dutyId で、#childUserId を付けない（BR8.6）', () => {
    const update = (
      buildMarkDoneItems(baseDuty, 120, ADMIN, NOW)[0] as {
        Update: { ConditionExpression: string };
      }
    ).Update;
    expect(update.ConditionExpression).toBe('#status = :from AND #version = :v AND #dutyId = :id');
    expect(update.ConditionExpression).not.toContain('childUserId');
  });

  it('×→済 のとき :from は skipped（表の左の状態を入れる）', () => {
    const skipped: DutyRecord = { ...baseDuty, status: 'skipped' };
    const update = (
      buildMarkDoneItems(skipped, 120, ADMIN, NOW)[0] as {
        Update: { ExpressionAttributeValues: Record<string, unknown> };
      }
    ).Update;
    expect(update.ExpressionAttributeValues[':from']).toBe('skipped');
  });

  it('すべての属性名が # の別名で書けている（NFR4.69）', () => {
    assertAllAliased(buildMarkDoneItems(baseDuty, 120, ADMIN, NOW));
  });

  it('担当に Put・Delete を発行しない（作らない・消さない）', () => {
    for (const item of buildMarkDoneItems(baseDuty, 120, ADMIN, NOW)) {
      expect('Put' in item).toBe(false);
      expect('Delete' in item).toBe(false);
    }
  });

  it('項目数は 100 を超えない', () => {
    expect(buildMarkDoneItems(baseDuty, 120, ADMIN, NOW).length).toBeLessThanOrEqual(100);
  });
});

describe('buildResetStatusItems（U7。BR8.5、NFR4.69）', () => {
  it('取引は 2 項目（担当の Update・月の ConditionCheck）。単価の確かめは付けない', () => {
    const done: DutyRecord = { ...baseDuty, status: 'done' };
    const items = buildResetStatusItems(done, 'todo', NOW);
    expect(items).toHaveLength(2);
    expect('Update' in items[0]!).toBe(true);
    expect('ConditionCheck' in items[1]!).toBe(true);
  });

  it('記録の 3 項目を同時に REMOVE し、version を +1 する（BR8.5）', () => {
    const done: DutyRecord = { ...baseDuty, status: 'done' };
    const update = (
      buildResetStatusItems(done, 'todo', NOW)[0] as {
        Update: { UpdateExpression: string };
      }
    ).Update;
    expect(update.UpdateExpression).toContain('REMOVE #recordedAt, #recordedBy, #unitPrice');
    expect(update.UpdateExpression).toContain('#status = :to');
    expect(update.UpdateExpression).toContain('#version = #version + :one');
    // unitPrice は書かない（SET には現れない）
    expect(update.UpdateExpression).not.toContain('#unitPrice = ');
  });

  it(':to と :from が操作に応じて入る（cancel 済→未、markSkipped 未→×）', () => {
    const done: DutyRecord = { ...baseDuty, status: 'done' };
    const cancel = (
      buildResetStatusItems(done, 'todo', NOW)[0] as {
        Update: { ExpressionAttributeValues: Record<string, unknown> };
      }
    ).Update;
    expect(cancel.ExpressionAttributeValues[':to']).toBe('todo');
    expect(cancel.ExpressionAttributeValues[':from']).toBe('done');

    const todo: DutyRecord = { ...baseDuty, status: 'todo' };
    const skip = (
      buildResetStatusItems(todo, 'skipped', NOW)[0] as {
        Update: { ExpressionAttributeValues: Record<string, unknown> };
      }
    ).Update;
    expect(skip.ExpressionAttributeValues[':to']).toBe('skipped');
    expect(skip.ExpressionAttributeValues[':from']).toBe('todo');
  });

  it('すべての属性名が # の別名で書けている（NFR4.69）', () => {
    const done: DutyRecord = { ...baseDuty, status: 'done' };
    assertAllAliased(buildResetStatusItems(done, 'todo', NOW));
  });

  it('担当に Put・Delete を発行しない', () => {
    const done: DutyRecord = { ...baseDuty, status: 'done' };
    for (const item of buildResetStatusItems(done, 'todo', NOW)) {
      expect('Put' in item).toBe(false);
      expect('Delete' in item).toBe(false);
    }
  });
});
