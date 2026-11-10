import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import type { Duty } from '@housework/shared';
import { handler } from '../../src/entries/api';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { apiRequest, resetNow, setNow, setupWorld } from '../u1-skeleton-family/helpers/world';
import { PEOPLE, seedUser } from '../u2-invitation/helpers/seed';
import { callAs } from '../u5-assignment-calendar/helpers/seed';
import { callAsUserId } from '../u5-assignment-calendar/helpers/scenario';
import {
  FAKE_OTHER_FAMILY_ID,
  FAKE_U7_DUTY_ID_A,
  FAKE_U7_EMPTY_MONTH,
  FAKE_U7_NONEXISTENT_DUTY_ID,
  FAKE_UPPERCASE_UUID,
} from '../fixtures/fakeSecrets';
import {
  adminId,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedSkippedDuty,
  setUnitPrice,
  storedDuty,
  storedMonthState,
  MONTH,
} from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u7-review-confirm/status-api.feature');

type World = ReturnType<typeof setupWorld>;
type Result = APIGatewayProxyStructuredResultV2;

const DATE = '2027-01-05';
const DUTY_ID = FAKE_U7_DUTY_ID_A;
const statusPath = (dutyId: string): string => `/v1/duties/${dutyId}/status`;
const confirmPath = (month: string): string => `/v1/months/${month}/confirmation`;
const RECORDED_AT = '2027-01-05T10:00:00.000Z';

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let result: Result;
  let results: Result[];

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    setNow('2027-01-07T11:00:00.000Z');
    seedHouseholdWithPrices(world);
    results = [];
  });
  AfterEachScenario(() => {
    resetNow();
    vi.restoreAllMocks();
  });

  const body = (): { error?: { reason: string } } & Partial<Duty> =>
    JSON.parse(String(result.body ?? '{}'));
  const dishes = (): Record<string, unknown> | undefined =>
    storedDuty(world.calendar, DATE, choreId('dishes'));
  const seedStatus = (status: 'todo' | 'done' | 'skipped', version: number): void => {
    const base = {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version,
    };
    if (status === 'done') {
      seedDoneDuty(world.calendar, {
        ...base,
        recordedAt: RECORDED_AT,
        recordedBy: childId('taro'),
        unitPrice: 120,
      });
    } else if (status === 'skipped') seedSkippedDuty(world.calendar, base);
    else seedDuty(world.calendar, { ...base, status: 'todo' });
  };
  const send = (actor: 'mother' | 'taro', payload: unknown, dutyId = DUTY_ID): Promise<Result> =>
    callAs(actor, 'POST', statusPath(dutyId), payload);
  const reads = (table: string): number =>
    world.hooks.readLog.filter((entry) => entry.table === table).length;
  const noRecord = (): void => {
    const row = dishes();
    expect(row?.recordedAt).toBeUndefined();
    expect(row?.recordedBy).toBeUndefined();
    expect(row?.unitPrice).toBeUndefined();
  };

  Scenario('管理者が「未」を済にすると 200 で記録の 3 項目がそろう', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('お母さんが markDone を version 1 で送る', async () => {
      result = await send('mother', { action: 'markDone', version: 1 });
    });
    Then(
      '200 で status=done・recordedBy=お母さん・unitPrice=120・recordedByName=お母さん が返る',
      () => {
        expect(result.statusCode).toBe(200);
        expect(body().status).toBe('done');
        expect(body().recordedBy).toBe(adminId());
        expect(body().unitPrice).toBe(120);
        expect(body().recordedByName).toBe(PEOPLE.mother.displayName);
        expect(dishes()?.childUserId).toBe(childId('taro'));
      },
    );
  });

  Scenario('管理者が「済」を取り消すと 200 で記録が消える', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（済・version 2）がある', () => seedStatus('done', 2));
    When('お母さんが cancel を version 2 で送る', async () => {
      result = await send('mother', { action: 'cancel', version: 2 });
    });
    Then('200 で status=todo で、記録の 3 項目が空になる', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('todo');
      expect(body().recordedAt).toBeNull();
      noRecord();
    });
  });

  Scenario('管理者が「済」を「やらなかった」にすると 200', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（済・version 2）がある', () => seedStatus('done', 2));
    When('お母さんが markSkipped を version 2 で送る', async () => {
      result = await send('mother', { action: 'markSkipped', version: 2 });
    });
    Then('200 で status=skipped で、記録の 3 項目が空になる', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('skipped');
      noRecord();
    });
  });

  Scenario('管理者が「未」を「やらなかった」にすると 200', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('お母さんが markSkipped を version 1 で送る', async () => {
      result = await send('mother', { action: 'markSkipped', version: 1 });
    });
    Then('200 で status=skipped が返る', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('skipped');
    });
  });

  Scenario('管理者が「×」を外すと 200 で「未」に戻る', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（×・version 2）がある', () => seedStatus('skipped', 2));
    When('お母さんが unmarkSkipped を version 2 で送る', async () => {
      result = await send('mother', { action: 'unmarkSkipped', version: 2 });
    });
    Then('200 で status=todo が返る', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('todo');
    });
  });

  Scenario('管理者が「×」を済にすると 200', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（×・version 2）がある', () => seedStatus('skipped', 2));
    When('お母さんが markDone を version 2 で送る', async () => {
      result = await send('mother', { action: 'markDone', version: 2 });
    });
    Then('200 で status=done・unitPrice=120 が返る', () => {
      expect(result.statusCode).toBe(200);
      expect(body().status).toBe('done');
      expect(body().unitPrice).toBe(120);
    });
  });

  Scenario('セッションがなければ 401', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('セッションなしで status を送る', async () => {
      result = (await handler(
        apiRequest('POST', statusPath(DUTY_ID), { body: { action: 'markDone', version: 1 } }),
      )) as Result;
    });
    Then('401 が返り、担当は変わらない', () => {
      expect(result.statusCode).toBe(401);
      expect(dishes()?.status).toBe('todo');
    });
  });

  Scenario('家族に入っていない人は 403 NOT_FAMILY_MEMBER', ({ Given, When, Then }) => {
    Given('家族に入っていない人がいる', () => {
      seedUser(world.users, 'hanako');
    });
    When('その人が status を送る', async () => {
      world.hooks.readLog.length = 0;
      result = await callAsUserId(PEOPLE.hanako.userId, 'POST', statusPath(DUTY_ID), {
        action: 'markDone',
        version: 1,
      });
    });
    Then('403 NOT_FAMILY_MEMBER が返り、Calendar を読まない', () => {
      expect(result.statusCode).toBe(403);
      expect(body().error?.reason).toBe('NOT_FAMILY_MEMBER');
      expect(reads(CALENDAR_TABLE)).toBe(0);
    });
  });

  Scenario(
    '子供は 403 ADMIN_ONLY で Calendar も ChoreTypes も読まれない',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
      When('太郎が markDone を version 1 で送る', async () => {
        world.hooks.readLog.length = 0;
        result = await send('taro', { action: 'markDone', version: 1 });
      });
      Then('403 ADMIN_ONLY が返り、Calendar と ChoreTypes を 1 回も読まず担当は変わらない', () => {
        expect(result.statusCode).toBe(403);
        expect(body().error?.reason).toBe('ADMIN_ONLY');
        expect(reads(CALENDAR_TABLE)).toBe(0);
        expect(reads(CHORE_TYPES_TABLE)).toBe(0);
        expect(dishes()?.status).toBe('todo');
      });
    },
  );

  Scenario('本文の形が外れると担当を探す前に 422 INVALID_REQUEST', ({ Given, When, Then }) => {
    Given('家族にない dutyId がある', () => undefined);
    When('お母さんが action が不正な本文でその dutyId に送る', async () => {
      world.hooks.readLog.length = 0;
      result = await send('mother', { action: 'delete', version: 1 }, FAKE_U7_NONEXISTENT_DUTY_ID);
    });
    Then('422 INVALID_REQUEST が返り、Calendar を読まない', () => {
      expect(result.statusCode).toBe(422);
      expect(body().error?.reason).toBe('INVALID_REQUEST');
      expect(reads(CALENDAR_TABLE)).toBe(0);
    });
  });

  Scenario('version が欠ける・文字列・負・小数は 422 INVALID_REQUEST', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('お母さんが version が不正な本文を 4 とおり送る', async () => {
      const payloads = [
        { action: 'markDone' },
        { action: 'markDone', version: '1' },
        { action: 'markDone', version: -1 },
        { action: 'markDone', version: 1.5 },
      ];
      for (const payload of payloads) results.push(await send('mother', payload));
    });
    Then('すべて 422 INVALID_REQUEST で担当は変わらない', () => {
      expect(results).toHaveLength(4);
      for (const r of results) {
        expect(r.statusCode).toBe(422);
        expect(JSON.parse(String(r.body)).error.reason).toBe('INVALID_REQUEST');
      }
      expect(dishes()?.status).toBe('todo');
    });
  });

  Scenario('dutyId の形が違うと DynamoDB を読まずに 404', ({ Given, When, Then }) => {
    Given('大文字の UUID の dutyId がある', () => undefined);
    When('お母さんがその dutyId に正しい本文で送る', async () => {
      world.hooks.readLog.length = 0;
      result = await send('mother', { action: 'markDone', version: 1 }, FAKE_UPPERCASE_UUID);
    });
    Then('404 NOT_FOUND が返り、Calendar を読まない', () => {
      expect(result.statusCode).toBe(404);
      expect(body().error?.reason).toBe('NOT_FOUND');
      expect(reads(CALENDAR_TABLE)).toBe(0);
    });
  });

  Scenario('ほかの家族の dutyId は 404', ({ Given, When, Then }) => {
    Given('ほかの家族の担当がある', () => {
      seedDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: DATE,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        familyId: FAKE_OTHER_FAMILY_ID,
        version: 1,
      });
    });
    When('お母さんがその dutyId に正しい本文で送る', async () => {
      result = await send('mother', { action: 'markDone', version: 1 });
    });
    Then('404 NOT_FOUND が返り、その担当は変わらない', () => {
      expect(result.statusCode).toBe(404);
      expect(body().error?.reason).toBe('NOT_FOUND');
      const other = storedDuty(world.calendar, DATE, choreId('dishes'), FAKE_OTHER_FAMILY_ID);
      expect(other?.status).toBe('todo');
    });
  });

  Scenario('確定した月の担当は 409 MONTH_CONFIRMED', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（済・version 2）があり、その月が確定している', () => {
      seedStatus('done', 2);
      seedMonthState(world.calendar, { month: MONTH, confirmed: true });
    });
    When('お母さんが cancel を version 2 で送る', async () => {
      result = await send('mother', { action: 'cancel', version: 2 });
    });
    Then('409 MONTH_CONFIRMED が返り、担当は変わらない', () => {
      expect(result.statusCode).toBe(409);
      expect(body().error?.reason).toBe('MONTH_CONFIRMED');
      expect(dishes()?.status).toBe('done');
    });
  });

  Scenario('表にない組は 409 INVALID_TRANSITION', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('お母さんが cancel を version 1 で送る', async () => {
      result = await send('mother', { action: 'cancel', version: 1 });
    });
    Then('409 INVALID_TRANSITION が返り、担当は変わらない', () => {
      expect(result.statusCode).toBe(409);
      expect(body().error?.reason).toBe('INVALID_TRANSITION');
      expect(dishes()?.status).toBe('todo');
    });
  });

  Scenario(
    '古い version で送ると 409 INVALID_TRANSITION で担当は変わらない',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い（未・version 2）がある', () => seedStatus('todo', 2));
      When('お母さんが markDone を古い version 1 で送る', async () => {
        result = await send('mother', { action: 'markDone', version: 1 });
      });
      Then('409 INVALID_TRANSITION が返り、担当は未・version 2 のまま', () => {
        expect(result.statusCode).toBe(409);
        expect(body().error?.reason).toBe('INVALID_TRANSITION');
        expect(dishes()).toMatchObject({ status: 'todo', version: 2 });
      });
    },
  );

  Scenario('余分な項目を付けても、書かれる値は裏側のもの', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）がある', () => seedStatus('todo', 1));
    When('お母さんが markDone に unitPrice・recordedBy・status を付けて送る', async () => {
      result = await send('mother', {
        action: 'markDone',
        version: 1,
        unitPrice: 99999,
        recordedBy: childId('hanako'),
        status: 'skipped',
      });
    });
    Then('200 で unitPrice=120・recordedBy=お母さん で、書かれた値も同じ', () => {
      expect(result.statusCode).toBe(200);
      expect(body().unitPrice).toBe(120);
      expect(body().recordedBy).toBe(adminId());
      expect(dishes()?.unitPrice).toBe(120);
      expect(dishes()?.recordedBy).toBe(adminId());
      expect(dishes()?.status).toBe('done');
    });
  });

  Scenario('取引の直前に単価が変わると新しい単価で書き直す', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）があり、取引の直前に単価が 150 円になる', () => {
      seedStatus('todo', 1);
      world.hooks.beforeTransaction(1, () => {
        setUnitPrice(world.choreTypes, choreId('dishes'), 150);
      });
    });
    When('お母さんが markDone を version 1 で送る', async () => {
      result = await send('mother', { action: 'markDone', version: 1 });
    });
    Then('200 で unitPrice=150 が返る', () => {
      expect(result.statusCode).toBe(200);
      expect(body().unitPrice).toBe(150);
      expect(dishes()?.unitPrice).toBe(150);
    });
  });

  Scenario('競合が 2 回続くと 500 INTERNAL', ({ Given, When, Then }) => {
    Given('太郎の皿洗い（未・version 1）があり、取引が 2 回続けて競合で断られる', () => {
      seedStatus('todo', 1);
      world.hooks.failTransaction(1, 'TransactionConflict');
      world.hooks.failTransaction(2, 'TransactionConflict');
    });
    When('お母さんが markDone を version 1 で送る', async () => {
      result = await send('mother', { action: 'markDone', version: 1 });
    });
    Then('500 INTERNAL が返り、担当は変わらない', () => {
      expect(result.statusCode).toBe(500);
      expect(body().error?.reason).toBe('INTERNAL');
      expect(dishes()?.status).toBe('todo');
    });
  });

  Scenario('管理者が月を確定すると 200 で確定行ができる', ({ Given, When, Then }) => {
    Given('2027-01 に担当があり、確定していない', () => seedStatus('todo', 1));
    When('お母さんが PUT confirmation を送る', async () => {
      result = await callAs('mother', 'PUT', confirmPath(MONTH));
    });
    Then('200 で月の状態が confirmed=true・confirmedByUserId=お母さん になる', () => {
      expect(result.statusCode).toBe(200);
      const state = storedMonthState(world.calendar, MONTH);
      expect(state?.confirmed).toBe(true);
      expect(state?.confirmedByUserId).toBe(adminId());
    });
  });

  Scenario('記録のない月の確定でも 200 で version 1 の確定行ができる', ({ Given, When, Then }) => {
    Given('記録のない月がある', () => undefined);
    When('お母さんが記録のない月に PUT confirmation を送る', async () => {
      result = await callAs('mother', 'PUT', confirmPath(FAKE_U7_EMPTY_MONTH));
    });
    Then('200 で version=1 の確定行ができる', () => {
      expect(result.statusCode).toBe(200);
      const state = storedMonthState(world.calendar, FAKE_U7_EMPTY_MONTH);
      expect(state?.confirmed).toBe(true);
      expect(state?.version).toBe(1);
    });
  });

  Scenario('すでに確定済みの月の確定も 200（冪等）', ({ Given, When, Then }) => {
    Given('2027-01 は確定済みである', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: true, version: 1 });
    });
    When('お母さんが PUT confirmation を 2 回送る', async () => {
      results.push(await callAs('mother', 'PUT', confirmPath(MONTH)));
      results.push(await callAs('mother', 'PUT', confirmPath(MONTH)));
    });
    Then('どちらも 200 で確定したまま', () => {
      expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(storedMonthState(world.calendar, MONTH)?.confirmed).toBe(true);
    });
  });

  Scenario('子供は確定できず 403 ADMIN_ONLY', ({ Given, When, Then }) => {
    Given('2027-01 に担当があり、確定していない', () => seedStatus('todo', 1));
    When('太郎が PUT confirmation を送る', async () => {
      world.hooks.readLog.length = 0;
      result = await callAs('taro', 'PUT', confirmPath(MONTH));
    });
    Then('403 ADMIN_ONLY が返り、Calendar を読まず確定しない', () => {
      expect(result.statusCode).toBe(403);
      expect(body().error?.reason).toBe('ADMIN_ONLY');
      expect(reads(CALENDAR_TABLE)).toBe(0);
      expect(storedMonthState(world.calendar, MONTH)).toBeUndefined();
    });
  });

  Scenario('家族外と認証なしの PUT confirmation', ({ Given, When, Then }) => {
    Given('家族に入っていない人がいる', () => {
      seedUser(world.users, 'hanako');
    });
    When('その人とセッションなしで PUT confirmation を送る', async () => {
      results.push(await callAsUserId(PEOPLE.hanako.userId, 'PUT', confirmPath(MONTH)));
      results.push((await handler(apiRequest('PUT', confirmPath(MONTH)))) as Result);
    });
    Then('403 NOT_FAMILY_MEMBER と 401 が返る', () => {
      expect(results.map((r) => r.statusCode)).toEqual([403, 401]);
      expect(JSON.parse(String(results[0]?.body)).error.reason).toBe('NOT_FAMILY_MEMBER');
    });
  });

  Scenario(
    'month の形が外れると DynamoDB を読まずに 422 INVALID_MONTH',
    ({ Given, When, Then }) => {
      Given('何も置かない', () => undefined);
      When('お母さんが不正な月に PUT confirmation を送る', async () => {
        world.hooks.readLog.length = 0;
        for (const month of ['2027-13', '2027', 'abc']) {
          results.push(await callAs('mother', 'PUT', confirmPath(month), { ignored: true }));
        }
      });
      Then('3 とおりすべて 422 INVALID_MONTH で、Calendar を読まない', () => {
        for (const r of results) {
          expect(r.statusCode).toBe(422);
          expect(JSON.parse(String(r.body)).error.reason).toBe('INVALID_MONTH');
        }
        expect(reads(CALENDAR_TABLE)).toBe(0);
      });
    },
  );

  Scenario('確定はほかの家族の月に触れない', ({ Given, When, Then }) => {
    Given('ほかの家族の 2027-01 は確定していない', () => {
      seedMonthState(world.calendar, {
        month: MONTH,
        confirmed: false,
        familyId: FAKE_OTHER_FAMILY_ID,
      });
    });
    When('お母さんが PUT confirmation を送る', async () => {
      result = await callAs('mother', 'PUT', confirmPath(MONTH));
    });
    Then('自分の家族の月だけが確定し、ほかの家族の月は変わらない', () => {
      expect(result.statusCode).toBe(200);
      expect(storedMonthState(world.calendar, MONTH)?.confirmed).toBe(true);
      expect(storedMonthState(world.calendar, MONTH, FAKE_OTHER_FAMILY_ID)?.confirmed).toBe(false);
    });
  });

  Scenario('管理者が確定を取り消すと 200', ({ Given, When, Then }) => {
    Given('2027-01 は確定済みである', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: true, version: 1 });
    });
    When('お母さんが DELETE confirmation を送る', async () => {
      result = await callAs('mother', 'DELETE', confirmPath(MONTH));
    });
    Then('200 で confirmed=false になり、confirmedAt と confirmedByUserId が消える', () => {
      expect(result.statusCode).toBe(200);
      const state = storedMonthState(world.calendar, MONTH);
      expect(state?.confirmed).toBe(false);
      expect(state?.confirmedAt).toBeUndefined();
      expect(state?.confirmedByUserId).toBeUndefined();
    });
  });

  Scenario('確定していない月の取り消しも 200（冪等）', ({ Given, When, Then }) => {
    Given('2027-01 は確定していない行がある', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: false, version: 1 });
    });
    When('お母さんが DELETE confirmation を送る', async () => {
      result = await callAs('mother', 'DELETE', confirmPath(MONTH));
    });
    Then('200 で confirmed=false のまま', () => {
      expect(result.statusCode).toBe(200);
      expect(storedMonthState(world.calendar, MONTH)?.confirmed).toBe(false);
    });
  });

  Scenario('記録のない月の取り消しは行を作らず 200', ({ Given, When, Then }) => {
    Given('記録のない月がある', () => undefined);
    When('お母さんが記録のない月に DELETE confirmation を送る', async () => {
      result = await callAs('mother', 'DELETE', confirmPath(FAKE_U7_EMPTY_MONTH));
    });
    Then('200 で月の状態の行は作られない', () => {
      expect(result.statusCode).toBe(200);
      expect(storedMonthState(world.calendar, FAKE_U7_EMPTY_MONTH)).toBeUndefined();
    });
  });

  Scenario('子供は取り消せず、month の形が外れると 422', ({ Given, When, Then }) => {
    Given('2027-01 は確定済みである', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: true, version: 1 });
    });
    When('太郎が DELETE confirmation を送り、お母さんが不正な月に送る', async () => {
      results.push(await callAs('taro', 'DELETE', confirmPath(MONTH)));
      results.push(await callAs('mother', 'DELETE', confirmPath('2027-13')));
    });
    Then('403 ADMIN_ONLY と 422 INVALID_MONTH が返り、確定は変わらない', () => {
      expect(results.map((r) => r.statusCode)).toEqual([403, 422]);
      expect(JSON.parse(String(results[0]?.body)).error.reason).toBe('ADMIN_ONLY');
      expect(JSON.parse(String(results[1]?.body)).error.reason).toBe('INVALID_MONTH');
      expect(storedMonthState(world.calendar, MONTH)?.confirmed).toBe(true);
    });
  });
});
