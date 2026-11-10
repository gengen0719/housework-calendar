import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { onDutyReassigned, resetDutyReassignedHooks } from '../../src/services/dutyReassignedHook';
import { onDutyRecorded, resetDutyRecordedHooks } from '../../src/services/dutyRecordedHook';
import { acceptSwap, offerSwap } from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
  type Table,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_OTHER_FAMILY_ID,
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
} from '../fixtures/fakeSecrets';
import {
  calendarKey,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedOffer,
  storedDuty,
  storedOffer,
  swapSk,
  type OfferStatus,
} from './helpers/seed';
import { captureLogs, ctxOf, NOW, type SwapActor } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature('packages/backend/test/u8-swap/swap-accept.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const HANAKO_DUTY_ID = FAKE_U8_DUTY_ID_B;
const DATE = '2027-01-12';
const MONTH = '2027-01';
const BASE = '太郎の皿洗い（未・version 2）に太郎の open の申し出があり、花子の別の担当もある';

type Outcome = { ok: true } | { ok: false; reason: string };
const reasonOf = (result: Outcome): string => (result.ok ? 'OK' : result.reason);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let reasons: string[];
  let logs: ReturnType<typeof captureLogs>;
  let reassignedCalls: number;
  let recordedCalls: number;

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    reasons = [];
    logs = captureLogs();
    reassignedCalls = 0;
    recordedCalls = 0;
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    onDutyReassigned(async () => void (reassignedCalls += 1));
    onDutyRecorded(async () => void (recordedCalls += 1));
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const seedDishes = (over: { date?: string; version?: number } = {}): void =>
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: over.date ?? DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version: over.version ?? 2,
    });
  const seedOpenOffer = (over: { status?: OfferStatus; dutyVersion?: number } = {}): void =>
    seedOffer(calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: over.dutyVersion ?? 2,
      ...(over.status ? { status: over.status } : {}),
    });
  const seedBase = (): void => {
    seedDishes();
    seedMonthState(calendar, { month: MONTH, confirmed: false });
    seedOpenOffer();
    seedDuty(calendar, {
      dutyId: HANAKO_DUTY_ID,
      date: '2027-01-13',
      choreTypeId: choreId('laundry'),
      childUserId: childId('hanako'),
    });
  };
  const reset = (): void => {
    calendar.clear();
    seedBase();
  };
  const accept = async (actor: SwapActor, offerId = FAKE_U8_OFFER_ID_1) =>
    acceptSwap(ctxOf(actor), DUTY_ID, offerId, { now: NOW });
  const dishes = (): Record<string, unknown> | undefined =>
    storedDuty(calendar, DATE, choreId('dishes'));
  /** 担当（M# の項目）を日付に関係なく取り出す。 */
  const dutyNow = (): Record<string, unknown> | undefined =>
    [...calendar.values()].find((i) => i.dutyId === DUTY_ID && String(i.sk).startsWith('M#'));
  const nextTransaction = (): number => world.hooks.transactionSizes.length + 1;
  const seedJiroWon = (): void => {
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('jiro'),
      origin: 'swap',
      version: 3,
    });
    seedOffer(calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
      status: 'accepted',
      acceptedByUserId: childId('jiro'),
    });
  };

  Scenario(
    '別の子供が引き受けると、担当の子供と origin だけが変わり、申し出は accepted になる',
    ({ Given, When, Then, And }) => {
      let before: Record<string, unknown>;
      let hanakoBefore: Record<string, unknown> | undefined;
      let sizeBefore: number;
      Given(BASE, seedBase);
      When('花子が引き受ける', async () => {
        before = { ...dishes() };
        hanakoBefore = { ...storedDuty(calendar, '2027-01-13', choreId('laundry')) };
        sizeBefore = calendar.size;
        reasons.push(reasonOf(await accept('hanako')));
      });
      Then(
        '担当の子供は花子、origin は swap、version は 3 になり、状態・日付・種類は変わらない',
        () => {
          expect(reasons).toEqual(['OK']);
          expect(dishes()).toMatchObject({
            childUserId: childId('hanako'),
            origin: 'swap',
            version: 3,
            status: before.status,
            date: before.date,
            choreTypeId: before.choreTypeId,
            dutyId: DUTY_ID,
          });
        },
      );
      And('申し出は accepted で受け手と時刻が残り、花子の別の担当・ほかの項目は変わらない', () => {
        expect(storedOffer(calendar, DUTY_ID)).toMatchObject({
          status: 'accepted',
          acceptedByUserId: childId('hanako'),
          acceptedAt: NOW.toISOString(),
        });
        expect(storedDuty(calendar, '2027-01-13', choreId('laundry'))).toEqual(hanakoBefore);
        expect(calendar.size).toBe(sizeBefore);
      });
      And('担当を変える通知も記録の通知も呼ばれない', () => {
        expect(reassignedCalls).toBe(0);
        expect(recordedCalls).toBe(0);
      });
    },
  );

  Scenario('なくなった申し出を引き受けると OFFER_GONE になる', ({ Given, When, Then }) => {
    Given(BASE, seedBase);
    When(
      '申し出なし、ID 違い、withdrawn、cancelled、ほかの家族の担当のそれぞれを花子が引き受ける',
      async () => {
        calendar.delete(calendarKey(swapSk(DUTY_ID)));
        reasons.push(reasonOf(await accept('hanako')));
        reset();
        reasons.push(reasonOf(await accept('hanako', FAKE_U8_OFFER_ID_2)));
        for (const status of ['withdrawn', 'cancelled'] as const) {
          reset();
          seedOpenOffer({ status });
          reasons.push(reasonOf(await accept('hanako')));
        }
        reset();
        reasons.push(
          reasonOf(
            await acceptSwap(ctxOf('hanako', FAKE_OTHER_FAMILY_ID), DUTY_ID, FAKE_U8_OFFER_ID_1, {
              now: NOW,
            }),
          ),
        );
      },
    );
    Then('すべて OFFER_GONE で、担当は変わらない', () => {
      expect(reasons).toEqual(Array(5).fill('OFFER_GONE'));
      expect(dishes()).toMatchObject({ childUserId: childId('taro'), version: 2 });
    });
  });

  Scenario(
    '担当が変わった・済・日が過ぎた・月が確定した open の申し出も OFFER_GONE になる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '担当の version 違い、済、過ぎた日、確定済みの月のそれぞれを花子が引き受ける',
        async () => {
          reset();
          seedOpenOffer({ dutyVersion: 1 });
          reasons.push(reasonOf(await accept('hanako')));
          reset();
          seedDoneDuty(calendar, {
            dutyId: DUTY_ID,
            date: DATE,
            choreTypeId: choreId('dishes'),
            childUserId: childId('taro'),
            version: 2,
          });
          reasons.push(reasonOf(await accept('hanako')));
          reset();
          calendar.clear();
          seedDishes({ date: '2027-01-07' });
          seedMonthState(calendar, { month: MONTH, confirmed: false });
          seedOpenOffer();
          reasons.push(reasonOf(await accept('hanako')));
          reset();
          seedMonthState(calendar, { month: MONTH, confirmed: true });
          reasons.push(reasonOf(await accept('hanako')));
        },
      );
      Then('すべて OFFER_GONE で、担当の子供は太郎のままである', () => {
        expect(reasons).toEqual(Array(4).fill('OFFER_GONE'));
        expect(dutyNow()).toMatchObject({ childUserId: childId('taro') });
      });
    },
  );

  Scenario(
    '管理者と申し出た本人は CANNOT_ACCEPT_OWN_OFFER になる',
    ({ Given, When, And, Then }) => {
      Given(BASE, seedBase);
      When('管理者と太郎が引き受ける', async () => {
        reasons.push(reasonOf(await accept('mother')), reasonOf(await accept('taro')));
      });
      And('花子が引き受けたあとで、管理者と太郎がもう一度引き受ける', async () => {
        expect(reasonOf(await accept('hanako'))).toBe('OK');
        reasons.push(reasonOf(await accept('mother')), reasonOf(await accept('taro')));
      });
      Then('どれも CANNOT_ACCEPT_OWN_OFFER になる', () => {
        expect(reasons).toEqual(Array(4).fill('CANNOT_ACCEPT_OWN_OFFER'));
      });
    },
  );

  Scenario('引き受けられたあとに押すと OFFER_ALREADY_ACCEPTED になる', ({ Given, When, Then }) => {
    Given(BASE, seedBase);
    When('花子が引き受けたあとで、次郎と花子がもう一度引き受ける', async () => {
      expect(reasonOf(await accept('hanako'))).toBe('OK');
      reasons.push(reasonOf(await accept('jiro')), reasonOf(await accept('hanako')));
    });
    Then('どちらも OFFER_ALREADY_ACCEPTED で、担当は花子のままである', () => {
      expect(reasons).toEqual(['OFFER_ALREADY_ACCEPTED', 'OFFER_ALREADY_ACCEPTED']);
      expect(dishes()).toMatchObject({ childUserId: childId('hanako'), version: 3 });
    });
  });

  Scenario('同時に押した 2 人のうち先の 1 人だけが成立する', ({ Given, When, Then }) => {
    Given(BASE, seedBase);
    When('花子の書き込みの直前に次郎が先に引き受ける', async () => {
      world.hooks.beforeTransaction(nextTransaction(), seedJiroWon);
      reasons.push(reasonOf(await accept('hanako')));
    });
    Then('花子は OFFER_ALREADY_ACCEPTED で、担当は次郎になり、読み直しが 1 回記録される', () => {
      expect(reasons).toEqual(['OFFER_ALREADY_ACCEPTED']);
      expect(dishes()).toMatchObject({ childUserId: childId('jiro'), version: 3 });
      expect(logs.rows('SWAP_RETRY')).toHaveLength(1);
    });
  });

  Scenario(
    '書き込みの直前に取り下げられた・担当が変わった場合は OFFER_GONE になる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '書き込みの直前に取り下げられる、管理者が担当を次郎に変えるを別々に起こして花子が引き受ける',
        async () => {
          reset();
          world.hooks.beforeTransaction(nextTransaction(), () =>
            seedOpenOffer({ status: 'withdrawn' }),
          );
          reasons.push(reasonOf(await accept('hanako')));
          reset();
          world.hooks.beforeTransaction(nextTransaction(), () =>
            seedDuty(calendar, {
              dutyId: DUTY_ID,
              date: DATE,
              choreTypeId: choreId('dishes'),
              childUserId: childId('jiro'),
              origin: 'manual',
              version: 3,
            }),
          );
          reasons.push(reasonOf(await accept('hanako')));
        },
      );
      Then('どちらも OFFER_GONE になり、読み直しが記録される', () => {
        expect(reasons).toEqual(['OFFER_GONE', 'OFFER_GONE']);
        expect(logs.rows('SWAP_RETRY')).toHaveLength(2);
      });
    },
  );

  Scenario(
    '引き受けた担当をさらに申し出て別の子供が引き受けられ、古い申し出の ID は OFFER_GONE になる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When('花子が引き受け、花子が同じ担当を申し出て、次郎が引き受ける', async () => {
        reasons.push(reasonOf(await accept('hanako')));
        const again = await offerSwap(ctxOf('hanako'), DUTY_ID, { now: NOW });
        reasons.push(reasonOf(again));
        if (!again.ok) throw new Error(again.reason);
        reasons.push(reasonOf(await accept('jiro', again.offerId)));
        reasons.push(reasonOf(await accept('hanako')));
      });
      Then(
        '担当は次郎・origin は swap・version は 4 で、太郎の古い申し出の ID は OFFER_GONE になる',
        () => {
          expect(reasons).toEqual(['OK', 'OK', 'OK', 'OFFER_GONE']);
          expect(dishes()).toMatchObject({
            childUserId: childId('jiro'),
            origin: 'swap',
            version: 4,
          });
        },
      );
    },
  );

  Scenario('読み取りは上限の中で、LINE のプロフィール取得は呼ばれない', ({ Given, When, Then }) => {
    const fetchSpy = vi.fn();
    Given(BASE, seedBase);
    When('花子が引き受ける', async () => {
      vi.stubGlobal('fetch', fetchSpy);
      world.hooks.readLog.length = 0;
      reasons.push(reasonOf(await accept('hanako')));
    });
    Then('読み取りは Get 4 回と Query 1 回までで、取引は 1 回、外部への通信は 0 回である', () => {
      const count = (op: string): number =>
        world.hooks.readLog.filter((entry) => entry.operation === op).length;
      expect(reasons).toEqual(['OK']);
      expect(count('Get')).toBeLessThanOrEqual(4);
      expect(count('Query')).toBeLessThanOrEqual(1);
      expect(count('Scan')).toBe(0);
      expect(world.hooks.transactionSizes).toEqual([3]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  Scenario('2 回続けて断られると INTERNAL になり、何も書かれない', ({ Given, When, Then }) => {
    Given(BASE, seedBase);
    When('取引を 2 回続けて競合で断らせて花子が引き受ける', async () => {
      world.hooks.failTransaction(1, 'ConditionalCheckFailed');
      world.hooks.failTransaction(2, 'ConditionalCheckFailed');
      reasons.push(reasonOf(await accept('hanako')));
    });
    Then('INTERNAL で、担当は太郎のまま、申し出は open のままである', () => {
      expect(reasons).toEqual(['INTERNAL']);
      expect(dishes()).toMatchObject({ childUserId: childId('taro'), version: 2 });
      expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ status: 'open' });
      expect(world.hooks.transactionSizes).toEqual([3, 3]);
    });
  });
});
