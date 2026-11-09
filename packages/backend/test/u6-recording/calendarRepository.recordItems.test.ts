import { describe, expect, it } from 'vitest';
import { buildRecordItems, buildUnitPriceGuard } from '../../src/repositories/calendarRepository';
import type { DutyRecord } from '../../src/models';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHILD_USER_ID_1,
} from '../fixtures/fakeSecrets';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const duty: DutyRecord = {
  dutyId: FAKE_U6_DUTY_ID_A,
  familyId: FAMILY_ID,
  month: '2027-01',
  date: '2027-01-07',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 3,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2026-12-20T00:00:00.000Z',
};
const NOW = new Date('2027-01-07T07:42:00.000Z');

/**
 * 式に「素の属性名」（# の別名でも :値 でも関数名でもない識別子）が残っていないかを確かめる。
 * 関数名・:値・# の別名を消したあと、識別子が 1 つも残らなければ、すべて別名で書けている（NFR4.50）。
 */
function rawAttributeNames(expression: string): string[] {
  const cleaned = expression
    .replace(/attribute_not_exists|attribute_exists|begins_with|contains/g, '') // 関数名
    .replace(/#[A-Za-z_][A-Za-z0-9_]*/g, '') // # の別名
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '') // :値
    .replace(/\b(SET|REMOVE|AND|OR)\b/g, ''); // DynamoDB の式のキーワード
  return cleaned.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
}

describe('buildRecordItems / buildUnitPriceGuard（NFR4.50、BR7.6、BR7.7）', () => {
  it('取引は 3 項目（担当の Update・月の ConditionCheck・種類の ConditionCheck）', () => {
    const items = buildRecordItems(duty, 100, { userId: FAKE_CHILD_USER_ID_1 }, NOW);
    expect(items).toHaveLength(3);
    expect('Update' in items[0]!).toBe(true);
    expect('ConditionCheck' in items[1]!).toBe(true);
    expect('ConditionCheck' in items[2]!).toBe(true);
  });

  it('担当の Update は 6 項目を書き、version を +1 する', () => {
    const items = buildRecordItems(duty, 100, { userId: FAKE_CHILD_USER_ID_1 }, NOW);
    const update = (items[0] as { Update: { UpdateExpression: string } }).Update;
    expect(update.UpdateExpression).toContain('#status = :done');
    expect(update.UpdateExpression).toContain('#recordedAt = :now');
    expect(update.UpdateExpression).toContain('#recordedBy = :by');
    expect(update.UpdateExpression).toContain('#unitPrice = :price');
    expect(update.UpdateExpression).toContain('#updatedAt = :now');
    expect(update.UpdateExpression).toContain('#version = #version + :one');
  });

  it('条件式は status=todo・version・dutyId・childUserId', () => {
    const items = buildRecordItems(duty, 100, { userId: FAKE_CHILD_USER_ID_1 }, NOW);
    const update = (items[0] as { Update: { ConditionExpression: string } }).Update;
    expect(update.ConditionExpression).toBe(
      '#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by',
    );
  });

  it('条件式・更新式のすべての属性名が ExpressionAttributeNames で置き換えられている（NFR4.50）', () => {
    const items = buildRecordItems(duty, 100, { userId: FAKE_CHILD_USER_ID_1 }, NOW);
    for (const item of items) {
      const inner = item as Record<
        string,
        {
          ExpressionAttributeNames?: Record<string, string>;
          ConditionExpression?: string;
          UpdateExpression?: string;
        }
      >;
      const op = inner.Update ?? inner.ConditionCheck!;
      const names = op.ExpressionAttributeNames ?? {};
      const expressions = [op.UpdateExpression, op.ConditionExpression].filter(
        (e): e is string => typeof e === 'string',
      );
      for (const expression of expressions) {
        // 式に素の属性名が残っていない（すべて # の別名で書けている）
        expect(rawAttributeNames(expression)).toEqual([]);
        // 別名の定義（#status → status など）が 1 つ以上ある
        expect(Object.keys(names).length).toBeGreaterThan(0);
      }
    }
  });

  it('種類の ConditionCheck は単価が読んだ値のまま（#unitPrice = :price）', () => {
    const guard = buildUnitPriceGuard(FAMILY_ID, FAKE_CHORE_TYPE_ID_1, 100);
    expect(guard.ConditionCheck.ConditionExpression).toBe('#unitPrice = :price');
    expect(guard.ConditionCheck.ExpressionAttributeNames).toEqual({ '#unitPrice': 'unitPrice' });
    expect(guard.ConditionCheck.ExpressionAttributeValues).toEqual({ ':price': 100 });
  });

  it('項目数は 100 を超えない（3 項目で十分小さい）', () => {
    const items = buildRecordItems(duty, 100, { userId: FAKE_CHILD_USER_ID_1 }, NOW);
    expect(items.length).toBeLessThanOrEqual(100);
  });
});
