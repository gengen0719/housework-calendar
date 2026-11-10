import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import {
  notifyDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import { notifyDutyRecorded, resetDutyRecordedHooks } from '../../src/services/dutyRecordedHook';
import {
  acceptSwap,
  offerSwap,
  registerSwapHooks,
  resetSwapHooksForTest,
} from '../../src/services/swapService';
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
  FAKE_U8_OFFER_ID_1,
  fakeU8ChoreTypeId,
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
  storedOffer,
  swapSk,
} from './helpers/seed';
import { captureLogs, ctxOf, NOW } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature('packages/backend/test/u8-swap/swap-cleanup.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const DATE = '2027-01-12';
const MONTH = '2027-01';
const BASE = '太郎の皿洗い（未・version 2）に太郎の open の申し出がある';

type Outcome = { ok: true } | { ok: false; reason: string };
const reasonOf = (result: Outcome): string => (result.ok ? 'OK' : result.reason);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let logs: ReturnType<typeof captureLogs>;
  let reasons: string[];

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    logs = captureLogs();
    reasons = [];
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    resetSwapHooksForTest();
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    resetSwapHooksForTest();
    vi.restoreAllMocks();
  });

  const seedDishes = (over: { date?: string; childUserId?: string; version?: number } = {}) =>
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: over.date ?? DATE,
      choreTypeId: choreId('dishes'),
      childUserId: over.childUserId ?? childId('taro'),
      version: over.version ?? 2,
    });
  const seedOpenOffer = (dutyId = DUTY_ID, dutyVersion = 2): void =>
    seedOffer(calendar, {
      dutyId,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion,
    });
  const seedBase = (): void => {
    seedDishes();
    seedMonthState(calendar, { month: MONTH, confirmed: false });
    seedOpenOffer();
  };
  const reset = (): void => {
    calendar.clear();
    seedBase();
  };
  const statusOf = (dutyId = DUTY_ID): unknown => storedOffer(calendar, dutyId)?.status;
  const reassigned = (dutyId: string, kind: DutyReassignedEvent['kind']): DutyReassignedEvent => ({
    familyId: FAMILY_ID,
    dutyId,
    date: DATE,
    choreTypeId: choreId('dishes'),
    kind,
    fromChildUserId: childId('taro'),
  });
  const recorded = (dutyId: string) => ({
    familyId: FAMILY_ID,
    dutyId,
    date: DATE,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
  });
  const accept = async () =>
    reasonOf(await acceptSwap(ctxOf('hanako'), DUTY_ID, FAKE_U8_OFFER_ID_1, { now: NOW }));

  Scenario(
    '登録を二重に呼んでも登録は 1 回だけで、記録されると申し出が cancelled になる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When('画面用の登録を 2 回呼び、その担当が記録されたことを通知する', async () => {
        registerSwapHooks({ reassigned: true, recorded: true });
        registerSwapHooks({ reassigned: true, recorded: true });
        await notifyDutyRecorded(recorded(DUTY_ID));
      });
      Then('申し出は cancelled になり、SWAP_OFFER_CLOSED が 1 件だけ出る', () => {
        expect(statusOf()).toBe('cancelled');
        expect(logs.rows('SWAP_OFFER_CLOSED')).toHaveLength(1);
        expect(logs.rows('SWAP_OFFER_CLOSED')[0]).toMatchObject({
          familyId: FAMILY_ID,
          dutyId: DUTY_ID,
          via: 'recorded',
        });
        // 登録が 2 回なら、掃除の書き込みも 2 回になる
        expect(world.mock.commandCalls(UpdateCommand)).toHaveLength(1);
      });
    },
  );

  Scenario(
    '画面用の登録では、担当の子供の変更・消えた・状態の変更のどれでも申し出が cancelled になる',
    ({ Given, When, Then }) => {
      const ids = [FAKE_U8_DUTY_ID_A, FAKE_U8_DUTY_ID_B, FAKE_U8_DUTY_ID_C];
      Given(BASE, seedBase);
      When('画面用の登録を呼び、3 つの種類の通知をそれぞれ別の申し出に対して出す', async () => {
        seedDuty(calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          date: DATE,
          choreTypeId: choreId('laundry'),
          childUserId: childId('taro'),
          version: 2,
        });
        seedDuty(calendar, {
          dutyId: FAKE_U8_DUTY_ID_C,
          date: DATE,
          choreTypeId: choreId('garbage'),
          childUserId: childId('taro'),
          version: 2,
        });
        seedOpenOffer(FAKE_U8_DUTY_ID_B);
        seedOpenOffer(FAKE_U8_DUTY_ID_C);
        registerSwapHooks({ reassigned: true, recorded: true });
        await notifyDutyReassigned([reassigned(ids[0] as string, 'child-changed')]);
        await notifyDutyReassigned([reassigned(ids[1] as string, 'deleted')]);
        await notifyDutyReassigned([reassigned(ids[2] as string, 'status-changed')]);
      });
      Then('3 件とも cancelled になり、SWAP_OFFER_CLOSED が via 付きで 3 件出る', () => {
        expect(ids.map((id) => statusOf(id))).toEqual(['cancelled', 'cancelled', 'cancelled']);
        expect(logs.rows('SWAP_OFFER_CLOSED').map((row) => row.via)).toEqual([
          'child-changed',
          'deleted',
          'status-changed',
        ]);
      });
    },
  );

  Scenario(
    'LINE 用の登録では担当を変える通知を登録せず、記録の通知だけで掃除する',
    ({ Given, When, Then }) => {
      let afterReassigned: unknown;
      Given(BASE, seedBase);
      When('LINE 用の登録を呼び、担当を変える通知と記録の通知を順に出す', async () => {
        registerSwapHooks({ reassigned: false, recorded: true });
        await notifyDutyReassigned([reassigned(DUTY_ID, 'child-changed')]);
        afterReassigned = statusOf();
        await notifyDutyRecorded(recorded(DUTY_ID));
      });
      Then('担当を変える通知では申し出は open のままで、記録の通知で cancelled になる', () => {
        expect(afterReassigned).toBe('open');
        expect(statusOf()).toBe('cancelled');
      });
    },
  );

  Scenario(
    '申し出がない担当や open でない申し出は、何も書かれずログも出ない',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When('画面用の登録を呼び、申し出のない担当と引き受け済みの申し出に通知を出す', async () => {
        seedOffer(calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          offerId: FAKE_U8_OFFER_ID_1,
          offererUserId: childId('taro'),
          dutyVersion: 2,
          status: 'accepted',
          acceptedByUserId: childId('hanako'),
        });
        calendar.delete(`${FAMILY_ID}#${swapSk(DUTY_ID)}`);
        registerSwapHooks({ reassigned: true, recorded: true });
        await notifyDutyReassigned([
          reassigned(DUTY_ID, 'status-changed'),
          reassigned(FAKE_U8_DUTY_ID_B, 'status-changed'),
        ]);
        await notifyDutyRecorded(recorded(FAKE_U8_DUTY_ID_C));
      });
      Then('申し出の項目は作られず、引き受け済みは変わらず、SWAP_OFFER_CLOSED は出ない', () => {
        expect(offerCount(calendar)).toBe(1);
        expect(statusOf(FAKE_U8_DUTY_ID_B)).toBe('accepted');
        expect(logs.rows('SWAP_OFFER_CLOSED')).toHaveLength(0);
      });
    },
  );

  Scenario(
    'フックがなくても、5 つの条件のどれかが崩れた申し出は「なくなった」と扱われる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '担当の version 違い、済、担当の子供の変更、過ぎた日、確定済みの月のそれぞれを花子が引き受ける',
        async () => {
          reset();
          seedOpenOffer(DUTY_ID, 1);
          reasons.push(await accept());
          reset();
          seedDoneDuty(calendar, {
            dutyId: DUTY_ID,
            date: DATE,
            choreTypeId: choreId('dishes'),
            childUserId: childId('taro'),
            version: 2,
          });
          reasons.push(await accept());
          reset();
          seedDishes({ childUserId: childId('jiro') });
          reasons.push(await accept());
          calendar.clear();
          seedDishes({ date: '2027-01-07' });
          seedMonthState(calendar, { month: MONTH, confirmed: false });
          seedOpenOffer();
          reasons.push(await accept());
          reset();
          seedMonthState(calendar, { month: MONTH, confirmed: true });
          reasons.push(await accept());
        },
      );
      Then('すべて OFFER_GONE になる', () => {
        expect(reasons).toEqual(Array(5).fill('OFFER_GONE'));
      });
    },
  );

  Scenario(
    '担当の version が変わっていれば、古い open の項目に新しく申し出し直せる',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When('担当の version が 3 に変わった状態で太郎が申し出る', async () => {
        seedDishes({ version: 3 });
        const result = await offerSwap(ctxOf('taro'), DUTY_ID, { now: NOW });
        reasons.push(reasonOf(result));
      });
      Then('申し出は新しい ID の open になる', () => {
        expect(reasons).toEqual(['OK']);
        expect(storedOffer(calendar, DUTY_ID)).toMatchObject({ status: 'open', dutyVersion: 3 });
        expect(storedOffer(calendar, DUTY_ID)?.offerId).not.toBe(FAKE_U8_OFFER_ID_1);
      });
    },
  );

  Scenario(
    '掃除のフックが投げても、保存の結果は変わらず警告だけが残る',
    ({ Given, When, Then }) => {
      let threw = false;
      Given(BASE, seedBase);
      When('画面用の登録を呼び、掃除の書き込みを失敗させて記録の通知を出す', async () => {
        registerSwapHooks({ reassigned: true, recorded: true });
        world.hooks.beforeNextUpdate = () => {
          throw new Error('掃除の書き込みの失敗');
        };
        try {
          await notifyDutyRecorded(recorded(DUTY_ID));
        } catch {
          threw = true;
        }
      });
      Then(
        '通知は投げずに終わり、DUTY_RECORDED_HOOK_FAILED の警告が 1 件残り、申し出は open のままである',
        () => {
          expect(threw).toBe(false);
          expect(logs.rows('DUTY_RECORDED_HOOK_FAILED')).toHaveLength(1);
          expect(statusOf()).toBe('open');
        },
      );
    },
  );

  Scenario(
    '月の確定の 300 件のうち 1 件の掃除が失敗しても、残りは続き、残った申し出は引き受けられない',
    ({ Given, When, Then, And }) => {
      const ids = Array.from({ length: 300 }, (_, i) => fakeU8DutyId(i));
      Given('確定された月に、太郎の「未」の担当 300 件と、それぞれの open の申し出がある', () => {
        seedMonthState(calendar, { month: MONTH, confirmed: true });
        ids.forEach((dutyId, i) => {
          seedDuty(calendar, {
            dutyId,
            date: DATE,
            choreTypeId: fakeU8ChoreTypeId(i),
            childUserId: childId('taro'),
            version: 1,
          });
          seedOpenOffer(dutyId, 1);
        });
      });
      When(
        '画面用の登録を呼び、300 件の状態の変更を通知し、最初の掃除の書き込みを失敗させる',
        async () => {
          registerSwapHooks({ reassigned: true, recorded: true });
          world.hooks.beforeNextUpdate = () => {
            throw new Error('掃除の書き込みの失敗');
          };
          await notifyDutyReassigned(ids.map((id) => reassigned(id, 'status-changed')));
        },
      );
      Then(
        '299 件が cancelled になり、1 件が open のまま残り、DUTY_HOOK_FAILED が 1 件出る',
        () => {
          const statuses = ids.map((id) => statusOf(id));
          expect(statuses.filter((s) => s === 'cancelled')).toHaveLength(299);
          expect(statuses.filter((s) => s === 'open')).toHaveLength(1);
          expect(logs.rows('DUTY_HOOK_FAILED')).toHaveLength(1);
          expect(logs.rows('SWAP_OFFER_CLOSED')).toHaveLength(299);
        },
      );
      And('300 件のどの申し出も、花子が引き受けると OFFER_GONE になる', async () => {
        for (const dutyId of ids) {
          const result = await acceptSwap(ctxOf('hanako'), dutyId, FAKE_U8_OFFER_ID_1, {
            now: NOW,
          });
          expect(reasonOf(result)).toBe('OFFER_GONE');
        }
      });
    },
  );

  Scenario(
    '確定を取り消すと、掃除できなかった open の申し出だけが有効に戻る',
    ({ Given, When, Then }) => {
      Given(BASE, seedBase);
      When(
        '月が確定し、花子が引き受けられず、確定が取り消され、太郎が同じ担当を申し出る',
        async () => {
          seedMonthState(calendar, { month: MONTH, confirmed: true });
          reasons.push(await accept());
          seedMonthState(calendar, { month: MONTH, confirmed: false });
          reasons.push(reasonOf(await offerSwap(ctxOf('taro'), DUTY_ID, { now: NOW })));
        },
      );
      Then('確定中は OFFER_GONE で、取り消し後は ALREADY_OFFERED になる', () => {
        expect(reasons).toEqual(['OFFER_GONE', 'ALREADY_OFFERED']);
      });
    },
  );
});
