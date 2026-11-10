import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { listSwappableDuties, type SwappableDuty } from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
  type Table,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_DUTY_ID_C,
  FAKE_U8_DUTY_ID_D,
  FAKE_U8_OFFER_ID_1,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';
import { ctxOf, TODAY } from './helpers/swapWorld';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedOffer,
} from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature('packages/backend/test/u8-swap/swap-list.feature');

type Result = SwappableDuty[] | 'NO_SWAPPABLE_DUTY' | 'MONTH_CONFIRMED';

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let results: Result[];

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    results = [];
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
  });

  const list = async (today = TODAY): Promise<void> => {
    results.push(await listSwappableDuties(ctxOf('taro'), today));
  };
  const asList = (index = 0): SwappableDuty[] => {
    const result = results[index];
    if (!Array.isArray(result)) throw new Error(`一覧ではなく ${String(result)} が返りました`);
    return result;
  };
  const taroDuty = (
    dutyId: string,
    date: string,
    chore: 'dishes' | 'laundry' | 'garbage' | 'bath',
  ) =>
    seedDuty(calendar, {
      dutyId,
      date,
      choreTypeId: choreId(chore),
      childUserId: childId('taro'),
    });

  Scenario(
    '自分の・今日以降の・「未」の担当だけが日付の近い順に出る',
    ({ Given, When, Then, And }) => {
      Given(
        '太郎の担当（過去の皿洗い、今日の洗濯物たたみ、済のゴミ出し、10 日の皿洗い、来月の皿洗い）と花子の担当がある',
        () => {
          taroDuty(fakeU8DutyId(1), '2027-01-07', 'dishes');
          taroDuty(fakeU8DutyId(2), '2027-01-08', 'laundry');
          seedDoneDuty(calendar, {
            dutyId: fakeU8DutyId(3),
            date: '2027-01-09',
            choreTypeId: choreId('garbage'),
            childUserId: childId('taro'),
          });
          taroDuty(fakeU8DutyId(4), '2027-01-10', 'dishes');
          taroDuty(fakeU8DutyId(5), '2027-02-03', 'dishes');
          seedDuty(calendar, {
            dutyId: fakeU8DutyId(6),
            date: '2027-01-09',
            choreTypeId: choreId('dishes'),
            childUserId: childId('hanako'),
          });
        },
      );
      When('太郎が申し出られる担当の一覧を求める', () => list());
      Then('返るのは今日の洗濯物たたみ、10 日の皿洗い、来月の皿洗いの順である', () => {
        expect(asList().map((d) => [d.dutyId, d.date, d.choreName])).toEqual([
          [fakeU8DutyId(2), '2027-01-08', '洗濯物たたみ'],
          [fakeU8DutyId(4), '2027-01-10', '皿洗い'],
          [fakeU8DutyId(5), '2027-02-03', '皿洗い'],
        ]);
      });
      And('花子の担当・過去の担当・済の担当は出ない', () => {
        const ids = asList().map((d) => d.dutyId);
        for (const n of [1, 3, 6]) expect(ids).not.toContain(fakeU8DutyId(n));
      });
    },
  );

  Scenario(
    '同じ日の担当は種類の順に並び、「使わない」種類は最後になる',
    ({ Given, When, Then }) => {
      Given('太郎の同じ日のお風呂洗い（使わない）、ゴミ出し、皿洗いの担当がある', () => {
        taroDuty(FAKE_U8_DUTY_ID_A, '2027-01-12', 'bath');
        taroDuty(FAKE_U8_DUTY_ID_B, '2027-01-12', 'garbage');
        taroDuty(FAKE_U8_DUTY_ID_C, '2027-01-12', 'dishes');
      });
      When('太郎が申し出られる担当の一覧を求める', () => list());
      Then('返るのは皿洗い、ゴミ出し、お風呂洗いの順である', () => {
        expect(asList().map((d) => d.choreName)).toEqual(['皿洗い', 'ゴミ出し', 'お風呂洗い']);
      });
    },
  );

  Scenario(
    '確定している月の担当は出さず、確定していない月の担当だけが出る',
    ({ Given, When, Then }) => {
      Given('太郎の今月と来月の担当があり、今月が確定している', () => {
        taroDuty(FAKE_U8_DUTY_ID_A, '2027-01-12', 'dishes');
        taroDuty(FAKE_U8_DUTY_ID_B, '2027-02-03', 'dishes');
        seedMonthState(calendar, { month: '2027-01', confirmed: true });
      });
      When('太郎が申し出られる担当の一覧を求める', () => list());
      Then('来月の担当だけが返る', () => {
        expect(asList().map((d) => d.dutyId)).toEqual([FAKE_U8_DUTY_ID_B]);
      });
    },
  );

  Scenario('引き受けた担当も、申し出が出ている担当も候補に入る', ({ Given, When, Then }) => {
    Given('太郎の担当に、引き受けたもの（origin が swap）と申し出が出ているものがある', () => {
      seedDuty(calendar, {
        dutyId: FAKE_U8_DUTY_ID_A,
        date: '2027-01-12',
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        origin: 'swap',
        version: 2,
      });
      taroDuty(FAKE_U8_DUTY_ID_B, '2027-01-13', 'dishes');
      seedOffer(calendar, {
        dutyId: FAKE_U8_DUTY_ID_B,
        offerId: FAKE_U8_OFFER_ID_1,
        offererUserId: childId('taro'),
        dutyVersion: 1,
      });
    });
    When('太郎が申し出られる担当の一覧を求める', () => list());
    Then('2 件とも返る', () => {
      expect(asList().map((d) => d.dutyId)).toEqual([FAKE_U8_DUTY_ID_A, FAKE_U8_DUTY_ID_B]);
    });
  });

  Scenario('候補がなく今月が確定していれば MONTH_CONFIRMED を返す', ({ Given, When, Then }) => {
    Given('太郎の担当がなく、今月が確定している', () => {
      seedMonthState(calendar, { month: '2027-01', confirmed: true });
    });
    When('太郎が申し出られる担当の一覧を求める', () => list());
    Then('理由の印 MONTH_CONFIRMED が返る', () => {
      expect(results).toEqual(['MONTH_CONFIRMED']);
    });
  });

  Scenario(
    '候補がなく今月が確定していなければ NO_SWAPPABLE_DUTY を返す',
    ({ Given, When, Then }) => {
      Given('太郎の担当がなく、今月は確定していない', () => {
        seedMonthState(calendar, { month: '2027-01', confirmed: false });
      });
      When('太郎が申し出られる担当の一覧を求める', () => list());
      Then('理由の印 NO_SWAPPABLE_DUTY が返る', () => {
        expect(results).toEqual(['NO_SWAPPABLE_DUTY']);
      });
    },
  );

  Scenario(
    '来月だけ確定していて今月に候補がなければ NO_SWAPPABLE_DUTY を返す',
    ({ Given, When, Then }) => {
      Given('太郎の担当がなく、来月だけが確定している', () => {
        seedMonthState(calendar, { month: '2027-02', confirmed: true });
      });
      When('太郎が申し出られる担当の一覧を求める', () => list());
      Then('理由の印 NO_SWAPPABLE_DUTY が返る', () => {
        expect(results).toEqual(['NO_SWAPPABLE_DUTY']);
      });
    },
  );

  Scenario('月末・年またぎ・うるう年でも今月と来月を正しく読む', ({ Given, When, Then }) => {
    Given('太郎の 2026-12-31、2027-01-02、2028-02-29、2028-03-01 の担当がある', () => {
      taroDuty(FAKE_U8_DUTY_ID_A, '2026-12-31', 'dishes');
      taroDuty(FAKE_U8_DUTY_ID_B, '2027-01-02', 'dishes');
      taroDuty(FAKE_U8_DUTY_ID_C, '2028-02-29', 'dishes');
      taroDuty(FAKE_U8_DUTY_ID_D, '2028-03-01', 'dishes');
    });
    When('今日を 2026-12-31 として一覧を求め、今日を 2028-02-29 として一覧を求める', async () => {
      await list('2026-12-31');
      await list('2028-02-29');
    });
    Then('年またぎでは 12 月末と 1 月の担当が返り、うるう日では 2 月末と 3 月の担当が返る', () => {
      expect(asList(0).map((d) => d.date)).toEqual(['2026-12-31', '2027-01-02']);
      expect(asList(1).map((d) => d.date)).toEqual(['2028-02-29', '2028-03-01']);
    });
  });

  Scenario(
    '読み取りは月の Query 2 回と種類の Query 1 回で、担当の数で増えない',
    ({ Given, When, Then }) => {
      Given('太郎の担当が 12 件ある', () => {
        for (let i = 0; i < 12; i += 1) {
          taroDuty(fakeU8DutyId(i), `2027-01-${String(10 + i).padStart(2, '0')}`, 'dishes');
        }
      });
      When('太郎が申し出られる担当の一覧を求める', async () => {
        world.hooks.readLog.length = 0;
        world.hooks.readTargets.length = 0;
        await list();
      });
      Then(
        '読み取りは Query 3 回だけで、Scan も申し出の項目の読み取りもなく、12 件すべてが返る',
        () => {
          expect(world.hooks.readLog.map((entry) => entry.operation)).toEqual([
            'Query',
            'Query',
            'Query',
          ]);
          expect(world.hooks.readTargets.join('\n')).not.toContain('SWAP#');
          expect(asList()).toHaveLength(12);
        },
      );
    },
  );
});
