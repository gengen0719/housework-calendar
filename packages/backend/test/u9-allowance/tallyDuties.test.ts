import { describe, expect, it } from 'vitest';
import type { DutyRecord } from '../../src/models';
import { tallyDuties } from '../../src/services/allowanceService';

const TAKU = 'child-a';
const ADMIN = 'admin-a';
const DISHES = 'type-dishes';
const BATH = 'type-bath';

let seq = 0;
const duty = (overrides: Partial<DutyRecord> & { unitPrice?: number | null } = {}): DutyRecord => {
  seq += 1;
  return {
    dutyId: `duty-${seq}`,
    familyId: 'fam',
    month: '2027-01',
    date: '2027-01-05',
    choreTypeId: DISHES,
    childUserId: TAKU,
    status: 'done',
    origin: 'rule',
    version: 1,
    createdAt: '2026-12-20T00:00:00.000Z',
    updatedAt: '2026-12-20T00:00:00.000Z',
    unitPrice: 100,
    ...overrides,
  } as DutyRecord;
};

const tally = (duties: DutyRecord[]) =>
  tallyDuties(duties, new Set([ADMIN]), new Set([DISHES, BATH]));

describe('tallyDuties（BR10.2〜BR10.4、BR10.13）', () => {
  it('空なら何も数えない', () => {
    const result = tally([]);
    expect(result.byChild.size).toBe(0);
    expect(result.doneCount).toBe(0);
    expect(result.anomalies).toEqual({
      withoutPrice: [],
      ownerNotChild: [],
      choreTypeMissing: new Map(),
    });
  });

  it('「済」だけを数え、(種類, 単価) ごとに回数をまとめる', () => {
    const result = tally([
      duty(),
      duty(),
      duty({ status: 'todo' }),
      duty({ status: 'skipped' }),
      duty({ choreTypeId: BATH }),
    ]);
    expect(result.byChild.get(TAKU)).toEqual([
      { choreTypeId: DISHES, unitPrice: 100, count: 2 },
      { choreTypeId: BATH, unitPrice: 100, count: 1 },
    ]);
    expect(result.doneCount).toBe(3);
  });

  it('単価 0 円は有効で、異常にならない', () => {
    const result = tally([duty({ unitPrice: 0 }), duty({ unitPrice: 0 })]);
    expect(result.byChild.get(TAKU)).toEqual([{ choreTypeId: DISHES, unitPrice: 0, count: 2 }]);
    expect(result.anomalies.withoutPrice).toEqual([]);
  });

  it('単価が undefined／null の「済」は数えず、担当の ID を並び順のまま記録する', () => {
    const a = duty({ unitPrice: undefined });
    const b = duty({ unitPrice: null as unknown as number });
    const ok = duty();
    const result = tally([a, ok, b]);
    expect(result.anomalies.withoutPrice).toEqual([a.dutyId, b.dutyId]);
    expect(result.byChild.get(TAKU)).toEqual([{ choreTypeId: DISHES, unitPrice: 100, count: 1 }]);
    expect(result.doneCount).toBe(1);
  });

  it('同じ種類で単価が 2 つあれば 2 行になる', () => {
    const result = tally([
      duty({ unitPrice: 100 }),
      duty({ unitPrice: 120 }),
      duty({ unitPrice: 100 }),
    ]);
    expect(result.byChild.get(TAKU)).toEqual([
      { choreTypeId: DISHES, unitPrice: 100, count: 2 },
      { choreTypeId: DISHES, unitPrice: 120, count: 1 },
    ]);
  });

  it('持ち主が管理者の ID なら数えず、行も作らず、記録する', () => {
    const bad = duty({ childUserId: ADMIN });
    const result = tally([bad]);
    expect(result.byChild.size).toBe(0);
    expect(result.anomalies.ownerNotChild).toEqual([bad.dutyId]);
    expect(result.doneCount).toBe(0);
  });

  it('種類が一覧にない担当は数えたうえで、種類ごとに担当の数を記録する', () => {
    const result = tally([
      duty({ choreTypeId: 'type-gone', date: '2027-01-01' }),
      duty({ choreTypeId: 'type-gone', date: '2027-01-02' }),
      duty({ choreTypeId: 'type-gone-2' }),
    ]);
    expect(result.anomalies.choreTypeMissing).toEqual(
      new Map([
        ['type-gone', 2],
        ['type-gone-2', 1],
      ]),
    );
    expect(result.doneCount).toBe(3);
    expect(result.byChild.get(TAKU)?.map((l) => l.count)).toEqual([2, 1]);
  });

  it('count・単価は整数のまま、子供ごとに分かれる', () => {
    const result = tally([duty({ childUserId: 'child-b', unitPrice: 50 }), duty()]);
    expect([...result.byChild.keys()]).toEqual(['child-b', TAKU]);
    for (const lines of result.byChild.values()) {
      for (const line of lines) {
        expect(Number.isInteger(line.count)).toBe(true);
        expect(Number.isInteger(line.unitPrice)).toBe(true);
      }
    }
  });

  it('入力の配列を書き換えない', () => {
    const duties = [duty(), duty({ status: 'todo' })];
    const snapshot = JSON.stringify(duties);
    tally(duties);
    expect(JSON.stringify(duties)).toBe(snapshot);
  });
});
