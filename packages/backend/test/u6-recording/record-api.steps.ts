import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import type { Duty } from '@housework/shared';
import { CALENDAR_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { resetNow, setNow, setupWorld } from '../u1-skeleton-family/helpers/world';
import { callAs } from '../u5-assignment-calendar/helpers/seed';
import {
  childId,
  choreId,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  storedDuty,
  MONTH,
} from './helpers/seed';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_U6_NONEXISTENT_DUTY_ID,
  FAKE_UPPERCASE_UUID,
} from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u6-recording/record-api.feature');

type World = ReturnType<typeof setupWorld>;
type Result = APIGatewayProxyStructuredResultV2;

const TODAY = '2027-01-07';
const DUTY_ID = FAKE_U6_DUTY_ID_A;
const NON_EXISTENT_DUTY_ID = FAKE_U6_NONEXISTENT_DUTY_ID;

const recordPath = (dutyId: string): string => `/v1/duties/${dutyId}/record`;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let result: Result;

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    setNow(`${TODAY}T07:42:00.000Z`);
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    resetNow();
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

  const body = (): { error?: { reason: string } } & Partial<Duty> =>
    JSON.parse(String(result.body ?? '{}'));
  const dishesRow = (date = TODAY): Record<string, unknown> | undefined =>
    storedDuty(world.calendar, date, choreId('dishes'));

  Scenario('子供が自分の「未」の担当を記録すると 200 で Duty が返る', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎が POST /record を version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('200 で status=done・recordedBy=太郎・unitPrice=100 の Duty が返る', () => {
      expect(result.statusCode).toBe(200);
      const duty = body();
      expect(duty.status).toBe('done');
      expect(duty.recordedBy).toBe(childId('taro'));
      expect(duty.unitPrice).toBe(100);
    });
  });

  Scenario('前の月の担当も記録できる（月をまたぐ）', ({ Given, When, Then }) => {
    Given('太郎の前の月の皿洗い（未・version 1）がある', () => {
      seedDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: '2026-12-20',
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        status: 'todo',
        version: 1,
      });
    });
    When('太郎が前の月の担当を POST /record で version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('200 で status=done が返る', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('done');
    });
  });

  Scenario('確定した月の担当は 409 MONTH_CONFIRMED', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未）があり、その月が確定している', () => {
      seedDishes();
      seedMonthState(world.calendar, MONTH, true);
    });
    When('太郎が POST /record を version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('409 MONTH_CONFIRMED が返る', () => {
      expect(result.statusCode).toBe(409);
      expect(body().error?.reason).toBe('MONTH_CONFIRMED');
    });
  });

  Scenario('明日以降の担当は 422 FUTURE_DUTY', ({ Given, When, Then }) => {
    Given('太郎の明日の皿洗い（未・version 1）がある', () => {
      seedDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: '2027-01-08',
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        status: 'todo',
        version: 1,
      });
    });
    When('太郎が明日の担当を POST /record で version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('422 FUTURE_DUTY が返る', () => {
      expect(result.statusCode).toBe(422);
      expect(body().error?.reason).toBe('FUTURE_DUTY');
    });
  });

  Scenario('「×」の担当は 409 DUTY_SKIPPED_BY_ADMIN', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗いが「×」になっている', () => {
      seedDishes({ status: 'skipped' });
    });
    When('太郎が POST /record を version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('409 DUTY_SKIPPED_BY_ADMIN が返る', () => {
      expect(result.statusCode).toBe(409);
      expect(body().error?.reason).toBe('DUTY_SKIPPED_BY_ADMIN');
    });
  });

  Scenario('ほかの子供の担当は 403 NOT_OWN_DUTY', ({ Given, When, Then }) => {
    Given('花子の今日の皿洗い（未・version 1）がある', () => {
      seedDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: TODAY,
        choreTypeId: choreId('dishes'),
        childUserId: childId('hanako'),
        status: 'todo',
        version: 1,
      });
    });
    When('太郎が花子の担当を POST /record で version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('403 NOT_OWN_DUTY が返る', () => {
      expect(result.statusCode).toBe(403);
      expect(body().error?.reason).toBe('NOT_OWN_DUTY');
    });
  });

  Scenario('管理者のセッションは 403 NOT_OWN_DUTY', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('お母さんが POST /record を version 1 で呼ぶ', async () => {
      result = await callAs('mother', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('403 NOT_OWN_DUTY が返る', () => {
      expect(result.statusCode).toBe(403);
      expect(body().error?.reason).toBe('NOT_OWN_DUTY');
    });
  });

  Scenario('本人の 2 回目は 200（同じ Duty）', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎が POST /record を version 1 で 2 回呼ぶ', async () => {
      await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
    });
    Then('どちらも 200 で status=done が返り、記録は 1 件のまま', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('done');
      expect(dishesRow()?.version).toBe(2);
    });
  });

  Scenario('ほかの家族の dutyId は本文が正しくても 404', ({ Given, When, Then }) => {
    Given('太郎の家族にない dutyId を、正しい本文で呼ぶ', () => {
      // 何も置かない（太郎の家族に NON_EXISTENT_DUTY_ID はない）
    });
    When('太郎が存在しない dutyId を POST /record で version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(NON_EXISTENT_DUTY_ID), { version: 1 });
    });
    Then('404 NOT_FOUND が返る', () => {
      expect(result.statusCode).toBe(404);
      expect(body().error?.reason).toBe('NOT_FOUND');
    });
  });

  Scenario(
    'ほかの家族の dutyId は本文が誤っていても 404（本文より先に 404）',
    ({ Given, When, Then }) => {
      Given('太郎の家族にない dutyId を、誤った本文で呼ぶ', () => {
        // 何も置かない
      });
      When('太郎が存在しない dutyId を POST /record で誤った本文で呼ぶ', async () => {
        result = await callAs('taro', 'POST', recordPath(NON_EXISTENT_DUTY_ID), {
          version: 'not-a-number',
        });
      });
      Then('404 NOT_FOUND が返る', () => {
        expect(result.statusCode).toBe(404);
        expect(body().error?.reason).toBe('NOT_FOUND');
      });
    },
  );

  Scenario('形の違う dutyId（大文字 UUID）は DynamoDB を読まずに 404', ({ Given, When, Then }) => {
    Given('太郎が大文字の UUID の dutyId を呼ぶ', () => {
      // 何も置かない
    });
    When('太郎がその dutyId を POST /record で version 1 で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(FAKE_UPPERCASE_UUID), { version: 1 });
    });
    Then('404 NOT_FOUND が返り、Calendar を読まない', () => {
      expect(result.statusCode).toBe(404);
      expect(body().error?.reason).toBe('NOT_FOUND');
      const calendarReads = world.hooks.readLog.filter((e) => e.table === CALENDAR_TABLE);
      expect(calendarReads).toHaveLength(0);
    });
  });

  Scenario('本文なしは 422 INVALID_REQUEST', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎が POST /record を本文なしで呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID));
    });
    Then('422 INVALID_REQUEST が返る', () => {
      expect(result.statusCode).toBe(422);
      expect(body().error?.reason).toBe('INVALID_REQUEST');
    });
  });

  Scenario('version が文字列や負の数は 422 INVALID_REQUEST', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎が POST /record を負の version で呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: -1 });
    });
    Then('422 INVALID_REQUEST が返る', () => {
      expect(result.statusCode).toBe(422);
      expect(body().error?.reason).toBe('INVALID_REQUEST');
    });
  });

  Scenario('余分な項目を付けても、書かれる値は裏側のもの', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎が POST /record に version と余分な unitPrice・recordedBy を付けて呼ぶ', async () => {
      result = await callAs('taro', 'POST', recordPath(DUTY_ID), {
        version: 1,
        unitPrice: 99999,
        recordedBy: childId('hanako'),
      });
    });
    Then('200 で unitPrice=100・recordedBy=太郎 が返る（本文の値は無視される）', () => {
      expect(result.statusCode).toBe(200);
      expect(body().unitPrice).toBe(100);
      expect(body().recordedBy).toBe(childId('taro'));
      expect(dishesRow()?.unitPrice).toBe(100);
      expect(dishesRow()?.recordedBy).toBe(childId('taro'));
    });
  });

  Scenario(
    '取引の直前に「×」にされると読み直して 409 DUTY_SKIPPED_BY_ADMIN',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）があり、取引の直前に「×」にされる', () => {
        seedDishes();
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
      When('太郎が POST /record を version 1 で呼ぶ', async () => {
        result = await callAs('taro', 'POST', recordPath(DUTY_ID), { version: 1 });
      });
      Then('409 DUTY_SKIPPED_BY_ADMIN が返り、担当は「×」のまま', () => {
        expect(result.statusCode).toBe(409);
        expect(body().error?.reason).toBe('DUTY_SKIPPED_BY_ADMIN');
        expect(dishesRow()?.status).toBe('skipped');
      });
    },
  );
});
