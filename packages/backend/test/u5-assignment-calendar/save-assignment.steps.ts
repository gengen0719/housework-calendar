import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { MonthCalendar } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { handler } from '../../src/entries/api';
import {
  FAKE_ADMIN_USER_ID,
  FAKE_CHANGES_HASH_MALFORMED,
  FAKE_OTHER_CHORE_TYPE_ID,
  FAKE_OTHER_FAMILY_ID,
  FAKE_UPPERCASE_UUID,
} from '../fixtures/fakeSecrets';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { apiRequest, setNow } from '../u1-skeleton-family/helpers/world';
import { bodyOf, FAMILY_ID, FAMILY_CREATED_AT } from '../u2-invitation/helpers/seed';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import {
  CHILDREN,
  CHORES,
  dutyItems,
  seedAssignment,
  seedDuty,
  seedMonthState,
  seedOutsideChild,
  sessionForUser,
  PEOPLE,
  userIdOf,
} from './helpers/seed';
import {
  beginScenario,
  dutyLines,
  endScenario,
  errorOf,
  expectRefsMatchDuties,
  MONDAY,
  NOON,
  responseDutyLines,
  rule,
  saveAs,
  savePath,
  seedToday,
  sendBody,
  storedAssignment,
  THURSDAY,
  TUESDAY,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/save-assignment.feature',
);

const FRIDAY = 5;
const GIVEN_HOUSEHOLD_JAN13 =
  '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つある';

let state: ScenarioState;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let secondResponse: APIGatewayProxyStructuredResultV2;
let transactionsAfterFirst = 0;

const seedJan13 = (): void => seedToday(state, NOON.jan13);

const dishesTaro = (days: number[]) => [rule('dishes', 'taro', days)];

const expectNothingStored = (): void => {
  expect(state.world.calendar.size).toBe(0);
};

