import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import {
  buildMarkDoneItems,
  buildResetStatusItems,
  putConfirmedMonthIfAbsent,
  updateMonthConfirmation,
  writeTransaction,
} from '../../src/repositories/calendarRepository';
import type { DutyRecord } from '../../src/models';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
  type Table,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { FAKE_ADMIN_USER_ID, FAKE_U7_DUTY_ID_A } from '../fixtures/fakeSecrets';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  setUnitPrice,
  storedDuty,
  storedMonthState,
} from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature(
  'packages/backend/test/u7-review-confirm/status-transaction.feature',
);

const MONTH = '2027-01';
const DATE = '2027-01-05';
const NOW = new Date('2027-01-07T11:00:00.000Z');
const DUTY_ID = FAKE_U7_DUTY_ID_A;
const CTX = { familyId: FAMILY_ID, userId: FAKE_ADMIN_USER_ID };

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let outcome: 'written' | 'conflict' | 'exists' | 'absent';

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
  });

  const dutyRecord = (over: Partial<DutyRecord> = {}): DutyRecord => ({
    dutyId: DUTY_ID,
    familyId: FAMILY_ID,
    month: MONTH,
    date: DATE,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    status: 'todo',
    origin: 'rule',
    version: 2,
    createdAt: '2026-12-20T00:00:00.000Z',
    updatedAt: '2026-12-20T00:00:00.000Z',
    ...over,
  });

  const dishesRow = (): Record<string, unknown> | undefined =>
    storedDuty(calendar, DATE, choreId('dishes'));

  const seedTodo = (status: 'todo' | 'skipped' = 'todo', version = 2): void => {
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status,
      version,
    });
  };
  const seedDone = (version = 2): void => {
    seedDoneDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version,
      recordedAt: '2027-01-06T10:00:00.000Z',
      recordedBy: FAKE_ADMIN_USER_ID,
      unitPrice: 120,
    });
  };

  Scenario(
    'markDone（未→済）は 3 項目で書かれ、記録の 3 項目がそろう',
    ({ Given, When, Then, And }) => {
      let items: ReturnType<typeof buildMarkDoneItems>;
      Given(
        '太郎の皿洗い（未・version 2）と、確定していない 2027-01、皿洗いの単価 120 円がある',
        () => {
          seedTodo('todo', 2);
          seedMonthState(calendar, { month: MONTH, confirmed: false });
        },
      );
      When('markDone の取引（単価 120 円）を書く', async () => {
        items = buildMarkDoneItems(dutyRecord(), 120, CTX, NOW);
        outcome = await writeTransaction(items);
      });
      Then('取引は成功し、担当は済・単価 120 円・記録者は管理者・version 3 になる', () => {
        expect(outcome).toBe('written');
        expect(dishesRow()).toMatchObject({
          status: 'done',
          unitPrice: 120,
          recordedBy: FAKE_ADMIN_USER_ID,
          recordedAt: NOW.toISOString(),
          version: 3,
        });
      });
      And('取引の項目数は 3 である', () => {
        expect(items).toHaveLength(3);
      });
    },
  );

  Scenario(
    'markDone（×→済）は :from が skipped で、月の確かめは担当の月で行う',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い（×・version 2）と、確定していない 2027-01 がある', () => {
        seedTodo('skipped', 2);
        seedMonthState(calendar, { month: MONTH, confirmed: false });
      });
      When('markDone の取引（単価 120 円）を書く', async () => {
        outcome = await writeTransaction(
          buildMarkDoneItems(dutyRecord({ status: 'skipped' }), 120, CTX, NOW),
        );
      });
      Then('取引は成功し、担当は済・version 3 になる', () => {
        expect(outcome).toBe('written');
        expect(dishesRow()).toMatchObject({ status: 'done', version: 3 });
      });
    },
  );

  Scenario('markDone は確定した月では断られ、何も書かれない', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 2）と、確定した 2027-01 がある', () => {
      seedTodo('todo', 2);
      seedMonthState(calendar, { month: MONTH, confirmed: true });
    });
    When('markDone の取引（単価 120 円）を書く', async () => {
      outcome = await writeTransaction(buildMarkDoneItems(dutyRecord(), 120, CTX, NOW));
    });
    Then('取引は競合で断られ、担当は未のまま', () => {
      expect(outcome).toBe('conflict');
      expect(dishesRow()).toMatchObject({ status: 'todo', version: 2 });
    });
  });

  Scenario(
    'markDone は単価が先に変わると断られる（buildUnitPriceGuard）',
    ({ Given, When, Then }) => {
      Given(
        '太郎の皿洗い（未・version 2）と、確定していない 2027-01、皿洗いの単価 120 円がある',
        () => {
          seedTodo('todo', 2);
          seedMonthState(calendar, { month: MONTH, confirmed: false });
        },
      );
      When(
        '読んだ単価 120 円で markDone の取引を書くが、書く直前に単価が 150 円に変わる',
        async () => {
          world.hooks.beforeTransaction(1, () => {
            setUnitPrice(world.choreTypes, choreId('dishes'), 150);
          });
          outcome = await writeTransaction(buildMarkDoneItems(dutyRecord(), 120, CTX, NOW));
        },
      );
      Then('取引は競合で断られ、担当は未のまま', () => {
        expect(outcome).toBe('conflict');
        expect(dishesRow()).toMatchObject({ status: 'todo', version: 2 });
      });
    },
  );

  Scenario(
    'cancel（済→未）は 2 項目で、記録の 3 項目が同時に消える',
    ({ Given, When, Then, And }) => {
      let items: ReturnType<typeof buildResetStatusItems>;
      Given(
        '太郎の皿洗い（済・単価 120 円・記録者は管理者・version 2）と、確定していない 2027-01 がある',
        () => {
          seedDone(2);
          seedMonthState(calendar, { month: MONTH, confirmed: false });
        },
      );
      When('cancel の取引を書く', async () => {
        items = buildResetStatusItems(dutyRecord({ status: 'done' }), 'todo', NOW);
        outcome = await writeTransaction(items);
      });
      Then(
        '取引は成功し、担当は未になり、recordedAt・recordedBy・unitPrice が 3 つとも消える',
        () => {
          expect(outcome).toBe('written');
          const row = dishesRow()!;
          expect(row.status).toBe('todo');
          expect(row.recordedAt).toBeUndefined();
          expect(row.recordedBy).toBeUndefined();
          expect(row.unitPrice).toBeUndefined();
          expect(row.version).toBe(3);
        },
      );
      And('取引の項目数は 2 である', () => {
        expect(items).toHaveLength(2);
      });
    },
  );

  Scenario(
    'markSkipped（済→×）は記録の 3 項目を消し、単価の確かめを付けない',
    ({ Given, When, Then }) => {
      Given(
        '太郎の皿洗い（済・単価 120 円・記録者は管理者・version 2）と、確定していない 2027-01 がある',
        () => {
          seedDone(2);
          seedMonthState(calendar, { month: MONTH, confirmed: false });
        },
      );
      When('markSkipped（×へ）の取引を書く', async () => {
        outcome = await writeTransaction(
          buildResetStatusItems(dutyRecord({ status: 'done' }), 'skipped', NOW),
        );
      });
      Then('取引は成功し、担当は×になり、記録の 3 項目が消える', () => {
        expect(outcome).toBe('written');
        const row = dishesRow()!;
        expect(row.status).toBe('skipped');
        expect(row.recordedAt).toBeUndefined();
        expect(row.unitPrice).toBeUndefined();
      });
    },
  );

  Scenario(
    'version が先に進むと担当の Update が断られる（見せたあとに変わった担当を上書きしない）',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い（済・version 5）と、確定していない 2027-01 がある', () => {
        seedDone(5);
        seedMonthState(calendar, { month: MONTH, confirmed: false });
      });
      When('version 2 として組み立てた cancel の取引を書く', async () => {
        outcome = await writeTransaction(
          buildResetStatusItems(dutyRecord({ status: 'done', version: 2 }), 'todo', NOW),
        );
      });
      Then('取引は競合で断られ、担当は済のまま', () => {
        expect(outcome).toBe('conflict');
        expect(dishesRow()).toMatchObject({ status: 'done', version: 5 });
      });
    },
  );

  Scenario('確定は行のない月に version=1 の行を作る', ({ Given, When, Then }) => {
    Given('行のない 2027-03 がある', () => {
      // 何も置かない
    });
    When('2027-03 に putConfirmedMonthIfAbsent を呼ぶ', async () => {
      outcome = await putConfirmedMonthIfAbsent(CTX, '2027-03', NOW);
    });
    Then('written が返り、2027-03 の行は確定・version=1 になる', () => {
      expect(outcome).toBe('written');
      expect(storedMonthState(calendar, '2027-03')).toMatchObject({ confirmed: true, version: 1 });
    });
  });

  Scenario(
    '確定は行がある月に UpdateItem でそろえる（version を条件にしない）',
    ({ Given, When, Then }) => {
      Given('確定していない 2027-01（version 4）がある', () => {
        seedMonthState(calendar, { month: MONTH, confirmed: false, version: 4 });
      });
      When('2027-01 に updateMonthConfirmation（確定）を呼ぶ', async () => {
        outcome = await updateMonthConfirmation(CTX, MONTH, true, NOW);
      });
      Then('written が返り、2027-01 は確定・version=5 になる', () => {
        expect(outcome).toBe('written');
        expect(storedMonthState(calendar, MONTH)).toMatchObject({ confirmed: true, version: 5 });
      });
    },
  );

  Scenario('取り消しは行がある月を false にし、行のない月は何もしない', ({ Given, When, Then }) => {
    let emptyOutcome: string;
    Given('確定した 2027-01（version 2）と、行のない 2027-03 がある', () => {
      seedMonthState(calendar, { month: MONTH, confirmed: true, version: 2 });
    });
    When('2027-01 と 2027-03 に updateMonthConfirmation（取り消し）を呼ぶ', async () => {
      outcome = await updateMonthConfirmation(CTX, MONTH, false, NOW);
      emptyOutcome = await updateMonthConfirmation(CTX, '2027-03', false, NOW);
    });
    Then('2027-01 は未確定・version=3 になり、2027-03 は行が作られない', () => {
      expect(outcome).toBe('written');
      expect(storedMonthState(calendar, MONTH)).toMatchObject({ confirmed: false, version: 3 });
      expect(emptyOutcome).toBe('absent');
      expect(storedMonthState(calendar, '2027-03')).toBeUndefined();
    });
  });
});
