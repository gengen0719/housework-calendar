import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Allowance, AllowanceAdjustmentLine } from '@housework/shared';
import { expect } from 'vitest';
import type { FamilyScope } from '../../src/middleware/requireMembership';
import { getAllowances, type AdjustmentSource } from '../../src/services/allowanceService';
import {
  asRead,
  CHILDREN,
  ctxAdmin,
  dateOf,
  FAMILY_ID,
  MONTH,
  rowOf,
  setupAllowanceWorld,
  type AllowanceWorld,
} from './helpers/allowanceWorld';

const feature = await loadFeature(
  'packages/backend/test/u9-allowance/allowance-adjust-slot.feature',
);

const line = (id: string, amount: number, reason: string): AllowanceAdjustmentLine => ({
  adjustmentId: id,
  amount,
  reason,
});

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let result: Allowance[] | undefined;
  let failure: unknown;
  let slot: AdjustmentSource | undefined;
  // vitest-cucumber は手順ごとに別のテストとして動かすので、vi.fn の呼び出しの記録は手順をまたいで残らない。自前で残す。
  let slotCalls: [FamilyScope, string, readonly string[]][];

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    result = undefined;
    failure = undefined;
    slot = undefined;
    slotCalls = [];
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
  });

  const rows = (): Allowance[] => {
    if (!result) throw new Error('答えがありません');
    return result;
  };
  const withSlot = async (): Promise<void> => {
    try {
      result = await getAllowances(asRead(ctxAdmin()), MONTH, {
        ...(slot ? { adjustments: slot } : {}),
      });
    } catch (error) {
      failure = error;
    }
  };
  const install = (map: Map<string, AllowanceAdjustmentLine[]>): void => {
    slot = async (scope, month, ids) => {
      slotCalls.push([scope, month, [...ids]]);
      return map;
    };
  };

  Scenario(
    '太郎へ -200 円を返す取り付けで加算・減額の行が 1 行つき合計が 1200 円になる',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い 8 回と洗濯物たたみ 4 回があり、差し込み口が太郎へ -200 円を返す', () => {
        for (let i = 0; i < 8; i++) w.done({ date: dateOf(i), chore: 'dishes' });
        for (let i = 0; i < 4; i++) w.done({ date: dateOf(i), chore: 'laundry' });
        install(new Map([[CHILDREN.taro.userId, [line('adj-1', -200, 'テストの理由')]]]));
      });
      When('管理者が差し込み口つきで 1 月のお小遣いを読む', withSlot);
      Then('太郎の加算・減額は 1 行で、合計は 1200（800 + 600 - 200）である', () => {
        const taro = rowOf(rows(), '太郎');
        expect(taro.adjustments).toEqual([line('adj-1', -200, 'テストの理由')]);
        expect(taro.total).toBe(1200);
      });
    },
  );

  Scenario('内訳の和より減額が大きければ合計はマイナスのまま出る', ({ Given, When, Then }) => {
    Given('次郎の皿洗い 1 回があり、差し込み口が次郎へ -300 円を返す', () => {
      w.done({ date: dateOf(0), child: 'jiro' });
      install(new Map([[CHILDREN.jiro.userId, [line('adj-2', -300, 'テストの理由')]]]));
    });
    When('管理者が差し込み口つきで 1 月のお小遣いを読む', withSlot);
    Then('次郎の合計は -200 で、0 円にそろえない', () => {
      expect(rowOf(rows(), '次郎').total).toBe(-200);
    });
  });

  Scenario('差し込み口が空なら加算・減額は空で合計は内訳の和である', ({ Given, When, Then }) => {
    Given('太郎の皿洗い 3 回があり、差し込み口は取り付けていない', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
    });
    When('管理者が差し込み口なしで 1 月のお小遣いを読む', withSlot);
    Then('太郎の加算・減額は空で、合計は 300 である', () => {
      expect(rowOf(rows(), '太郎').adjustments).toEqual([]);
      expect(rowOf(rows(), '太郎').total).toBe(300);
    });
  });

  Scenario('差し込み口が空の Map を返しても同じである', ({ Given, When, Then }) => {
    Given('太郎の皿洗い 3 回があり、差し込み口が何も返さない', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      install(new Map());
    });
    When('管理者が差し込み口つきで 1 月のお小遣いを読む', withSlot);
    Then('全員の加算・減額は空で、太郎の合計は 300 である', () => {
      expect(rows().every((a) => a.adjustments.length === 0)).toBe(true);
      expect(rowOf(rows(), '太郎').total).toBe(300);
    });
  });

  Scenario('差し込み口が投げたら一部だけを返さず全体が失敗する', ({ Given, When, Then }) => {
    Given('太郎の皿洗い 3 回があり、差し込み口が投げる', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      slot = async () => {
        throw new Error('差し込み口の失敗');
      };
    });
    When('管理者が差し込み口つきで 1 月のお小遣いを読む', withSlot);
    Then('読み取りは失敗し、答えは返らず、計算のログも出ない', () => {
      expect(failure).toBeInstanceOf(Error);
      expect(result).toBeUndefined();
      expect(w.logs.rows('ALLOWANCE_COMPUTED')).toHaveLength(0);
    });
  });

  Scenario(
    '差し込み口は 1 回の読み取りで 1 回だけ、家族と月と子供の ID の一覧を受け取る',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い 3 回があり、差し込み口が何も返さない', () => {
        for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
        install(new Map());
      });
      When('管理者が差し込み口つきで 1 月のお小遣いを読む', withSlot);
      Then('差し込み口は 1 回だけ呼ばれ、山田家の 1 月と、太郎・花子・次郎の ID を受け取る', () => {
        expect(slotCalls).toHaveLength(1);
        const [scope, month, ids] = slotCalls[0] ?? [];
        expect(scope).toEqual({ familyId: FAMILY_ID });
        expect(month).toBe(MONTH);
        expect(ids).toEqual([CHILDREN.taro.userId, CHILDREN.hanako.userId, CHILDREN.jiro.userId]);
      });
    },
  );
});