/** 日付の行: 「皿洗い 太郎」の担当の「月-日」の並び */
const dishDates = (response_: APIGatewayProxyStructuredResultV2): string[] =>
  responseDutyLines(response_).map((line) => line.split(' ')[0] as string);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '今月の初めての保存で、月曜と木曜の担当が今日から月末まで作られる',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜と木曜で保存する', async () => {
        response = await saveAs('mother', '2027-01', dishesTaro([MONDAY, THURSDAY]));
      });
      Then('応答は 200 で、担当は 1月14日・18日・21日・25日・28日の 5 つになる', () => {
        expect(response.statusCode).toBe(200);
        expect(dishDates(response)).toEqual(['01-14', '01-18', '01-21', '01-25', '01-28']);
        const calendar = bodyOf<MonthCalendar>(response);
        expect(calendar).toMatchObject({
          month: '2027-01',
          hasAssignment: true,
          today: '2027-01-13',
        });
      });
      And(
        '担当はすべて「未」で origin は rule、version は 1、引き当てが担当と同じ数だけある',
        () => {
          expect(dutyLines(state.world)).toEqual(
            ['01-14', '01-18', '01-21', '01-25', '01-28'].map(
              (date) => `${date} 皿洗い 太郎 todo rule v1`,
            ),
          );
          expectRefsMatchDuties(state.world);
        },
      );
      And('割り当てが保存され、過ぎた日（1月4日・7日・11日）の担当は作られていない', () => {
        const stored = storedAssignment(state.world, '2027-01');
        expect(stored).toMatchObject({ rules: dishesTaro([MONDAY, THURSDAY]), month: '2027-01' });
        expect((stored?.choreTypeIds as Set<string>).has(CHORES.dishes.choreTypeId)).toBe(true);
        const dates = dutyItems(state.world.calendar).map((d) => d.date);
        expect(dates).not.toContain('2027-01-04');
        expect(dates).not.toContain('2027-01-07');
        expect(dates).not.toContain('2027-01-11');
      });
    },
  );

  Scenario('来月の保存は 1 日から月末まで担当を作る', ({ Given, When, Then }) => {
    Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
    When('お母さんが 2027 年 2 月に、皿洗いを太郎の月曜と木曜で保存する', async () => {
      response = await saveAs('mother', '2027-02', dishesTaro([MONDAY, THURSDAY]));
    });
    Then('応答は 200 で、担当は 2月の月曜 4 日と木曜 4 日の 8 つになる', () => {
      expect(response.statusCode).toBe(200);
      expect(dishDates(response)).toEqual([
        '02-01',
        '02-04',
        '02-08',
        '02-11',
        '02-15',
        '02-18',
        '02-22',
        '02-25',
      ]);
    });
  });

  Scenario('12 月に保存する来月は翌年 1 月になる', ({ Given, When, Then }) => {
    Given(
      '今日は 2026 年 12 月 15 日（火）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つある',
      () => seedToday(state, NOON.dec15),
    );
    When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜と木曜で保存する', async () => {
      response = await saveAs('mother', '2027-01', dishesTaro([MONDAY, THURSDAY]));
    });
    Then('応答は 200 で、担当は 1月の月曜 4 日と木曜 4 日の 8 つになる', () => {
      expect(response.statusCode).toBe(200);
      expect(dishDates(response)).toEqual([
        '01-04',
        '01-07',
        '01-11',
        '01-14',
        '01-18',
        '01-21',
        '01-25',
        '01-28',
      ]);
    });
  });

  Scenario('保存し直しでは、明日以降の「未」だけが作り直される', ({ Given, When, Then, And }) => {
    const dishesChangeId = randomUUID();
    const laundryKeepId = randomUUID();
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いは太郎の月曜と木曜、洗濯物たたみは次郎の月曜の割り当てと担当がある',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [
          rule('dishes', 'taro', [MONDAY, THURSDAY]),
          rule('laundry', 'jiro', [MONDAY]),
        ]);
        const dishes = CHORES.dishes.choreTypeId;
        const taro = CHILDREN.taro.userId;
        const seed = (date: string, id: string, status: 'todo' | 'done' | 'skipped') =>
          seedDuty(state.world.calendar, {
            dutyId: id,
            date,
            choreTypeId: dishes,
            childUserId: taro,
            status,
          });
        seed('2027-01-11', randomUUID(), 'todo');
        seed('2027-01-14', randomUUID(), 'todo');
        seed('2027-01-18', dishesChangeId, 'todo');
        seed('2027-01-21', randomUUID(), 'todo');
        seed('2027-01-25', randomUUID(), 'done');
        seed('2027-01-28', randomUUID(), 'skipped');
        seedDuty(state.world.calendar, {
          dutyId: laundryKeepId,
          date: '2027-01-18',
          choreTypeId: CHORES.laundry.choreTypeId,
          childUserId: CHILDREN.jiro.userId,
          version: 3,
        });
      },
    );
    When(
      'お母さんが 1 月の割り当てを、皿洗いは花子の月曜、洗濯物たたみは次郎の月曜に保存し直す',
      async () => {
        response = await saveAs('mother', '2027-01', [
          rule('dishes', 'hanako', [MONDAY]),
          rule('laundry', 'jiro', [MONDAY]),
        ]);
      },
    );
    Then('応答は 200 で、今日と過ぎた日の担当、「済」「×」の担当は変わらない', () => {
      expect(response.statusCode).toBe(200);
      const lines = dutyLines(state.world);
      expect(lines).toContain('01-11 皿洗い 太郎 todo rule v1');
      expect(lines).toContain('01-14 皿洗い 太郎 todo rule v1');
      expect(lines).toContain('01-25 皿洗い 太郎 done rule v1');
      expect(lines).toContain('01-28 皿洗い 太郎 skipped rule v1');
    });
    And('月曜 18 日の皿洗いは同じ担当のまま花子に変わり、version が 2 になる', () => {
      expect(dutyLines(state.world)).toContain('01-18 皿洗い 花子 todo rule v2');
      const changed = dutyItems(state.world.calendar).find((d) => d.dutyId === dishesChangeId);
      expect(changed).toMatchObject({ date: '2027-01-18', childUserId: CHILDREN.hanako.userId });
    });
    And('木曜 21 日の皿洗いは消え、洗濯物たたみの 18 日は version も origin も変わらない', () => {
      expect(dutyLines(state.world).some((line) => line.startsWith('01-21'))).toBe(false);
      expect(dutyLines(state.world)).toContain('01-18 洗濯物たたみ 次郎 todo rule v3');
      const kept = dutyItems(state.world.calendar).find((d) => d.dutyId === laundryKeepId);
      expect(kept).toMatchObject({ version: 3, origin: 'rule' });
    });
    And('洗濯物たたみの月曜 25 日の担当が新しく作られ、引き当てが担当と同じ数だけある', () => {
      expect(dutyLines(state.world)).toContain('01-25 洗濯物たたみ 次郎 todo rule v1');
      expectRefsMatchDuties(state.world);
    });
  });

  Scenario(
    '行が 0 行の割り当ても保存でき、明日以降の「未」がなくなる',
    ({ Given, When, Then, And }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いは太郎の月曜と木曜の割り当てと、過ぎた日・明日以降の「未」・「済」の担当がある',
        () => {
          seedToday(state, NOON.jan14);
          seedAssignment(state.world.calendar, '2027-01', dishesTaro([MONDAY, THURSDAY]));
          const seed = (date: string, status: 'todo' | 'done') =>
            seedDuty(state.world.calendar, {
              dutyId: randomUUID(),
              date,
              choreTypeId: CHORES.dishes.choreTypeId,
              childUserId: CHILDREN.taro.userId,
              status,
            });
          seed('2027-01-11', 'todo');
          seed('2027-01-18', 'todo');
          seed('2027-01-21', 'todo');
          seed('2027-01-25', 'done');
        },
      );
      When('お母さんが 1 月の割り当てを 0 行で保存し直す', async () => {
        response = await saveAs('mother', '2027-01', []);
      });
      Then(
        '応答は 200 で、hasAssignment は true、残る担当は過ぎた日の「未」と「済」だけになる',
        () => {
          expect(response.statusCode).toBe(200);
          expect(bodyOf<MonthCalendar>(response).hasAssignment).toBe(true);
          expect(dutyLines(state.world)).toEqual([
            '01-11 皿洗い 太郎 todo rule v1',
            '01-25 皿洗い 太郎 done rule v1',
          ]);
          expectRefsMatchDuties(state.world);
        },
      );
      And('割り当ては行が 0 行で保存され、使う種類の集合の項目はない', () => {
        const stored = storedAssignment(state.world, '2027-01');
        expect(stored?.rules).toEqual([]);
        expect(stored).not.toHaveProperty('choreTypeIds');
      });
    },
  );

  Scenario('日本時間の 0 時の前後で、作る範囲が変わる', ({ Given, When, Then, And }) => {
    Given(
      '山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、今日は 2027 年 1 月 12 日（火）の 23 時 59 分 59 秒',
      () => seedToday(state, '2027-01-12T14:59:59.999Z'),
    );
    When('お母さんが 2027 年 1 月に、皿洗いを太郎の火曜で保存する', async () => {
      response = await saveAs('mother', '2027-01', dishesTaro([TUESDAY]));
    });
    Then('担当は 1月12日・19日・26日の 3 つになる', () => {
      expect(dishDates(response)).toEqual(['01-12', '01-19', '01-26']);
    });
    And(
      '日本時間で 1 月 13 日の 0 時（UTC の 15 時）に、記録を消して同じ内容を保存すると、担当は 1月19日・26日の 2 つになる',
      async () => {
        state.world.calendar.clear();
        setNow('2027-01-12T15:00:00.000Z');
        response = await saveAs('mother', '2027-01', dishesTaro([TUESDAY]));
        expect(response.statusCode).toBe(200);
        expect(dishDates(response)).toEqual(['01-19', '01-26']);
      },
    );
  });

  Scenario(
    '同じ日の同じお手伝いに 2 人入る割り当ては、重なりをすべて出して保存しない',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When('お母さんが 1 月に、皿洗いを太郎の月曜と木曜、花子の木曜と金曜で保存する', async () => {
        response = await saveAs('mother', '2027-01', [
          rule('dishes', 'taro', [MONDAY, THURSDAY]),
          rule('dishes', 'hanako', [THURSDAY, FRIDAY]),
        ]);
      });
      Then(
        '応答は 422 で理由は ASSIGNMENT_OVERLAP、重なりは過ぎた日を含む木曜の 4 日分すべて並ぶ',
        () => {
          expect(response.statusCode).toBe(422);
          const error = errorOf(response);
          expect(error.reason).toBe('ASSIGNMENT_OVERLAP');
          const overlaps = error.details?.overlaps as {
            date: string;
            weekday: number;
            choreTypeId: string;
            childUserIds: string[];
          }[];
          expect(overlaps.map((o) => o.date)).toEqual([
            '2027-01-07',
            '2027-01-14',
            '2027-01-21',
            '2027-01-28',
          ]);
          expect(overlaps[0]).toEqual({
            date: '2027-01-07',
            weekday: THURSDAY,
            choreTypeId: CHORES.dishes.choreTypeId,
            childUserIds: [CHILDREN.taro.userId, CHILDREN.hanako.userId].sort(),
          });
        },
      );
      And('何も保存されず、書き込みの取引も行われていない', () => {
        expectNothingStored();
        expect(state.world.hooks.transactionSizes).toEqual([]);
      });
    },
  );

  Scenario('確定した月は保存できない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、1 月は確定している',
      () => {
        seedJan13();
        seedMonthState(state.world.calendar, '2027-01', true);
      },
    );
    When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する', async () => {
      response = await saveAs('mother', '2027-01', dishesTaro([MONDAY]));
    });
    Then('応答は 409 で理由は MONTH_CONFIRMED、何も保存されていない', () => {
      expect(response.statusCode).toBe(409);
      expect(errorOf(response).reason).toBe('MONTH_CONFIRMED');
      expect(dutyItems(state.world.calendar)).toEqual([]);
      expect(storedAssignment(state.world, '2027-01')).toBeUndefined();
    });
  });

  Scenario(
    '今月でも来月でもない月は保存できず、確定した過去の月は 409 が先になる',
    ({ Given, When, Then, And }) => {
      Given(
        '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、前の年の 12 月は確定している',
        () => {
          seedJan13();
          seedMonthState(state.world.calendar, '2026-12', true);
        },
      );
      When(
        'お母さんが 2026 年 11 月・2027 年 3 月・確定した 2026 年 12 月に、皿洗いを太郎の月曜で保存する',
        async () => {
          for (const month of ['2026-11', '2027-03', '2026-12']) {
            responses.push(await saveAs('mother', month, dishesTaro([MONDAY])));
          }
        },
      );
      Then(
        '11 月と 3 月は 422 の MONTH_NOT_EDITABLE、確定した 12 月は 409 の MONTH_CONFIRMED になる',
        () => {
          expect(responses.map((r) => r.statusCode)).toEqual([422, 422, 409]);
          expect(responses.map((r) => errorOf(r).reason)).toEqual([
            'MONTH_NOT_EDITABLE',
            'MONTH_NOT_EDITABLE',
            'MONTH_CONFIRMED',
          ]);
        },
      );
      And('何も保存されていない', () => {
        expect(dutyItems(state.world.calendar)).toEqual([]);
      });
    },
  );

  Scenario('子供は保存できず、何も読まず何も変わらない', ({ Given, When, Then, And }) => {
    Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
    When('太郎が 2027 年 1 月に、皿洗いを太郎の月曜で保存しようとする', async () => {
      response = await saveAs('taro', '2027-01', dishesTaro([MONDAY]));
    });
    Then('応答は 403 で理由は ADMIN_ONLY', () => {
      expect(response.statusCode).toBe(403);
      expect(errorOf(response).reason).toBe('ADMIN_ONLY');
    });
    And('カレンダーと種類の表は読まれず、何も保存されていない', () => {
      const tablesRead = state.world.hooks.readLog.map((entry) => entry.table);
      expect(tablesRead).not.toContain(CALENDAR_TABLE);
      expect(tablesRead).not.toContain(CHORE_TYPES_TABLE);
      expect(state.world.calendar.size).toBe(0);
    });
  });

  Scenario('月の形が違うと 422 になる', ({ Given, When, Then }) => {
    Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
    When('お母さんが月の形の違う 5 つの月に保存しようとする', async () => {
      for (const month of ['2027-13', '2027-1', '0050-01', '2101-01', 'abc']) {
        responses.push(await saveAs('mother', month, dishesTaro([MONDAY])));
      }
    });
    Then('どれも 422 で理由は INVALID_MONTH になる', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([422, 422, 422, 422, 422]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(Array(5).fill('INVALID_MONTH'));
    });
  });

  Scenario('本文の形が違うと 422 INVALID_ASSIGNMENT になる', ({ Given, When, Then }) => {
    Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
    When(
      'お母さんが 201 行・曜日 8 個・曜日 7・種類 91 個・形の違う ID・大文字の ID・形の違う印・行なしの本文をそれぞれ保存しようとする',
      async () => {
        const valid = rule('dishes', 'taro', [MONDAY]);
        const bodies: unknown[] = [
          { rules: Array.from({ length: 201 }, () => valid) },
          { rules: [{ ...valid, weekdays: [0, 1, 2, 3, 4, 5, 6, 0] }] },
          { rules: [{ ...valid, weekdays: [7] }] },
          { rules: Array.from({ length: 91 }, () => ({ ...valid, choreTypeId: randomUUID() })) },
          { rules: [{ ...valid, childUserId: 'not-a-uuid' }] },
          { rules: [{ ...valid, choreTypeId: FAKE_UPPERCASE_UUID }] },
          { rules: [valid], confirmedChangesHash: FAKE_CHANGES_HASH_MALFORMED },
          {},
        ];
        for (const body of bodies) responses.push(await sendBody('mother', '2027-01', body));
      },
    );
    Then('どれも 422 で理由は INVALID_ASSIGNMENT になり、何も保存されていない', () => {
      expect(responses).toHaveLength(8);
      expect(responses.map((r) => r.statusCode)).toEqual(Array(8).fill(422));
      expect(responses.map((r) => errorOf(r).reason)).toEqual(Array(8).fill('INVALID_ASSIGNMENT'));
      expectNothingStored();
    });
  });

  Scenario(
    '本文が 64 KB を超えると 413 で、知らない項目は捨てられる',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When('お母さんが 64 KB を超える本文を普通の形と Base64 の形で送る', async () => {
        const padding = 'x'.repeat(70000);
        responses.push(
          await sendBody('mother', '2027-01', { rules: dishesTaro([MONDAY]), padding }),
        );
        const base64 = apiRequest('PUT', savePath('2027-01'), {
          token: sessionForUser(userIdOf('mother')),
          body: { rules: dishesTaro([MONDAY]), padding },
        });
        responses.push(
          (await handler({
            ...base64,
            body: Buffer.from(String(base64.body), 'utf8').toString('base64'),
            isBase64Encoded: true,
          })) as APIGatewayProxyStructuredResultV2,
        );
      });
      Then('どちらも 413 で理由は PAYLOAD_TOO_LARGE、何も保存されていない', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([413, 413]);
        expect(responses.map((r) => errorOf(r).reason)).toEqual(Array(2).fill('PAYLOAD_TOO_LARGE'));
        expectNothingStored();
      });
      And(
        '知らない項目（家族の ID と version）を付けた普通の本文は 200 で、それらは読まれない',
        async () => {
          response = await sendBody('mother', '2027-01', {
            rules: [{ ...dishesTaro([MONDAY])[0], version: 9 }],
            familyId: FAKE_OTHER_FAMILY_ID,
            version: 9,
          });
          expect(response.statusCode).toBe(200);
          expect(dutyItems(state.world.calendar).every((d) => d.familyId === FAMILY_ID)).toBe(true);
          expect(storedAssignment(state.world, '2027-01')?.rules).toEqual(dishesTaro([MONDAY]));
        },
      );
    },
  );

  Scenario(
    '行の確かめの順番は、種類の 404、種類の使わない 422、子供の 404 で、行の並びに左右されない',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、「使わない」種類とほかの家族の種類・子供もある',
        () => {
          seedJan13();
          seedChoreType(state.world.choreTypes, {
            choreTypeId: FAKE_OTHER_CHORE_TYPE_ID,
            name: 'ほかの家のお手伝い',
            familyId: FAKE_OTHER_FAMILY_ID,
          });
          seedOutsideChild(state.world.users, FAKE_OTHER_FAMILY_ID, 'jiro');
        },
      );
      When(
        'お母さんが「使わない」種類の行とほかの家族の種類の行、「使わない」種類の行とほかの家族の子供の行を、それぞれ順番を入れ替えて保存しようとする',
        async () => {
          const inactive = rule('bath', 'taro', [MONDAY]);
          const otherType = {
            choreTypeId: FAKE_OTHER_CHORE_TYPE_ID,
            childUserId: CHILDREN.taro.userId,
            weekdays: [MONDAY],
          };
          const otherChild = rule('dishes', 'jiro', [MONDAY]);
          for (const rows of [
            [inactive, otherType],
            [otherType, inactive],
            [inactive, otherChild],
            [otherChild, inactive],
          ]) {
            responses.push(await saveAs('mother', '2027-01', rows));
          }
        },
      );
      Then(
        '種類が見つからない組はどちらの順でも 404、「使わない」種類と他の家族の子供の組はどちらの順でも 422 の CHORE_TYPE_INACTIVE になる',
        () => {
          expect(responses.map((r) => r.statusCode)).toEqual([404, 404, 422, 422]);
          expect(errorOf(responses[0] as APIGatewayProxyStructuredResultV2).reason).toBe(
            'NOT_FOUND',
          );
          expect(errorOf(responses[2] as APIGatewayProxyStructuredResultV2).reason).toBe(
            'CHORE_TYPE_INACTIVE',
          );
          expect(responses[0]?.body).toBe(responses[1]?.body);
          expect(responses[2]?.body).toBe(responses[3]?.body);
          expect(dutyItems(state.world.calendar)).toEqual([]);
        },
      );
    },
  );

  Scenario('ほかの家族の子供と管理者の ID は 404 になる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、次郎はほかの家族の子供で、もう 1 人の管理者もいる',
      () => {
        seedJan13();
        seedOutsideChild(state.world.users, FAKE_OTHER_FAMILY_ID, 'jiro');
        state.world.users.set(FAKE_ADMIN_USER_ID, {
          userId: FAKE_ADMIN_USER_ID,
          lineUserId: 'U_second_admin',
          displayName: '管理者2',
          friendStatus: 'friend',
          familyId: FAMILY_ID,
          role: 'admin',
          registeredAt: FAMILY_CREATED_AT,
          friendStatusChangedAt: FAMILY_CREATED_AT,
        });
      },
    );
    When(
      'お母さんがほかの家族の子供の行、もう 1 人の管理者の行をそれぞれ保存しようとする',
      async () => {
        responses.push(await saveAs('mother', '2027-01', dishesTaroOf(CHILDREN.jiro.userId)));
        responses.push(await saveAs('mother', '2027-01', dishesTaroOf(FAKE_ADMIN_USER_ID)));
      },
    );
    Then('どちらも 404 で、何も保存されていない', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([404, 404]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
      expectNothingStored();
    });
  });

  Scenario('参加した直後の子供は、索引に出ていなくても割り当てられる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 13 日（水）で、山田家に管理者のお母さんと子供 3 人、「使う」種類が 3 つあり、太郎は参加した直後で索引に出ていない',
      () => {
        seedJan13();
        state.world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
      },
    );
    When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する', async () => {
      response = await saveAs('mother', '2027-01', dishesTaro([MONDAY]));
    });
    Then('応答は 200 で、担当は太郎の 1月18日・25日になり、応答の子供に太郎が入っている', () => {
      expect(response.statusCode).toBe(200);
      expect(responseDutyLines(response)).toEqual(['01-18 皿洗い 太郎', '01-25 皿洗い 太郎']);
      expect(bodyOf<MonthCalendar>(response).children).toContainEqual({
        userId: CHILDREN.taro.userId,
        displayName: '太郎',
      });
    });
  });

  Scenario(
    '同じ種類と子供の行は 1 行にまとまり、曜日の重なりは 1 つになる',
    ({ Given, When, Then }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When(
        'お母さんが 1 月に、皿洗いを太郎の月曜、皿洗いを太郎の木曜と月曜で保存する',
        async () => {
          response = await saveAs('mother', '2027-01', [
            rule('dishes', 'taro', [MONDAY]),
            rule('dishes', 'taro', [THURSDAY, MONDAY, MONDAY]),
          ]);
        },
      );
      Then('割り当ては皿洗い・太郎の月曜と木曜の 1 行で保存され、担当は 5 つになる', () => {
        expect(response.statusCode).toBe(200);
        expect(storedAssignment(state.world, '2027-01')?.rules).toEqual(
          dishesTaro([MONDAY, THURSDAY]),
        );
        expect(dutyItems(state.world.calendar)).toHaveLength(5);
      });
    },
  );

  Scenario(
    '同じ内容を 2 回続けて保存すると、2 回目は何も書かず同じ結果になる',
    ({ Given, When, Then }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜と木曜で 2 回続けて保存する', async () => {
        response = await saveAs('mother', '2027-01', dishesTaro([MONDAY, THURSDAY]));
        transactionsAfterFirst = state.world.hooks.transactionSizes.length;
        secondResponse = await saveAs('mother', '2027-01', dishesTaro([MONDAY, THURSDAY]));
      });
      Then('2 回目は書き込みの取引が増えず、応答は 1 回目と同じになる', () => {
        expect(response.statusCode).toBe(200);
        expect(secondResponse.statusCode).toBe(200);
        expect(transactionsAfterFirst).toBeGreaterThan(0);
        expect(state.world.hooks.transactionSizes).toHaveLength(transactionsAfterFirst);
        expect(bodyOf(secondResponse)).toEqual(bodyOf(response));
      });
    },
  );

  Scenario(
    '保存のログに件数が出て、種類の名前と子供の表示名は出ない',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_HOUSEHOLD_JAN13, seedJan13);
      When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜と木曜で保存する', async () => {
        response = await saveAs('mother', '2027-01', dishesTaro([MONDAY, THURSDAY]));
      });
      Then(
        'ログに ASSIGNMENT_SAVED が出て dutyCount は 5、REQUEST_END にも dutyCount が付く',
        () => {
          expect(response.statusCode).toBe(200);
          const saved = state.logs.find((line) => line.event === 'ASSIGNMENT_SAVED');
          expect(saved).toMatchObject({ dutyCount: 5, created: 5, month: '2027-01' });
          const end = state.logs.find(
            (line) => line.event === 'REQUEST_END' && line.path === '/v1/months/:month/assignment',
          );
          expect(end).toMatchObject({ dutyCount: 5 });
          expect(typeof end?.coldStart).toBe('boolean');
        },
      );
      And('ログのどこにも皿洗いと太郎の名前は出ていない', () => {
        const text = JSON.stringify(state.logs);
        expect(text).not.toContain('皿洗い');
        expect(text).not.toContain('太郎');
        expect(text).not.toContain(PEOPLE.mother.displayName);
      });
    },
  );
});

/** 皿洗いを、指定した子供 ID の月曜に割り当てる行（ほかの家族の子供や管理者の ID を試す用） */
function dishesTaroOf(childUserId: string) {
  return [{ choreTypeId: CHORES.dishes.choreTypeId, childUserId, weekdays: [MONDAY] }];
}
