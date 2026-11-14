import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Allowance, AllowanceAdjustmentLine } from '@housework/shared';
import { expect, vi, type MockInstance } from 'vitest';
import { takeRequestMetrics } from '../../src/lib/logger';
import { getAllowances, type AdjustmentSource } from '../../src/services/allowanceService';
import * as familyMemberService from '../../src/services/familyMemberService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  FAMILIES_TABLE,
  USERS_TABLE,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_U9_DEPARTED_USER_ID,
  FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
  FAKE_U9_MARKER_ADJUSTMENT_REASON,
  FAKE_U9_MARKER_CHORE_NAME,
  FAKE_U9_MARKER_DISPLAY_NAME,
  FAKE_U9_MARKER_UNIT_PRICE,
  fakeU9ChildId,
  fakeU9ChoreTypeId,
} from '../fixtures/fakeSecrets';
import {
  asRead,
  CHILDREN,
  CHORES,
  ctxAdmin,
  dateOf,
  FAMILY_ID,
  MONTH,
  readCount,
  rowOf,
  setupAllowanceWorld,
  type AllowanceWorld,
} from './helpers/allowanceWorld';
import { totalWrites } from './helpers/writeGuard';

const feature = await loadFeature('packages/backend/test/u9-allowance/allowance-reads.feature');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let result: Allowance[] | undefined;
  let failure: unknown;
  let elapsedMs: number;

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    result = undefined;
    failure = undefined;
    elapsedMs = 0;
    takeRequestMetrics();
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
    vi.restoreAllMocks();
  });

  const read = async (adjustments?: AdjustmentSource): Promise<void> => {
    const started = Date.now();
    try {
      result = await getAllowances(asRead(ctxAdmin()), MONTH, adjustments ? { adjustments } : {});
    } catch (error) {
      failure = error;
    }
    elapsedMs = Date.now() - started;
  };
  const readPlain = (): Promise<void> => read();
  const expectFailure = (): void => {
    expect(failure).toBeInstanceOf(Error);
    expect(result).toBeUndefined();
  };
  const addDepartedChildren = (count: number, offset = 0): string[] => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = fakeU9ChildId(offset + i + 1);
      w.departed(id, `ぬけた${offset + i + 1}`);
      w.done({ date: dateOf(10 + i), childUserId: id });
      ids.push(id);
    }
    return ids;
  };
  /** findFamilyChild を、時間のかかる・数えられるものに差し替える（元の動きは呼び出す）。 */
  const watchChildCheck = (
    options: { delayMs?: number; failFirst?: boolean } = {},
  ): { spy: MockInstance; stats: { calls: number; peak: number; snapshot: string[] } } => {
    const original = familyMemberService.findFamilyChild;
    const stats = { calls: 0, peak: 0, snapshot: [] as string[] };
    let inFlight = 0;
    const spy = vi
      .spyOn(familyMemberService, 'findFamilyChild')
      .mockImplementation(async (...args) => {
        stats.calls += 1;
        const nth = stats.calls;
        if (nth === 1) {
          stats.snapshot = w.world.hooks.readLog.map((e) => `${e.operation} ${e.table}`);
        }
        inFlight += 1;
        stats.peak = Math.max(stats.peak, inFlight);
        try {
          await sleep(options.delayMs ?? 0);
          if (options.failFirst && nth === 1) {
            throw new Error('確かめの失敗');
          }
          return await original(...args);
        } finally {
          inFlight -= 1;
        }
      });
    return { spy, stats };
  };

  Scenario('最初の段で月の担当・家族とメンバー・種類を同時に読み始める', ({ Given, When, Then }) => {
    Given('月の担当と種類の読み取りがそれぞれ 100 ミリ秒かかる', () => {
      w.world.hooks.readDelayMs = 100;
      w.done({ date: dateOf(0) });
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('全体の時間は 2 回分の待ち時間より短い（足し算になっていない）', () => {
      expect(result).toBeDefined();
      expect(elapsedMs).toBeGreaterThanOrEqual(90);
      expect(elapsedMs).toBeLessThan(190);
    });
  });

  Scenario('抜けた子供がいなければ読み取りは 4 回、書き込みは 0 回である', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回ある', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then(
      '月の Query 1 回、Families の Get 1 回、Users の Query 1 回、種類の Query 1 回の計 4 回で、書き込みは 0 回である',
      () => {
        expect(readCount(w.world, CALENDAR_TABLE, 'Query')).toBe(1);
        expect(readCount(w.world, FAMILIES_TABLE, 'Get')).toBe(1);
        expect(readCount(w.world, USERS_TABLE, 'Query')).toBe(1);
        expect(readCount(w.world, CHORE_TYPES_TABLE, 'Query')).toBe(1);
        expect(readCount(w.world)).toBe(4);
        expect(totalWrites(w.world)).toBe(0);
      },
    );
  });

  Scenario('抜けた子供が 3 人いれば読み取りは 4 回に 6 回が足される', ({ Given, When, Then }) => {
    Given('家族を抜けた子供 3 人の「済」がそれぞれ 1 回ある', () => {
      addDepartedChildren(3);
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは計 10 回で、Users の Get は 6 回である', () => {
      expect(readCount(w.world)).toBe(10);
      expect(readCount(w.world, USERS_TABLE, 'Get')).toBe(6);
      expect(totalWrites(w.world)).toBe(0);
    });
  });

  Scenario('抜けた子供の確かめは月と家族と種類がそろったあとに始まる', ({ Given, When, Then }) => {
    let stats: ReturnType<typeof watchChildCheck>['stats'];
    Given('家族を抜けた子供 1 人の「済」が 1 回ある', () => {
      addDepartedChildren(1);
    });
    When('子供の確かめを見張りながら管理者が 1 月のお小遣いを読む', async () => {
      stats = watchChildCheck().stats;
      await read();
    });
    Then('最初の確かめが始まった時点で、月の Query と Families の Get と種類の Query は終わっている', () => {
      expect(stats.calls).toBe(1);
      expect(stats.snapshot).toEqual(
        expect.arrayContaining([
          `Query ${CALENDAR_TABLE}`,
          `Get ${FAMILIES_TABLE}`,
          `Query ${CHORE_TYPES_TABLE}`,
          `Query ${USERS_TABLE}`,
        ]),
      );
    });
  });

  Scenario('抜けた子供の確かめは 10 並行までで、全員分が確かめられる', ({ Given, When, Then }) => {
    let stats: ReturnType<typeof watchChildCheck>['stats'];
    Given('家族を抜けた子供 25 人の「済」がそれぞれ 1 回ある', () => {
      addDepartedChildren(25);
    });
    When('時間のかかる確かめを見張りながら管理者が 1 月のお小遣いを読む', async () => {
      stats = watchChildCheck({ delayMs: 15 }).stats;
      await read();
    });
    Then('同時に動く確かめは最大 10 で、25 人すべてが確かめられ、行が 28 行返る', () => {
      expect(stats.peak).toBe(10);
      expect(stats.calls).toBe(25);
      expect(result).toHaveLength(28);
    });
  });

  Scenario(
    '抜けた子供の確かめが 1 人でも投げたら新しい確かめを始めずに全体が失敗する',
    ({ Given, When, Then }) => {
      let stats: ReturnType<typeof watchChildCheck>['stats'];
      Given('家族を抜けた子供 25 人の「済」がそれぞれ 1 回ある', () => {
        addDepartedChildren(25);
      });
      When('最初の確かめが投げるようにして管理者が 1 月のお小遣いを読む', async () => {
        stats = watchChildCheck({ delayMs: 15, failFirst: true }).stats;
        await read();
      });
      Then('読み取りは失敗し、始まった確かめは 10 件までで、答えもログも出ない', () => {
        expectFailure();
        expect(stats.calls).toBeLessThanOrEqual(10);
        expect(w.logs.lines.filter((l) => String(l.event).startsWith('ALLOWANCE_'))).toHaveLength(0);
      });
    },
  );

  Scenario('月の担当の Query が失敗したら全体が失敗する', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回あり、月の担当の Query が失敗する', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      w.world.hooks.failRead(CALENDAR_TABLE, 'Query');
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは失敗して答えは返らない', expectFailure);
  });

  Scenario('Families の読み取りが失敗したら全体が失敗する', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回あり、Families の Get が失敗する', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      w.world.hooks.failRead(FAMILIES_TABLE, 'Get');
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは失敗して答えは返らない', expectFailure);
  });

  Scenario('Users の Query が失敗したら全体が失敗する', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回あり、Users の Query が失敗する', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      w.world.hooks.failRead(USERS_TABLE, 'Query');
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは失敗して答えは返らない', expectFailure);
  });

  Scenario('種類の Query が失敗したら全体が失敗する', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回あり、種類の Query が失敗する', () => {
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i) });
      w.world.hooks.failRead(CHORE_TYPES_TABLE, 'Query');
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは失敗して答えは返らない', expectFailure);
  });

  Scenario(
    '抜けた子供の読み取りが失敗したら全体が失敗し、NOT_FOUND だけは結果として扱う',
    ({ Given, When, Then }) => {
      Given('家族を抜けた子供の「済」があり、Users の Get が失敗する', () => {
        addDepartedChildren(1);
        w.world.hooks.failRead(USERS_TABLE, 'Get');
      });
      When('管理者が 1 月のお小遣いを読む', readPlain);
      Then('読み取りは失敗して答えは返らない', expectFailure);
    },
  );

  Scenario('途中で失敗した要求では異常のログも計算のログも出ない', ({ Given, When, Then }) => {
    Given('単価なしの「済」があり、そのあとの段で抜けた子供の読み取りが失敗する', () => {
      w.done({ date: dateOf(0), price: null });
      w.departed(FAKE_U9_DEPARTED_USER_ID, 'ゆうき');
      w.done({ date: dateOf(1), childUserId: FAKE_U9_DEPARTED_USER_ID });
      w.world.hooks.failRead(USERS_TABLE, 'Get');
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('読み取りは失敗し、ALLOWANCE_ で始まるログは 1 行もない', () => {
      expectFailure();
      expect(w.logs.lines.filter((l) => String(l.event).startsWith('ALLOWANCE_'))).toHaveLength(0);
    });
  });

  Scenario(
    '担当が 300 件、子供 10 人、種類 10 個でも読み取りの回数は 4 回のままである',
    ({ Given, When, Then }) => {
      Given('子供 10 人と種類 10 個に 300 件の「済」の担当がある', () => {
        const childIds = [
          CHILDREN.taro.userId,
          CHILDREN.hanako.userId,
          CHILDREN.jiro.userId,
          ...Array.from({ length: 7 }, (_, i) => fakeU9ChildId(100 + i)),
        ];
        childIds.slice(3).forEach((id, i) => {
          w.addChild(id, `ついか${i}`, `2026-11-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`);
        });
        const typeIds = [
          CHORES.dishes.choreTypeId,
          CHORES.laundry.choreTypeId,
          CHORES.garbage.choreTypeId,
          CHORES.bath.choreTypeId,
          ...Array.from({ length: 6 }, (_, i) => fakeU9ChoreTypeId(i)),
        ];
        typeIds.slice(4).forEach((id, i) => w.addChore(id, `ついかの種類${i}`, 40 + i));
        for (let i = 0; i < 300; i++) {
          const day = (i % 30) + 1;
          w.done({
            date: `${MONTH}-${String(day).padStart(2, '0')}`,
            choreTypeId: typeIds[Math.floor(i / 30)],
            childUserId: childIds[i % 10],
            price: 10,
          });
        }
      });
      When('管理者が 1 月のお小遣いを読む', readPlain);
      Then('読み取りは計 4 回で、10 人分の行と 300 回分の合計が返る', () => {
        expect(readCount(w.world)).toBe(4);
        expect(result).toHaveLength(10);
        expect(result?.reduce((sum, a) => sum + a.total, 0)).toBe(3000);
      });
    },
  );

  Scenario(
    'ALLOWANCE_COMPUTED は 1 要求 1 件で 10 項目の件数と時間だけを持つ',
    ({ Given, When, Then }) => {
      Given(
        '太郎の「済」が 3 件（皿洗い 2、洗濯物たたみ 1）、「未」が 1 件、単価なしが 1 件、抜けた子供の「済」が 1 件ある',
        () => {
          w.done({ date: dateOf(0), chore: 'dishes' });
          w.done({ date: dateOf(1), chore: 'dishes' });
          w.done({ date: dateOf(2), chore: 'laundry' });
          w.other('todo', { date: dateOf(3), chore: 'garbage' });
          w.done({ date: dateOf(4), chore: 'garbage', price: null });
          addDepartedChildren(1);
        },
      );
      When('管理者が 1 月のお小遣いを読む', readPlain);
      Then('計算のログは 1 件で、項目名が許可した 10 項目と完全に一致し、件数と時間が期待どおりである', () => {
        const rows = w.logs.rows('ALLOWANCE_COMPUTED');
        expect(rows).toHaveLength(1);
        const row = rows[0] ?? {};
        const keys = Object.keys(row).filter(
          (k) => !['level', 'timestamp', 'env', 'entry', 'requestId'].includes(k),
        );
        expect(keys.sort()).toEqual(
          [
            'anomalyCount',
            'childCount',
            'departedChildCount',
            'doneCount',
            'durationMs',
            'dutyCount',
            'event',
            'familyId',
            'lineCount',
            'month',
          ].sort(),
        );
        expect(row.familyId).toBe(FAMILY_ID);
        expect(row.month).toBe(MONTH);
        expect(row.childCount).toBe(4);
        expect(row.lineCount).toBe(3);
        expect(row.dutyCount).toBe(6);
        expect(row.doneCount).toBe(4);
        expect(row.departedChildCount).toBe(1);
        expect(row.anomalyCount).toBe(1);
        expect(typeof row.durationMs).toBe('number');
        expect(row.durationMs as number).toBeGreaterThanOrEqual(0);
      });
    },
  );

  Scenario('担当も子供もない月でも ALLOWANCE_COMPUTED は 1 件出て件数は 0 である', ({ Given, When, Then }) => {
    Given('担当が 1 件もない山田家がある', () => undefined);
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('計算のログは 1 件で、行の数は 3、内訳と担当と「済」の数は 0 である', () => {
      const rows = w.logs.rows('ALLOWANCE_COMPUTED');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        childCount: 3,
        lineCount: 0,
        dutyCount: 0,
        doneCount: 0,
        departedChildCount: 0,
        anomalyCount: 0,
      });
    });
  });

  Scenario('要求の測定値に担当の数が入る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 2 回と「未」が 1 回ある', () => {
      w.done({ date: dateOf(0) });
      w.done({ date: dateOf(1) });
      w.other('todo', { date: dateOf(2) });
    });
    When('管理者が 1 月のお小遣いを読む', readPlain);
    Then('要求の測定値の dutyCount は 3 になる', () => {
      expect(takeRequestMetrics().dutyCount).toBe(3);
    });
  });

  Scenario(
    '表示名・種類の名前・LINE の ID・単価・小計・合計・加算・減額の値がどの行にも含まれない',
    ({ Given, When, Then }) => {
      let slot: AdjustmentSource;
      Given('目印の名前・種類・単価・加算・減額・LINE の ID を入れた「済」と抜けた子供がある', () => {
        const item = w.world.users.get(CHILDREN.taro.userId);
        if (item) {
          w.world.users.set(CHILDREN.taro.userId, {
            ...item,
            displayName: FAKE_U9_MARKER_DISPLAY_NAME,
          });
        }
        const key = `${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`;
        const type = w.world.choreTypes.get(key);
        if (type) w.world.choreTypes.set(key, { ...type, name: FAKE_U9_MARKER_CHORE_NAME });
        w.done({ date: dateOf(0), price: FAKE_U9_MARKER_UNIT_PRICE });
        w.done({ date: dateOf(1), price: FAKE_U9_MARKER_UNIT_PRICE });
        w.done({ date: dateOf(2), price: null });
        w.departed(FAKE_U9_DEPARTED_USER_ID, `${FAKE_U9_MARKER_DISPLAY_NAME}の二人目`);
        w.done({ date: dateOf(3), childUserId: FAKE_U9_DEPARTED_USER_ID });
        const adjustment: AllowanceAdjustmentLine = {
          adjustmentId: 'adj-marker',
          amount: FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
          reason: FAKE_U9_MARKER_ADJUSTMENT_REASON,
        };
        slot = async () => new Map([[CHILDREN.taro.userId, [adjustment]]]);
      });
      When('管理者が差し込み口つきで 1 月のお小遣いを読む', () => read(slot));
      Then('集めたすべてのログの行に目印の文字も数字も含まれない', () => {
        expect(result).toBeDefined();
        expect(w.logs.lines.length).toBeGreaterThan(0);
        expect(rowOf(result ?? [], FAKE_U9_MARKER_DISPLAY_NAME).total).toBe(
          2 * FAKE_U9_MARKER_UNIT_PRICE + FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
        );
        expect(
          w.logs.findLeak([
            FAKE_U9_MARKER_DISPLAY_NAME,
            FAKE_U9_MARKER_CHORE_NAME,
            FAKE_U9_MARKER_ADJUSTMENT_REASON,
            FAKE_U9_MARKER_UNIT_PRICE,
            4321,
            15554,
            11233,
            'U_taro',
            'U_mother',
            'U_departed_',
            CHILDREN.taro.userId,
          ]),
        ).toBeUndefined();
      });
    },
  );
});
