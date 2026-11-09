import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { FAKE_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  callAs,
  CHILDREN,
  CHORES,
  seedAssignment,
  seedDuty,
  type ChildKey,
  type ChoreKey,
} from './helpers/seed';
import {
  beginScenario,
  calendarReads,
  endScenario,
  errorOf,
  MONDAY,
  NOON,
  rule,
  saveAs,
  seedToday,
  THURSDAY,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/chore-type-in-use.feature',
);

let state: ScenarioState;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let queryCounts: number[];

function addDuty(
  date: string,
  chore: ChoreKey,
  child: ChildKey,
  familyId: string = FAMILY_ID,
): void {
  seedDuty(state.world.calendar, {
    dutyId: randomUUID(),
    date,
    choreTypeId: CHORES[chore].choreTypeId,
    childUserId: CHILDREN[child].userId,
    familyId,
  });
}

const remove = (chore: ChoreKey) =>
  callAs('mother', 'DELETE', `/v1/chore-types/${CHORES[chore].choreTypeId}`);

const storedType = (chore: ChoreKey) =>
  state.world.choreTypes.get(`${FAMILY_ID}#TYPE#${CHORES[chore].choreTypeId}`);

function expectInUseAndInactive(chore: ChoreKey): void {
  expect(response.statusCode).toBe(409);
  expect(errorOf(response).reason).toBe('CHORE_TYPE_IN_USE');
  expect(storedType(chore)).toMatchObject({ active: false });
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
    queryCounts = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '割り当てに使っている種類は、消せずに「使わない」のままになる',
    ({ Given, When, Then }) => {
      Given('今日は 2027 年 1 月 14 日（木）で、1 月の割り当てに皿洗いが入っている', () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [MONDAY])]);
      });
      When('お母さんが皿洗いの種類を消そうとする', async () => {
        response = await remove('dishes');
      });
      Then('応答は 409 で理由は CHORE_TYPE_IN_USE、皿洗いは「使わない」で残っている', () => {
        expectInUseAndInactive('dishes');
      });
    },
  );

  Scenario(
    '割り当てから外してあっても、過去の月の担当に残っていれば消せない',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、1 月の割り当ては空で、前の年の 12 月の担当に皿洗いが残っている',
        () => {
          seedToday(state, NOON.jan14);
          seedAssignment(state.world.calendar, '2027-01', []);
          addDuty('2026-12-10', 'dishes', 'taro');
        },
      );
      When('お母さんが皿洗いの種類を消そうとする', async () => {
        response = await remove('dishes');
      });
      Then('応答は 409 で理由は CHORE_TYPE_IN_USE、皿洗いは「使わない」で残っている', () => {
        expectInUseAndInactive('dishes');
      });
    },
  );

  Scenario('保存の途中で失敗して担当だけができた状態でも、消せない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月の皿洗いの担当だけがあり、割り当ての記録はない',
      () => {
        seedToday(state, NOON.jan14);
        addDuty('2027-01-18', 'dishes', 'taro');
      },
    );
    When('お母さんが皿洗いの種類を消そうとする', async () => {
      response = await remove('dishes');
    });
    Then('応答は 409 で理由は CHORE_TYPE_IN_USE、皿洗いは「使わない」で残っている', () => {
      expectInUseAndInactive('dishes');
    });
  });

  Scenario('使われていない種類は消せる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、1 月の割り当てに皿洗いが入っていて、洗濯物たたみはどこにも使われていない',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [MONDAY])]);
      },
    );
    When('お母さんが洗濯物たたみの種類を消そうとする', async () => {
      response = await remove('laundry');
    });
    Then('応答は 204 で、洗濯物たたみは消え、皿洗いはそのまま残っている', () => {
      expect(response.statusCode).toBe(204);
      expect(storedType('laundry')).toBeUndefined();
      expect(storedType('dishes')).toMatchObject({ active: true });
    });
  });

  Scenario('ほかの家族の使用は見ない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、皿洗いをほかの家族だけが割り当てと担当に使っている',
      () => {
        seedToday(state, NOON.jan14);
        seedAssignment(
          state.world.calendar,
          '2027-01',
          [rule('dishes', 'taro', [MONDAY])],
          FAKE_OTHER_FAMILY_ID,
        );
        addDuty('2027-01-18', 'dishes', 'taro', FAKE_OTHER_FAMILY_ID);
      },
    );
    When('お母さんが皿洗いの種類を消そうとする', async () => {
      response = await remove('dishes');
    });
    Then('応答は 204 で、皿洗いは消える', () => {
      expect(response.statusCode).toBe(204);
      expect(storedType('dishes')).toBeUndefined();
    });
  });

  Scenario('直前に保存した割り当てを見落とさない', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 13 日（水）で、山田家に割り当てがない', () => {
      seedToday(state, NOON.jan13);
    });
    When(
      'お母さんが皿洗いを太郎の月曜と木曜で保存し、すぐに皿洗いの種類を消そうとする',
      async () => {
        const saved = await saveAs('mother', '2027-01', [
          rule('dishes', 'taro', [MONDAY, THURSDAY]),
        ]);
        expect(saved.statusCode).toBe(200);
        state.world.hooks.readLog.length = 0;
        response = await remove('dishes');
      },
    );
    Then(
      '応答は 409 で理由は CHORE_TYPE_IN_USE、確かめの読み取りは強い整合性の Query で Scan はない',
      () => {
        expectInUseAndInactive('dishes');
        const reads = calendarReads(state.world);
        expect(reads.length).toBeGreaterThan(0);
        expect(reads.every((entry) => entry.operation === 'Query' && entry.consistent)).toBe(true);
        expect(state.world.hooks.readLog.some((entry) => entry.operation === 'Scan')).toBe(false);
      },
    );
  });

  Scenario(
    'Query に続きがあっても探し続け、見つかったら続きを読まない',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、Calendar の Query は 1 件ずつ返し、14 日の皿洗い、15 日のゴミ出し、16 日の洗濯物たたみの担当がある',
        () => {
          seedToday(state, NOON.jan14);
          addDuty('2027-01-14', 'dishes', 'taro');
          addDuty('2027-01-15', 'garbage', 'hanako');
          addDuty('2027-01-16', 'laundry', 'jiro');
          state.world.hooks.queryPageSize = 1;
        },
      );
      When(
        'お母さんが皿洗いを消そうとし、次に洗濯物たたみを消そうとし、最後にお風呂洗いを消そうとする',
        async () => {
          for (const chore of ['dishes', 'laundry', 'bath'] as const) {
            state.world.hooks.readLog.length = 0;
            responses.push(await remove(chore));
            queryCounts.push(
              calendarReads(state.world).filter((e) => e.operation === 'Query').length,
            );
          }
        },
      );
      Then(
        '皿洗いの確かめは Query 1 回で見つかり、洗濯物たたみは 3 回で見つかり、お風呂洗いは 3 回で見つからず消える',
        () => {
          expect(responses.map((r) => r.statusCode)).toEqual([409, 409, 204]);
          expect(queryCounts).toEqual([1, 3, 3]);
          expect(storedType('bath')).toBeUndefined();
        },
      );
    },
  );
});
