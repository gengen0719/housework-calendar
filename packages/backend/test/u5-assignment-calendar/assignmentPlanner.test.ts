import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chunkSize,
  creationRange,
  findOverlaps,
  isSubsetOfChanges,
  normalizeRules,
  planDutyChanges,
  splitIntoChunks,
  TRANSACTION_ITEM_LIMIT,
  type DutyOperation,
  type HashedChange,
} from '../../src/services/assignmentPlanner';
import type { AssignmentRuleRecord, DutyRecord } from '../../src/models';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
} from '../fixtures/fakeSecrets';

const DISHES = FAKE_CHORE_TYPE_ID_1;
const LAUNDRY = FAKE_CHORE_TYPE_ID_2;
const TARO = FAKE_CHILD_USER_ID_1;
const HANAKO = FAKE_CHILD_USER_ID_2;

const duty = (date: string, overrides: Partial<DutyRecord> = {}): DutyRecord => ({
  dutyId: randomUUID(),
  familyId: 'fam-yamada',
  month: date.slice(0, 7),
  date,
  choreTypeId: DISHES,
  childUserId: TARO,
  status: 'todo',
  origin: 'rule',
  version: 1,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2026-12-20T00:00:00.000Z',
  ...overrides,
});

const kinds = (operations: DutyOperation[]): string[] =>
  operations.map((op) =>
    op.kind === 'create'
      ? `create ${op.date}`
      : op.kind === 'change'
        ? `change ${op.duty.date}`
        : `delete ${op.duty.date}`,
  );

