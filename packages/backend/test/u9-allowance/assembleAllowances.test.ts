import type { AllowanceAdjustmentLine } from '@housework/shared';
import { describe, expect, it } from 'vitest';
import {
  assembleAllowances,
  orderChildren,
  type AssembleInput,
  type TalliedLine,
} from '../../src/services/allowanceService';

const TYPES = [
  { choreTypeId: 't-dishes', name: '皿洗い' },
  { choreTypeId: 't-laundry', name: '洗濯物たたみ' },
  { choreTypeId: 't-bath', name: 'お風呂洗い' },
];
const line = (choreTypeId: string, unitPrice: number, count: number): TalliedLine => ({
  choreTypeId,
  unitPrice,
  count,
});
const adj = (adjustmentId: string, amount: number): AllowanceAdjustmentLine => ({
  adjustmentId,
  amount,
  reason: 'テストの理由',
});

const base = (overrides: Partial<AssembleInput> = {}): AssembleInput => ({
  month: '2027-01',
  currentChildren: [
    { userId: 'u-taro', displayName: '太郎' },
    { userId: 'u-hanako', displayName: '花子' },
  ],
  departedChildren: [],
  lines: new Map(),
  choreTypes: TYPES,
  adjustments: new Map(),
  ...overrides,
});

describe('assembleAllowances（BR10.4〜BR10.7）', () => {
  it('今いる子供は渡された順、抜けた子供はそのあとに表示名・userId の順', () => {
    const rows = assembleAllowances(
      base({
        departedChildren: [
          { userId: 'u-3', displayName: 'みどり' },
          { userId: 'u-2', displayName: 'あおい' },
          { userId: 'u-1', displayName: 'あおい' },
        ],
      }),
    );
    expect(rows.map((r) => [r.displayName, r.childUserId, r.current])).toEqual([
      ['太郎', 'u-taro', true],
      ['花子', 'u-hanako', true],
      ['あおい', 'u-1', false],
      ['あおい', 'u-2', false],
      ['みどり', 'u-3', false],
    ]);
    expect(orderChildren([], []).length).toBe(0);
  });

  it('行は種類の並び → 単価の低い順、一覧にない種類は最後の「不明なお手伝い」', () => {
    const rows = assembleAllowances(
      base({
        lines: new Map([
          [
            'u-taro',
            [
              line('t-gone', 70, 1),
              line('t-bath', 90, 1),
              line('t-dishes', 130, 1),
              line('t-laundry', 150, 1),
              line('t-dishes', 100, 1),
            ],
          ],
        ]),
      }),
    );
    expect(rows[0]?.lines.map((l) => [l.choreName, l.unitPrice])).toEqual([
      ['皿洗い', 100],
      ['皿洗い', 130],
      ['洗濯物たたみ', 150],
      ['お風呂洗い', 90],
      ['不明なお手伝い', 70],
    ]);
  });

  it('amount = 単価 × 回数、total = 内訳の和 + 加算・減額の和（減額が負でも）', () => {
    const rows = assembleAllowances(
      base({
        lines: new Map([['u-taro', [line('t-dishes', 100, 8), line('t-laundry', 150, 4)]]]),
        adjustments: new Map([['u-taro', [adj('a1', -200), adj('a2', 50)]]]),
      }),
    );
    expect(rows[0]?.lines.map((l) => l.amount)).toEqual([800, 600]);
    expect(rows[0]?.total).toBe(800 + 600 - 200 + 50);
    expect(rows[1]?.total).toBe(0);
  });

  it('0 円を下回っても 0 円にそろえない', () => {
    const rows = assembleAllowances(
      base({
        lines: new Map([['u-taro', [line('t-dishes', 100, 1)]]]),
        adjustments: new Map([['u-taro', [adj('a1', -300)]]]),
      }),
    );
    expect(rows[0]?.total).toBe(-200);
  });

  it('単価 0 円の行は 0 円の行として出る', () => {
    const rows = assembleAllowances(base({ lines: new Map([['u-taro', [line('t-dishes', 0, 2)]]]) }));
    expect(rows[0]?.lines).toEqual([
      { choreTypeId: 't-dishes', choreName: '皿洗い', unitPrice: 0, count: 2, amount: 0 },
    ]);
    expect(rows[0]?.total).toBe(0);
  });

  it('許可した項目名だけを持つ（余分な項目・LINE の ID・管理者の情報が入らない）', () => {
    const rows = assembleAllowances(
      base({
        lines: new Map([['u-taro', [line('t-dishes', 100, 1)]]]),
        adjustments: new Map([
          [
            'u-taro',
            [{ ...adj('a1', 10), lineUserId: 'U_secret', role: 'admin' } as AllowanceAdjustmentLine],
          ],
        ]),
      }),
    );
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ['adjustments', 'childUserId', 'current', 'displayName', 'lines', 'month', 'total'].sort(),
    );
    expect(Object.keys(rows[0]?.lines[0] ?? {}).sort()).toEqual(
      ['amount', 'choreName', 'choreTypeId', 'count', 'unitPrice'].sort(),
    );
    expect(Object.keys(rows[0]?.adjustments[0] ?? {}).sort()).toEqual(
      ['adjustmentId', 'amount', 'reason'].sort(),
    );
    expect(JSON.stringify(rows)).not.toContain('U_secret');
  });

  it('子供がひとりもいなければ空の配列を返す', () => {
    expect(assembleAllowances(base({ currentChildren: [], departedChildren: [] }))).toEqual([]);
  });

  it('入力を書き換えず、同じ入力なら同じ結果になる', () => {
    const input = base({
      lines: new Map([['u-taro', [line('t-laundry', 150, 1), line('t-dishes', 100, 1)]]]),
    });
    const snapshot = JSON.stringify([...input.lines]);
    const first = assembleAllowances(input);
    const second = assembleAllowances(input);
    expect(second).toEqual(first);
    expect(JSON.stringify([...input.lines])).toBe(snapshot);
  });
});
