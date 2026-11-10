import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { acceptSwap, closeOffer, offerSwap, withdrawSwap } from '../../src/services/swapService';
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
  FAKE_U8_NONEXISTENT_DUTY_ID,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';
import {
  FAMILY_ID,
  childId,
  choreId,
  offerCount,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedOffer,
  seedSkippedDuty,
  storedDuty,
  storedOffer,
  type OfferStatus,
} from './helpers/seed';
import { captureLogs, ctxOf, NOW, type SwapActor } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature('packages/backend/test/u8-swap/swap-offer-withdraw.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const DATE = '2027-01-12';
const MONTH = '2027-01';
const BASE = '太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある';
const OPEN_OFFER = '担当の version 2 に出された太郎の open の申し出が残っている';

type Outcome = { ok: true } | { ok: false; reason: string };
const reasonOf = (result: Outcome): string => (result.ok ? 'OK' : result.reason);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let reasons: string[];
  let logs: ReturnType<typeof captureLogs>;

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    reasons = [];
    logs = captureLogs();
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
    vi.restoreAllMocks();
  });

  const seedBase = (): void => {
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version: 2,
    });
    seedMonthState(calendar, { month: MONTH, confirmed: false });
  };
  const seedOpenOffer = (over: { status?: OfferStatus; dutyVersion?: number } = {}): void =>
    seedOffer(calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: over.dutyVersion ?? 2,
      ...(over.status ? { status: over.status } : {}),
    });
  /** 花子が引き受けたあとの状態（担当は花子・swap・version 3、申し出は accepted）。 */
  const seedAcceptedByHanako = (): void => {
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('hanako'),
      origin: 'swap',
      version: 3,
    });
    seedMonthState(calendar, { month: MONTH, confirmed: false });
    seedOffer(calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
      status: 'accepted',
      acceptedByUserId: childId('hanako'),
    });
  };
  const offer = async (actor: SwapActor, dutyId = DUTY_ID) =>
    offerSwap(ctxOf(actor), dutyId, { now: NOW });
  const withdraw = async (actor: SwapActor, offerId = FAKE_U8_OFFER_ID_1) =>
    withdrawSwap(ctxOf(actor), DUTY_ID, offerId, { now: NOW });
  const dishes = (): Record<string, unknown> | undefined =>
    storedDuty(calendar, DATE, choreId('dishes'));
  const nextTransaction = (): number => world.hooks.transactionSizes.length + 1;
  const reset = (): void => {
    calendar.clear();
    seedBase();
  };

  Scenario('子供が自分の「未」の担当を選ぶと、open の申し出が書かれる', ({ Given, When, Then }) => {
    let before: Record<string, unknown> | undefined;
    let offerId = '';
    Given(BASE, seedBase);
    When('太郎がその担当を選んで申し出る', async () => {
      before = { ...dishes() };
      const result = await offer('taro');
      if (!result.ok) throw new Error(result.reason);
      offerId = result.offerId;
    });
    Then('申し出の ID が返り、申し出は open で太郎・version 2 を持ち、担当は書き換わらない', () => {
      expect(offerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(storedOffer(calendar, DUTY_ID)).toMatchObject({
        offerId,
        status: 'open',
        offererUserId: childId('taro'),
        dutyVersion: 2,
      });
      expect(dishes()).toEqual(before);
    });
  });

  Scenario(
    '存在しない担当・ほかの家族の担当を選ぶと NOT_FOUND になる',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('ほかの家族の担当がある', () => {
        seedDuty(calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          date: DATE,
          choreTypeId: choreId('laundry'),
          childUserId: childId('taro'),
          familyId: FAKE_OTHER_FAMILY_ID,
        });
      });
      When('太郎が存在しない担当とほかの家族の担当をそれぞれ選ぶ', async () => {
        reasons.push(reasonOf(await offer('taro', FAKE_U8_NONEXISTENT_DUTY_ID)));
        reasons.push(reasonOf(await offer('taro', FAKE_U8_DUTY_ID_B)));
      });
      Then('どちらも NOT_FOUND で、申し出は作られない', () => {
        expect(reasons).toEqual(['NOT_FOUND', 'NOT_FOUND']);
        expect(offerCount(calendar)).toBe(0);
      });
    },
  );

  Scenario(
    'ほかの子供・管理者が選ぶと OFFER_OWNER_ONLY になり、何も変わらない',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When('花子と管理者が太郎の担当を選ぶ', async () => {
        reasons.push(reasonOf(await offer('hanako')));
        reasons.push(reasonOf(await offer('mother')));
      });
      Then('どちらも OFFER_OWNER_ONLY で、申し出は作られない', () => {
        expect(reasons).toEqual(['OFFER_OWNER_ONLY', 'OFFER_OWNER_ONLY']);
        expect(offerCount(calendar)).toBe(0);
      });
    },
  );

  Scenario('確定している月の担当は MONTH_CONFIRMED になる', ({ Given, And, When, Then }) => {
    Given(BASE, seedBase);
    And('2027-01 が確定している', () =>
      seedMonthState(calendar, { month: MONTH, confirmed: true }),
    );
    When('太郎がその担当を選んで申し出る', async () => {
      reasons.push(reasonOf(await offer('taro')));
    });
    Then('理由の印 MONTH_CONFIRMED が返り、申し出は作られない', () => {
      expect(reasons).toEqual(['MONTH_CONFIRMED']);
      expect(offerCount(calendar)).toBe(0);
    });
  });

  Scenario('済・×・過ぎた日の担当は DUTY_NOT_TODO になる', ({ Given, When, Then }) => {
    Given('太郎の済の担当、×の担当、過ぎた日の「未」の担当がある', () => {
      seedMonthState(calendar, { month: MONTH, confirmed: false });
      seedDoneDuty(calendar, {
        dutyId: FAKE_U8_DUTY_ID_A,
        date: DATE,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
      });
      seedSkippedDuty(calendar, {
        dutyId: FAKE_U8_DUTY_ID_B,
        date: DATE,
        choreTypeId: choreId('laundry'),
        childUserId: childId('taro'),
      });
      seedDuty(calendar, {
        dutyId: fakeU8DutyId(9),
        date: '2027-01-07',
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
      });
    });
    When('太郎がそれぞれを選んで申し出る', async () => {
      for (const id of [FAKE_U8_DUTY_ID_A, FAKE_U8_DUTY_ID_B, fakeU8DutyId(9)]) {
        reasons.push(reasonOf(await offer('taro', id)));
      }
    });
    Then('どれも DUTY_NOT_TODO で、申し出は作られない', () => {
      expect(reasons).toEqual(['DUTY_NOT_TODO', 'DUTY_NOT_TODO', 'DUTY_NOT_TODO']);
      expect(offerCount(calendar)).toBe(0);
    });
  });

  Scenario(
    'すでに有効な申し出がある担当は ALREADY_OFFERED になり、二度押しでも申し出は 1 つのまま',
    ({ Given, When, Then }) => {
      let firstOfferId = '';
      Given(BASE, seedBase);
      When('太郎がその担当を 2 回選んで申し出る', async () => {
        const first = await offer('taro');
        if (first.ok) firstOfferId = first.offerId;
        reasons.push(reasonOf(first), reasonOf(await offer('taro')));
      });
      Then('1 回目は成功し、2 回目は ALREADY_OFFERED で、申し出は 1 つのまま変わらない', () => {
        expect(reasons).toEqual(['OK', 'ALREADY_OFFERED']);
        expect(offerCount(calendar)).toBe(1);
        expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ offerId: firstOfferId });
      });
    },
  );

  Scenario(
    '担当が引き受けなどで変わったあとの古い選択ボタンは、元の持ち主だけ DUTY_CHANGED になる',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗いを花子が引き受けたあとの状態がある', seedAcceptedByHanako);
      When('太郎・管理者・次郎が古い選択ボタンで同じ担当を選ぶ', async () => {
        for (const actor of ['taro', 'mother', 'jiro'] as const) {
          reasons.push(reasonOf(await offer(actor)));
        }
      });
      Then('太郎は DUTY_CHANGED、管理者と次郎は OFFER_OWNER_ONLY になる', () => {
        expect(reasons).toEqual(['DUTY_CHANGED', 'OFFER_OWNER_ONLY', 'OFFER_OWNER_ONLY']);
        expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ status: 'accepted' });
      });
    },
  );

  Scenario(
    '取り下げ・自動でなくなった申し出の担当は、新しい申し出の ID で申し出し直せる',
    ({ Given, When, Then }) => {
      const ids: string[] = [];
      Given(BASE, seedBase);
      When(
        '太郎が申し出て取り下げ、もう一度申し出て、その申し出が掃除で cancelled になり、もう一度申し出る',
        async () => {
          const first = await offer('taro');
          if (!first.ok) throw new Error(first.reason);
          ids.push(first.offerId);
          reasons.push(reasonOf(await withdraw('taro', first.offerId)));
          const second = await offer('taro');
          if (!second.ok) throw new Error(second.reason);
          ids.push(second.offerId);
          await closeOffer(FAMILY_ID, DUTY_ID, 'child-changed', NOW);
          const third = await offer('taro');
          if (!third.ok) throw new Error(third.reason);
          ids.push(third.offerId);
        },
      );
      Then(
        '申し出の ID はそのつど新しくなり、古い ID の「申し出をやめる」は OFFER_GONE になる',
        async () => {
          expect(new Set(ids).size).toBe(3);
          expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ offerId: ids[2], status: 'open' });
          expect(reasonOf(await withdraw('taro', ids[0] as string))).toBe('OFFER_GONE');
          expect(reasonOf(await withdraw('taro', ids[1] as string))).toBe('OFFER_GONE');
        },
      );
    },
  );

  Scenario('申し出た本人は、引き受けられる前なら取り下げられる', ({ Given, And, When, Then }) => {
    let before: Record<string, unknown> | undefined;
    Given(BASE, seedBase);
    And(OPEN_OFFER, () => seedOpenOffer());
    When('太郎が申し出をやめる', async () => {
      before = { ...dishes() };
      reasons.push(reasonOf(await withdraw('taro')));
    });
    Then(
      '申し出は withdrawn になり、担当は変わらず、そのあと花子が引き受けると OFFER_GONE になる',
      async () => {
        expect(reasons).toEqual(['OK']);
        expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ status: 'withdrawn' });
        expect(dishes()).toEqual(before);
        const result = await acceptSwap(ctxOf('hanako'), DUTY_ID, FAKE_U8_OFFER_ID_1, { now: NOW });
        expect(reasonOf(result)).toBe('OFFER_GONE');
      },
    );
  });

  Scenario('本人以外（管理者を含む）は取り下げられない', ({ Given, And, When, Then }) => {
    Given(BASE, seedBase);
    And(OPEN_OFFER, () => seedOpenOffer());
    When('花子と管理者が申し出をやめる', async () => {
      reasons.push(reasonOf(await withdraw('hanako')), reasonOf(await withdraw('mother')));
    });
    Then('どちらも OFFER_OWNER_ONLY で、申し出は open のままである', () => {
      expect(reasons).toEqual(['OFFER_OWNER_ONLY', 'OFFER_OWNER_ONLY']);
      expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ status: 'open' });
    });
  });

  Scenario(
    '引き受け済み・ない・ID が違う・終わった申し出の取り下げは、決まった印で断られる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '引き受け済み、申し出なし、ID 違い、withdrawn、cancelled、担当が変わった open のそれぞれを太郎が取り下げる',
        async () => {
          reset();
          seedAcceptedByHanako();
          reasons.push(reasonOf(await withdraw('taro')));
          reset();
          reasons.push(reasonOf(await withdraw('taro')));
          reset();
          seedOpenOffer();
          reasons.push(reasonOf(await withdraw('taro', FAKE_U8_OFFER_ID_2)));
          for (const status of ['withdrawn', 'cancelled'] as const) {
            reset();
            seedOpenOffer({ status });
            reasons.push(reasonOf(await withdraw('taro')));
          }
          reset();
          seedOpenOffer({ dutyVersion: 1 });
          reasons.push(reasonOf(await withdraw('taro')));
        },
      );
      Then('引き受け済みは OFFER_ALREADY_ACCEPTED、ほかはすべて OFFER_GONE になる', () => {
        expect(reasons).toEqual([
          'OFFER_ALREADY_ACCEPTED',
          'OFFER_GONE',
          'OFFER_GONE',
          'OFFER_GONE',
          'OFFER_GONE',
          'OFFER_GONE',
        ]);
      });
    },
  );

  Scenario(
    '申し出の書き込みの直前に状況が変わると、読み直して決まった印を返す',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '書き込みの直前に担当が済になる、月が確定される、同じ担当に有効な申し出が入るを別々に起こして申し出る',
        async () => {
          reset();
          world.hooks.beforeTransaction(nextTransaction(), () =>
            seedDoneDuty(calendar, {
              dutyId: DUTY_ID,
              date: DATE,
              choreTypeId: choreId('dishes'),
              childUserId: childId('taro'),
              version: 3,
            }),
          );
          reasons.push(reasonOf(await offer('taro')));
          reset();
          world.hooks.beforeTransaction(nextTransaction(), () =>
            seedMonthState(calendar, { month: MONTH, confirmed: true }),
          );
          reasons.push(reasonOf(await offer('taro')));
          reset();
          world.hooks.beforeTransaction(nextTransaction(), () => seedOpenOffer());
          reasons.push(reasonOf(await offer('taro')));
        },
      );
      Then(
        'DUTY_NOT_TODO、MONTH_CONFIRMED、ALREADY_OFFERED の順に返り、そのつど読み直しが 1 回記録される',
        () => {
          expect(reasons).toEqual(['DUTY_NOT_TODO', 'MONTH_CONFIRMED', 'ALREADY_OFFERED']);
          expect(logs.rows('SWAP_RETRY')).toHaveLength(3);
        },
      );
    },
  );

  Scenario(
    '2 回続けて断られると INTERNAL になり、思いがけない失敗は投げ直される',
    ({ Given, When, And, Then }) => {
      let thrown: unknown;
      Given(BASE, seedBase);
      When('取引を 2 回続けて競合で断らせて申し出る', async () => {
        world.hooks.failTransaction(1, 'ConditionalCheckFailed');
        world.hooks.failTransaction(2, 'ConditionalCheckFailed');
        reasons.push(reasonOf(await offer('taro')));
      });
      And('次の取引を ThrottlingError で断らせて申し出る', async () => {
        world.hooks.failTransaction(3, 'ThrottlingError');
        try {
          await offer('taro');
        } catch (error) {
          thrown = error;
        }
      });
      Then(
        '1 回目は INTERNAL（書き込みの呼び出しは 2 回）で何も書かれず、2 回目はエラーとして投げ直される',
        () => {
          expect(reasons).toEqual(['INTERNAL']);
          expect(world.hooks.transactionSizes).toEqual([3, 3, 3]);
          expect(offerCount(calendar)).toBe(0);
          expect(thrown).toBeInstanceOf(Error);
        },
      );
    },
  );

  Scenario(
    '取り下げと引き受けが競合して引き受けが先なら、取り下げは OFFER_ALREADY_ACCEPTED になる',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And(OPEN_OFFER, () => seedOpenOffer());
      When('取り下げの書き込みの直前に花子が先に引き受ける', async () => {
        world.hooks.beforeNextUpdate = seedAcceptedByHanako;
        reasons.push(reasonOf(await withdraw('taro')));
      });
      Then('太郎の取り下げは OFFER_ALREADY_ACCEPTED で、担当は花子のままである', () => {
        expect(reasons).toEqual(['OFFER_ALREADY_ACCEPTED']);
        expect(dishes()).toMatchObject({ childUserId: childId('hanako') });
      });
    },
  );
});