describe('assignmentPlanner（純粋な計画）', () => {
  it('行を整える: 同じ種類と子供の行は曜日を合わせ、曜日の重なりを 1 つにして並べる', () => {
    const rows: AssignmentRuleRecord[] = [
      { choreTypeId: LAUNDRY, childUserId: TARO, weekdays: [3] },
      { choreTypeId: DISHES, childUserId: TARO, weekdays: [4, 1, 1] },
      { choreTypeId: DISHES, childUserId: TARO, weekdays: [1, 0] },
    ];
    expect(normalizeRules(rows)).toEqual([
      { choreTypeId: DISHES, childUserId: TARO, weekdays: [0, 1, 4] },
      { choreTypeId: LAUNDRY, childUserId: TARO, weekdays: [3] },
    ]);
  });

  it('重なり: 過ぎた日を含む月のすべての日で、同じ種類に 2 人入る日を探す', () => {
    const rows: AssignmentRuleRecord[] = [
      { choreTypeId: DISHES, childUserId: TARO, weekdays: [1] },
      { choreTypeId: DISHES, childUserId: HANAKO, weekdays: [1, 2] },
      { choreTypeId: LAUNDRY, childUserId: HANAKO, weekdays: [1] },
    ];
    const overlaps = findOverlaps('2027-01', rows);
    expect(overlaps.map((o) => o.date)).toEqual([
      '2027-01-04',
      '2027-01-11',
      '2027-01-18',
      '2027-01-25',
    ]);
    expect(overlaps[0]).toEqual({
      date: '2027-01-04',
      weekday: 1,
      choreTypeId: DISHES,
      childUserIds: [TARO, HANAKO].sort(),
    });
    expect(findOverlaps('2027-01', rows.slice(0, 1))).toEqual([]);
  });

  it('作る範囲: 来月は 1 日から、今月の初めては今日から、保存し直しは明日から', () => {
    expect(creationRange('2027-02', '2027-01-13', false)).toHaveLength(28);
    expect(creationRange('2027-02', '2027-01-13', true)[0]).toBe('2027-02-01');
    expect(creationRange('2027-01', '2027-01-13', false)[0]).toBe('2027-01-13');
    expect(creationRange('2027-01', '2027-01-13', true)[0]).toBe('2027-01-14');
    expect(creationRange('2027-01', '2027-01-31', true)).toEqual([]);
    expect(creationRange('2027-03', '2027-01-13', false)).toEqual([]);
  });

  it('比べ: 作る・子供を変える・消す・何もしないを決め、「済」「×」と範囲の外は触らない', () => {
    const plan = planDutyChanges({
      range: ['2027-01-18', '2027-01-21', '2027-01-25', '2027-01-28'],
      rules: [{ choreTypeId: DISHES, childUserId: HANAKO, weekdays: [1, 4] }],
      existing: [
        duty('2027-01-11'),
        duty('2027-01-18'),
        duty('2027-01-21', { childUserId: HANAKO }),
        duty('2027-01-21', { choreTypeId: LAUNDRY }),
        duty('2027-01-25', { status: 'done' }),
        duty('2027-01-28', { status: 'skipped' }),
      ],
      newId: () => 'new-id',
    });
    // 18 日は子供を変える、21 日の洗濯物たたみは消す、21 日の皿洗い（同じ子供）は何もしない、
    // 25 日・28 日は「済」「×」で触らない（新しい担当も作らない）、11 日は範囲の外
    expect(kinds(plan.operations)).toEqual(['delete 2027-01-21', 'change 2027-01-18']);
    expect(plan.changes).toEqual([]);
  });

  it('比べ: 担当がなければ作り、確かめの一覧には manual と swap の「未」だけが入る', () => {
    const plan = planDutyChanges({
      range: ['2027-01-18', '2027-01-25'],
      rules: [{ choreTypeId: DISHES, childUserId: HANAKO, weekdays: [1] }],
      existing: [
        duty('2027-01-18', { origin: 'manual', version: 4 }),
        duty('2027-01-21', { origin: 'swap' }),
      ],
      newId: () => 'created-id',
    });
    expect(kinds(plan.operations)).toEqual(['change 2027-01-18', 'create 2027-01-25']);
    expect(plan.operations[1]).toMatchObject({ kind: 'create', dutyId: 'created-id' });
    const row: HashedChange = {
      date: '2027-01-18',
      choreTypeId: DISHES,
      fromChildUserId: TARO,
      toChildUserId: HANAKO,
      version: 4,
    };
    expect(plan.changes).toEqual([row]);
    expect(isSubsetOfChanges([row], [row])).toBe(true);
    expect(isSubsetOfChanges([], [])).toBe(true);
    expect(isSubsetOfChanges([{ ...row, version: 5 }], [row])).toBe(false);
  });

  it('チャンクの分け方: 4 種類の 124 件は 47・47・30 件で、項目数は 99・99・65', () => {
    const operations: DutyOperation[] = [];
    const types = [DISHES, LAUNDRY, 'type-c', 'type-d'];
    for (let day = 1; day <= 31; day++) {
      for (const choreTypeId of types) {
        operations.push({
          kind: 'create',
          date: `2027-01-${String(day).padStart(2, '0')}`,
          choreTypeId,
          childUserId: TARO,
          dutyId: randomUUID(),
        });
      }
    }
    const chunks = splitIntoChunks(operations);
    expect(chunks.map((chunk) => chunk.length)).toEqual([47, 47, 30]);
    expect(chunks.map(chunkSize)).toEqual([99, 99, 65]);
  });

  it('チャンクの分け方: 310 件（10 種類）は 8 つに分かれ、どれも 100 項目以下', () => {
    const operations: DutyOperation[] = [];
    const types = Array.from({ length: 10 }, (_, index) => `type-${index}`);
    for (let day = 1; day <= 31; day++) {
      for (const choreTypeId of types) {
        operations.push({
          kind: 'create',
          date: `2027-01-${String(day).padStart(2, '0')}`,
          choreTypeId,
          childUserId: TARO,
          dutyId: randomUUID(),
        });
      }
    }
    const chunks = splitIntoChunks(operations);
    expect(chunks).toHaveLength(8);
    expect(chunks.every((chunk) => chunkSize(chunk) <= TRANSACTION_ITEM_LIMIT)).toBe(true);
    expect(chunks.map((chunk) => chunk.length)).toEqual([44, 44, 44, 44, 44, 44, 44, 2]);
  });

  it('チャンクの分け方: 消すだけのチャンクは種類の確かめを付けず、子供を変えるは 1 項目', () => {
    const deletes: DutyOperation[] = Array.from({ length: 49 }, (_, index) => ({
      kind: 'delete' as const,
      duty: duty(`2027-01-${String((index % 28) + 1).padStart(2, '0')}`, {
        choreTypeId: `type-${index}`,
      }),
    }));
    // 消すは 2 項目 + 月の確かめ 1 = 99
    expect(chunkSize(deletes)).toBe(99);
    expect(splitIntoChunks(deletes)).toHaveLength(1);
    const changes: DutyOperation[] = Array.from({ length: 95 }, (_, index) => ({
      kind: 'change' as const,
      duty: duty('2027-01-18', { choreTypeId: `type-${index % 4}` }),
      toChildUserId: HANAKO,
    }));
    // 変えるは 1 項目、確かめは 1 + 4 種類
    expect(chunkSize(changes)).toBe(100);
    expect(splitIntoChunks(changes)).toHaveLength(1);
    expect(splitIntoChunks([...changes, ...changes.slice(0, 1)])).toHaveLength(2);
  });
});
