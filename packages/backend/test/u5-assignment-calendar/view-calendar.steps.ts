import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { AssignmentView, MonthCalendar } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { FAKE_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
import { bodyOf, PEOPLE, seedUser } from '../u2-invitation/helpers/seed';
import {
  callAs,
  CHILDREN,
  CHORES,
  seedAssignment,
  seedDuty,
  seedMonthState,
  type ChildKey,
  type ChoreKey,
} from './helpers/seed';
import {
  beginScenario,
  calendarPath,
  calendarReads,
  callAsUserId,
  endScenario,
  errorOf,
  NOON,
  responseDutyLines,
  rule,
  saveAs,
  seedToday,
  MONDAY,
  THURSDAY,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/view-calendar.feature',
);

const GIVEN_JAN14 =
  '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日と 18 日、洗濯物たたみが 21 日にある';

let state: ScenarioState;
let response: APIGatewayProxyStructuredResultV2;
let second: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let readCounts: { queries: number; gets: number }[];

function addDuty(
  date: string,
  chore: ChoreKey,
  child: ChildKey,
  options: Partial<Parameters<typeof seedDuty>[1]> = {},
): void {
  seedDuty(state.world.calendar, {
    dutyId: randomUUID(),
    date,
    choreTypeId: CHORES[chore].choreTypeId,
    childUserId: CHILDREN[child].userId,
    ...options,
  });
}

/** 今日を 1 月 14 日にして、1 月の割り当てと担当 3 件を置く */
function seedJan14(): void {
  seedToday(state, NOON.jan14);
  seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [MONDAY, THURSDAY])]);
  addDuty('2027-01-14', 'dishes', 'taro');
  addDuty('2027-01-18', 'dishes', 'taro');
  addDuty('2027-01-21', 'laundry', 'hanako');
}

const open = (actor: 'mother' | ChildKey, month: string) =>
  callAs(actor, 'GET', calendarPath(month));

