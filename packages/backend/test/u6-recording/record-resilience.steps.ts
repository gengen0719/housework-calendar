import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { handleRecord } from '../../src/handlers/line/recordHandler';
import type { LineEvent } from '../../src/handlers/line/types';
import {
  onDutyRecorded,
  resetDutyRecordedHooks,
  type DutyRecordedEvent,
} from '../../src/services/dutyRecordedHook';
import { setupWorld, stubLineFetch, type FetchCall } from '../u1-skeleton-family/helpers/world';
import { PEOPLE } from '../u2-invitation/helpers/seed';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  setUnitPrice,
  storedDuty,
  MONTH,
} from './helpers/seed';
import { FAKE_U6_DUTY_ID_A, FAKE_U6_DUTY_ID_B } from '../fixtures/fakeSecrets';
import { recordDoPostback } from './helpers/events';

const feature = await loadFeature('packages/backend/test/u6-recording/record-resilience.feature');

type World = ReturnType<typeof setupWorld>;
const asEvent = (e: unknown): LineEvent => e as LineEvent;

const TODAY = '2027-01-07';
const NOW = new Date('2027-01-07T07:42:00.000Z');
const RECORDED_AT = '2027-01-07T07:42:00.000Z';
const DUTY_ID = FAKE_U6_DUTY_ID_A;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let lineStub: { calls: FetchCall[]; replies: () => FetchCall[] };
  let logLines: string[];

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'line';
    lineStub = stubLineFetch();
    seedHouseholdWithPrices(world);
    resetDutyRecordedHooks();
    logLines = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logLines.push(String(line));
    });
  });
  AfterEachScenario(() => {
    resetDutyRecordedHooks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const seedDishes = (over: Partial<Parameters<typeof seedDuty>[1]> = {}): void => {
    seedDuty(world.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
      ...over,
    });
  };

  const press = async (version = 1): Promise<void> => {
    const event = asEvent(
      recordDoPostback(`do-${version}-${Date.now()}`, DUTY_ID, version, { lineUserId: 'U_taro' }),
    );
    await handleRecord(event, NOW);
  };

  const replyTexts = (): string => JSON.stringify(lineStub.replies().map((c) => c.body));
  const transactionCount = (): number => world.hooks.transactionSizes.length;
  const dishesRow = (): Record<string, unknown> | undefined =>
    storedDuty(world.calendar, TODAY, choreId('dishes'));

  Scenario(
    '(a) 取引の直前に管理者が担当の子供を変える（version が増える）',
    ({ Given, And, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）がある', () => {
        seedDishes();
      });
      And('取引の直前に、その担当が花子に変わる（version 2）', () => {
        world.hooks.beforeTransaction(1, () => {
          seedDuty(world.calendar, {
            dutyId: DUTY_ID,
            date: TODAY,
            choreTypeId: choreId('dishes'),
            childUserId: childId('hanako'),
            status: 'todo',
            version: 2,
          });
        });
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then(
        '記録されず、太郎の担当はなくなっているので出し直しの返事になり、皿洗いは太郎のものでなくなる',
        () => {
          // 読み直すと皿洗いは花子の担当。NOT_OWN_DUTY で記録されず、太郎の選べる担当は 0 件なので
          // 出し直しは「今日記録できる担当はありません」になる（BR7.5）
          expect(replyTexts()).not.toContain('記録しました');
          expect(replyTexts()).toContain('今日記録できる担当はありません');
          expect(dishesRow()?.childUserId).toBe(childId('hanako'));
          expect(dishesRow()?.status).toBe('todo');
          // 1 回目の書き込みが競合で断られ、読み直して reject で止まる
          expect(transactionCount()).toBe(1);
        },
      );
    },
  );

  Scenario("(a') 取引の直前に管理者が担当を「×」にする", ({ Given, And, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    And('取引の直前に、その担当が「×」にされる（version 2）', () => {
      world.hooks.beforeTransaction(1, () => {
        seedDuty(world.calendar, {
          dutyId: DUTY_ID,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          status: 'skipped',
          version: 2,
        });
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('記録されず出し直しの返事になり、担当は「×」のまま', () => {
      // 読み直すと「×」。DUTY_SKIPPED_BY_ADMIN で記録されず、太郎の選べる担当は 0 件なので出し直しの一覧だけ
      expect(replyTexts()).not.toContain('記録しました');
      expect(replyTexts()).toContain('今日記録できる担当はありません');
      expect(dishesRow()?.status).toBe('skipped');
    });
  });

  Scenario('(b) 取引の直前に月が確定する', ({ Given, And, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    And('取引の直前に、その月が確定する', () => {
      world.hooks.beforeTransaction(1, () => {
        seedMonthState(world.calendar, MONTH, true);
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('記録されず「この月は確定済みです」が返り、担当は「未」のまま', () => {
      expect(replyTexts()).toContain('この月は確定済みです');
      expect(dishesRow()?.status).toBe('todo');
    });
  });

  Scenario('(c) 取引の直前に種類の単価が変わる', ({ Given, And, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）があり、皿洗いの単価は 100 円', () => {
      seedDishes();
    });
    And('取引の直前に、皿洗いの単価が 120 円に変わる', () => {
      world.hooks.beforeTransaction(1, () => {
        setUnitPrice(world.choreTypes, choreId('dishes'), 120);
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('読み直して新しい単価 120 円で記録され、書き込みは 2 回になる', () => {
      const row = dishesRow();
      expect(row?.status).toBe('done');
      expect(row?.unitPrice).toBe(120);
      expect(transactionCount()).toBe(2);
    });
  });

  Scenario('(d) 同じ本人の 2 つの要求のうち片方だけが成功する', ({ Given, And, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    And('1 回目の取引の直前に、別の要求が先に同じ担当を記録する（version 2・太郎）', () => {
      world.hooks.beforeTransaction(1, () => {
        seedDoneDuty(world.calendar, {
          dutyId: DUTY_ID,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          version: 2,
          recordedAt: RECORDED_AT,
          recordedBy: childId('taro'),
          unitPrice: 100,
        });
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('読み直して二重押しとして成功の返事が返り、記録は 1 件のまま', () => {
      expect(replyTexts()).toContain('皿洗いを記録しました（16:42）');
      // 記録済みの担当のまま（version 2・done）。書き込みは 1 回目だけで、読み直しで alreadyRecorded
      const row = dishesRow();
      expect(row?.status).toBe('done');
      expect(row?.version).toBe(2);
      expect(transactionCount()).toBe(1);
    });
  });

  Scenario("(d') 取引の直前に管理者が先に「済にする」", ({ Given, And, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    And('取引の直前に、その担当がお母さんにより済にされる（version 2）', () => {
      world.hooks.beforeTransaction(1, () => {
        seedDoneDuty(world.calendar, {
          dutyId: DUTY_ID,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          version: 2,
          recordedAt: RECORDED_AT,
          recordedBy: PEOPLE.mother.userId,
          unitPrice: 100,
        });
        // 出し直しの選択肢が残るよう、別の「未」を 1 件置く
        seedDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_B,
          date: TODAY,
          choreTypeId: choreId('laundry'),
          childUserId: childId('taro'),
          status: 'todo',
        });
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('記録されず「この担当はすでに『済』になっています」が返る', () => {
      expect(replyTexts()).toContain('この担当はすでに『済』になっています');
    });
  });

  Scenario(
    '取引が 2 回続けて断られると INTERNAL（書き込みは 2 回で止まる）',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）があり、取引が 2 回続けて断られる', () => {
        seedDishes();
        world.hooks.failTransaction(1, 'ConditionalCheckFailed');
        world.hooks.failTransaction(2, 'TransactionConflict');
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then(
        '「うまく記録できませんでした。もう一度お試しください」が返り、書き込みは 2 回で止まる',
        () => {
          expect(replyTexts()).toContain('うまく記録できませんでした。もう一度お試しください');
          expect(transactionCount()).toBe(2);
          expect(dishesRow()?.status).toBe('todo');
        },
      );
    },
  );

  Scenario(
    '思いがけない Code（ThrottlingError）は読み直さずに投げ直す',
    ({ Given, When, Then }) => {
      let thrown: unknown;
      Given('太郎の今日の皿洗い（未・version 1）があり、取引が ThrottlingError で断られる', () => {
        seedDishes();
        world.hooks.failTransaction(1, 'ThrottlingError');
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        thrown = undefined;
        try {
          // handleRecord は書く前の例外（思いがけない Code）をそのまま投げ直す（(b)）
          await press(1);
        } catch (error) {
          thrown = error;
        }
      });
      Then('例外が投げ直され、書き込みは 1 回で止まる', () => {
        expect(thrown).toBeInstanceOf(Error);
        expect(transactionCount()).toBe(1);
        expect(dishesRow()?.status).toBe('todo');
      });
    },
  );

  Scenario('書けたあとに onDutyRecorded が 1 回だけ呼ばれる', ({ Given, When, Then }) => {
    const events: DutyRecordedEvent[] = [];
    Given('太郎の今日の皿洗い（未・version 1）があり、記録のフックが登録されている', () => {
      seedDishes();
      onDutyRecorded(async (e) => void events.push(e));
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('フックが担当の情報つきで 1 回だけ呼ばれ、記録は成功する', () => {
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        dutyId: DUTY_ID,
        date: TODAY,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
      });
      expect(dishesRow()?.status).toBe('done');
    });
  });

  Scenario('フックが投げても記録は成功のまま返る', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）があり、投げるフックが登録されている', () => {
      seedDishes();
      onDutyRecorded(async () => {
        throw new Error('取り下げに失敗');
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('記録は成功し、担当は status=done になる', () => {
      expect(replyTexts()).toContain('皿洗いを記録しました');
      expect(dishesRow()?.status).toBe('done');
      const failures = logLines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((l) => l.event === 'DUTY_RECORDED_HOOK_FAILED');
      expect(failures).toHaveLength(1);
    });
  });

  Scenario('二重押し（alreadyRecorded）ではフックを呼ばない', ({ Given, And, When, Then }) => {
    const events: DutyRecordedEvent[] = [];
    Given('太郎の今日の皿洗いが、太郎により済になっている', () => {
      seedDoneDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: TODAY,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        version: 2,
        recordedAt: RECORDED_AT,
        recordedBy: childId('taro'),
        unitPrice: 100,
      });
    });
    And('記録のフックが登録されている', () => {
      onDutyRecorded(async (e) => void events.push(e));
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('二重押しとして成功の返事が返り、フックは呼ばれない', () => {
      expect(replyTexts()).toContain('皿洗いを記録しました（16:42）');
      expect(events).toHaveLength(0);
      expect(transactionCount()).toBe(0);
    });
  });

  Scenario('フックが登録されていなければ何もしない', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）があり、フックは登録されていない', () => {
      seedDishes();
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('記録は成功し、警告のログは残らない', () => {
      expect(dishesRow()?.status).toBe('done');
      const failures = logLines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .filter((l) => l.event === 'DUTY_RECORDED_HOOK_FAILED');
      expect(failures).toHaveLength(0);
    });
  });
});