function countReads(): { queries: number; gets: number } {
  const reads = calendarReads(state.world);
  return {
    queries: reads.filter((entry) => entry.operation === 'Query').length,
    gets: reads.filter((entry) => entry.operation === 'Get').length,
  };
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
    readCounts = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '子供が保存した月のカレンダーを開くと、担当が日ごとに並ぶ',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_JAN14, seedJan14);
      When('次郎が 2027 年 1 月のカレンダーを開く', async () => {
        response = await open('jiro', '2027-01');
      });
      Then(
        '応答は 200 で、担当は日付の順に 14 日の皿洗い、18 日の皿洗い、21 日の洗濯物たたみの 3 件になる',
        () => {
          expect(response.statusCode).toBe(200);
          expect(responseDutyLines(response)).toEqual([
            '01-14 皿洗い 太郎',
            '01-18 皿洗い 太郎',
            '01-21 洗濯物たたみ 花子',
          ]);
        },
      );
      And('月は 2027-01、今日は 2027-01-14、割り当てはある、確定していない', () => {
        expect(bodyOf<MonthCalendar>(response)).toMatchObject({
          month: '2027-01',
          today: '2027-01-14',
          hasAssignment: true,
          confirmed: false,
        });
      });
    },
  );

  Scenario('割り当てがない月は、割り当てなしで担当は空になる', ({ Given, When, Then }) => {
    Given(GIVEN_JAN14, seedJan14);
    When('お母さんが 2027 年 2 月のカレンダーを開く', async () => {
      response = await open('mother', '2027-02');
    });
    Then('応答は 200 で、割り当てはなし、担当は空になる', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<MonthCalendar>(response)).toMatchObject({
        month: '2027-02',
        hasAssignment: false,
        duties: [],
      });
    });
  });

  Scenario(
    '行が 0 行の割り当てを保存した月は、割り当てはあるが担当は空になる',
    ({ Given, When, Then }) => {
      Given(GIVEN_JAN14, seedJan14);
      When(
        'お母さんが 2027 年 2 月に行が 0 行の割り当てを保存して、2027 年 2 月のカレンダーを開く',
        async () => {
          second = await saveAs('mother', '2027-02', []);
          response = await open('mother', '2027-02');
        },
      );
      Then('応答は 200 で、割り当てはある、担当は空になる', () => {
        expect(second.statusCode).toBe(200);
        expect(response.statusCode).toBe(200);
        expect(bodyOf<MonthCalendar>(response)).toMatchObject({ hasAssignment: true, duties: [] });
      });
    },
  );

  Scenario('確定した月は、確定済みとして返る', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日と 18 日、洗濯物たたみが 21 日にあり、1 月は確定している',
      () => {
        seedJan14();
        seedMonthState(state.world.calendar, '2027-01', true);
      },
    );
    When('太郎が 2027 年 1 月のカレンダーを開く', async () => {
      response = await open('taro', '2027-01');
    });
    Then('応答は 200 で、確定済みになる', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<MonthCalendar>(response).confirmed).toBe(true);
    });
  });

  Scenario(
    '「済」と「×」の担当に、記録した時刻と記録した人の表示名が出る',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、10 日の皿洗いは太郎が「済」、11 日の洗濯物たたみは花子が「×」で、どちらもお母さんが記録している',
        () => {
          seedToday(state, NOON.jan14);
          seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [MONDAY])]);
          addDuty('2027-01-10', 'dishes', 'taro', {
            status: 'done',
            recordedAt: '2027-01-10T10:30:00.000Z',
            recordedBy: PEOPLE.mother.userId,
            unitPrice: 120,
            version: 2,
          });
          addDuty('2027-01-11', 'laundry', 'hanako', {
            status: 'skipped',
            recordedAt: '2027-01-11T11:00:00.000Z',
            recordedBy: PEOPLE.mother.userId,
            unitPrice: 80,
            version: 2,
          });
        },
      );
      When('次郎が 2027 年 1 月のカレンダーを開く', async () => {
        response = await open('jiro', '2027-01');
      });
      Then(
        '10 日の皿洗いは「済」で記録した時刻とお母さんの名前が付き、11 日の洗濯物たたみは「×」で同じく付き、単価は記録した値のままである',
        () => {
          const duties = bodyOf<MonthCalendar>(response).duties;
          expect(duties[0]).toMatchObject({
            date: '2027-01-10',
            status: 'done',
            recordedAt: '2027-01-10T10:30:00.000Z',
            recordedBy: PEOPLE.mother.userId,
            recordedByName: PEOPLE.mother.displayName,
            unitPrice: 120,
          });
          expect(duties[1]).toMatchObject({
            date: '2027-01-11',
            status: 'skipped',
            recordedAt: '2027-01-11T11:00:00.000Z',
            recordedByName: PEOPLE.mother.displayName,
            unitPrice: 80,
          });
        },
      );
    },
  );

  Scenario(
    '応答に、子供の一覧と、使わない種類も含む担当に出る種類が付く',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日、お風呂洗い（使わない種類）が 15 日にある',
        () => {
          seedToday(state, NOON.jan14);
          seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [THURSDAY])]);
          addDuty('2027-01-14', 'dishes', 'taro');
          addDuty('2027-01-15', 'bath', 'hanako');
        },
      );
      When('太郎が 2027 年 1 月のカレンダーを開く', async () => {
        response = await open('taro', '2027-01');
      });
      Then(
        '子供は太郎・花子・次郎の 3 人で管理者は含まれず、種類は皿洗いとお風呂洗いで、お風呂洗いは使わないになっている',
        () => {
          const calendar = bodyOf<MonthCalendar>(response);
          expect(calendar.children.map((child) => child.displayName).sort()).toEqual(
            ['太郎', '次郎', '花子'].sort(),
          );
          expect(calendar.children.some((child) => child.userId === PEOPLE.mother.userId)).toBe(
            false,
          );
          expect(calendar.choreTypes).toEqual(
            expect.arrayContaining([
              { choreTypeId: CHORES.dishes.choreTypeId, name: '皿洗い', active: true },
              { choreTypeId: CHORES.bath.choreTypeId, name: 'お風呂洗い', active: false },
            ]),
          );
          expect(calendar.choreTypes).toHaveLength(2);
        },
      );
    },
  );

  Scenario('子供の一覧の索引が古くても、担当にいる子供は必ず含まれる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にあり、太郎が子供の一覧の索引にまだ出ていない',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [THURSDAY])]);
        addDuty('2027-01-14', 'dishes', 'taro');
        state.world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
      },
    );
    When('お母さんが 2027 年 1 月のカレンダーを開く', async () => {
      response = await open('mother', '2027-01');
    });
    Then('子供の一覧に太郎が表示名つきで含まれる', () => {
      expect(bodyOf<MonthCalendar>(response).children).toContainEqual({
        userId: CHILDREN.taro.userId,
        displayName: '太郎',
      });
    });
  });

  Scenario('ほかの家族の担当は含まれない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にあり、ほかの家族にも同じ月の担当がある',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [THURSDAY])]);
        addDuty('2027-01-14', 'dishes', 'taro');
        addDuty('2027-01-15', 'laundry', 'hanako', { familyId: FAKE_OTHER_FAMILY_ID });
      },
    );
    When('お母さんが 2027 年 1 月のカレンダーを開く', async () => {
      response = await open('mother', '2027-01');
    });
    Then('担当は自分の家族の 1 件だけになる', () => {
      expect(responseDutyLines(response)).toEqual(['01-14 皿洗い 太郎']);
    });
  });

  Scenario('家族のメンバーでない人は 403 になる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にあり、家族に入っていない人がいる',
      () => {
        seedToday(state, NOON.jan14);
        addDuty('2027-01-14', 'dishes', 'taro');
        seedUser(state.world.users, 'hanako');
      },
    );
    When('家族に入っていない人が 2027 年 1 月のカレンダーを開く', async () => {
      state.world.hooks.readLog.length = 0;
      response = await callAsUserId(PEOPLE.hanako.userId, 'GET', calendarPath('2027-01'));
    });
    Then('応答は 403 で理由は NOT_FAMILY_MEMBER、Calendar は読まれない', () => {
      expect(response.statusCode).toBe(403);
      expect(errorOf(response).reason).toBe('NOT_FAMILY_MEMBER');
      expect(calendarReads(state.world)).toEqual([]);
    });
  });

  Scenario('月の形が違うと 422 になる', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にある', () => {
      seedToday(state, NOON.jan14);
      addDuty('2027-01-14', 'dishes', 'taro');
    });
    When('お母さんが 2027 年 13 月と 1999 年 12 月のカレンダーを開く', async () => {
      state.world.hooks.readLog.length = 0;
      responses.push(await open('mother', '2027-13'));
      responses.push(await open('mother', '1999-12'));
    });
    Then('どちらの応答も 422 で理由は INVALID_MONTH、Calendar は読まれない', () => {
      for (const res of responses) {
        expect(res.statusCode).toBe(422);
        expect(errorOf(res).reason).toBe('INVALID_MONTH');
      }
      expect(calendarReads(state.world)).toEqual([]);
    });
  });

  Scenario('Query に続きがあっても、担当は全件そろう', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日から 18 日まで 5 件あり、Calendar の Query は 2 件ずつ返す',
      () => {
        seedToday(state, NOON.jan14);
        for (const day of [14, 15, 16, 17, 18]) addDuty(`2027-01-${day}`, 'dishes', 'taro');
        state.world.hooks.queryPageSize = 2;
      },
    );
    When('お母さんが 2027 年 1 月のカレンダーを開く', async () => {
      state.world.hooks.readLog.length = 0;
      response = await open('mother', '2027-01');
    });
    Then('担当は 5 件すべて返り、Calendar の Query は 3 回になる', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<MonthCalendar>(response).duties).toHaveLength(5);
      expect(countReads().queries).toBe(3);
    });
  });

  Scenario('読み取りの回数は担当の数で増えない', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にある', () => {
      seedToday(state, NOON.jan14);
      addDuty('2027-01-14', 'dishes', 'taro');
    });
    When(
      'お母さんが 2027 年 1 月のカレンダーを開き、担当を 30 件に増やしてもう一度開く',
      async () => {
        state.world.hooks.readLog.length = 0;
        await open('mother', '2027-01');
        readCounts.push(countReads());
        for (let day = 1; day <= 30; day++) {
          if (day !== 14) addDuty(`2027-01-${String(day).padStart(2, '0')}`, 'dishes', 'taro');
        }
        state.world.hooks.readLog.length = 0;
        response = await open('mother', '2027-01');
        readCounts.push(countReads());
      },
    );
    Then('どちらも Calendar の Query は 1 回で、Get は 0 回である', () => {
      expect(bodyOf<MonthCalendar>(response).duties).toHaveLength(30);
      expect(readCounts).toEqual([
        { queries: 1, gets: 0 },
        { queries: 1, gets: 0 },
      ]);
    });
  });

  Scenario('Calendar の読み取りはすべて強い整合性で、Scan は使わない', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 14 日（木）で、1 月に皿洗いが 14 日にある', () => {
      seedToday(state, NOON.jan14);
      addDuty('2027-01-14', 'dishes', 'taro');
    });
    When('お母さんが 2027 年 1 月のカレンダーを開く', async () => {
      state.world.hooks.readLog.length = 0;
      response = await open('mother', '2027-01');
    });
    Then('Calendar の読み取りはすべて強い整合性で、Scan は 1 回もない', () => {
      const reads = calendarReads(state.world);
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((entry) => entry.consistent)).toBe(true);
      expect(state.world.hooks.readLog.some((entry) => entry.operation === 'Scan')).toBe(false);
    });
  });

  Scenario('保存の直後に開いたカレンダーに、保存した担当が出る', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 13 日（水）で、山田家に割り当てがない', () => {
      seedToday(state, NOON.jan13);
    });
    When(
      'お母さんが皿洗いを太郎の月曜と木曜で保存し、すぐに 2027 年 1 月のカレンダーを開く',
      async () => {
        second = await saveAs('mother', '2027-01', [rule('dishes', 'taro', [MONDAY, THURSDAY])]);
        response = await open('mother', '2027-01');
      },
    );
    Then(
      'カレンダーの担当は保存の応答と同じで、14 日・18 日・21 日・25 日・28 日の 5 件になる',
      () => {
        expect(second.statusCode).toBe(200);
        expect(bodyOf<MonthCalendar>(response)).toEqual(bodyOf<MonthCalendar>(second));
        expect(responseDutyLines(response)).toEqual(
          ['14', '18', '21', '25', '28'].map((day) => `01-${day} 皿洗い 太郎`),
        );
      },
    );
  });

  Scenario('今の割り当てを読むと、月と行と有無が返る', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、山田家の 1 月の割り当ては皿洗いが太郎の月曜と木曜である',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [
          rule('dishes', 'taro', [MONDAY, THURSDAY]),
        ]);
      },
    );
    When('次郎が 2027 年 1 月と 2027 年 2 月の割り当てを読む', async () => {
      responses.push(await callAs('jiro', 'GET', '/v1/months/2027-01/assignment'));
      responses.push(await callAs('jiro', 'GET', '/v1/months/2027-02/assignment'));
    });
    Then('1 月は行が 1 行で有る、2 月は行が空で無いと返る', () => {
      const [january, february] = responses.map((res) => bodyOf<AssignmentView>(res)) as [
        AssignmentView,
        AssignmentView,
      ];
      expect(january).toEqual({
        month: '2027-01',
        rules: [rule('dishes', 'taro', [MONDAY, THURSDAY])],
        exists: true,
      });
      expect(february).toEqual({ month: '2027-02', rules: [], exists: false });
    });
  });
});
