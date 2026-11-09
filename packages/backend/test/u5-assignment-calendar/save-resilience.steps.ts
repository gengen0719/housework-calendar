import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { AssignmentRule, MonthCalendar, OverwriteChange } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { computeChangesHash } from '../../src/services/changesHash';
import { datesOfMonth } from '@housework/shared';
import { bodyOf, FAMILY_ID } from '../u2-invitation/helpers/seed';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import {
  calendarKey,
  CHILDREN,
  CHORES,
  dutyItems,
  dutySk,
  seedAssignment,
  seedDuty,
  seedMonthState,
  type ChildKey,
} from './helpers/seed';
import {
  beginScenario,
  dutyLines,
  endScenario,
  errorOf,
  expectRefsMatchDuties,
  MONDAY,
  NOON,
  rule,
  saveAs,
  seedToday,
  storedAssignment,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/save-resilience.feature',
);

const MONTH = '2027-01';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const GIVEN_JAN13 = '今日は 2027 年 1 月 13 日（水）で、山田家に皿洗いなどの種類がある';
const GIVEN_JAN14_MONDAY =
  '今日は 2027 年 1 月 14 日（木）で、皿洗いは太郎の月曜の割り当てと、18 日・25 日の太郎の担当がある';
const GIVEN_DEC15_FOUR =
  '今日は 2026 年 12 月 15 日（火）で、「使う」種類が 4 つあり、4 つの種類を毎日、子供に割り当てる';
const GIVEN_LARGE_BASE =
  '今日は 2026 年 12 月 15 日（火）で、1 月に 4 つの種類の太郎の担当が 124 件あり、そのうち 1 日と 31 日の皿洗いは日ごとに変えた担当である';

let state: ScenarioState;
let response: APIGatewayProxyStructuredResultV2;
let first: APIGatewayProxyStructuredResultV2;
let second: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let pendingRules: AssignmentRule[];

type ChoreSeed = { choreTypeId: string; child: ChildKey };

/** 「使う」種類 4 つ（お風呂洗いも「使う」にする）を毎日、子供に割り当てる */
function seedFourTypes(): void {
  seedToday(state, NOON.dec15);
  seedChoreType(state.world.choreTypes, {
    choreTypeId: CHORES.bath.choreTypeId,
    name: CHORES.bath.name,
    active: true,
  });
  pendingRules = [
    rule('dishes', 'taro', ALL_DAYS),
    rule('laundry', 'hanako', ALL_DAYS),
    rule('garbage', 'jiro', ALL_DAYS),
    rule('bath', 'taro', ALL_DAYS),
  ];
}

/** 「使う」種類を 10 個にして（6 個を足す）、毎日、子供に割り当てる */
function seedTenTypes(): void {
  seedFourTypes();
  const children: ChildKey[] = ['taro', 'hanako', 'jiro'];
  const extra: ChoreSeed[] = Array.from({ length: 6 }, (_, index) => ({
    choreTypeId: randomUUID(),
    child: children[index % 3] as ChildKey,
  }));
  extra.forEach((chore, index) => {
    seedChoreType(state.world.choreTypes, {
      choreTypeId: chore.choreTypeId,
      name: `お手伝い${index + 1}`,
      familyId: FAMILY_ID,
    });
    pendingRules.push({
      choreTypeId: chore.choreTypeId,
      childUserId: CHILDREN[chore.child].userId,
      weekdays: ALL_DAYS,
    });
  });
}

/** 今日は 1 月 14 日で、割り当ては皿洗い・太郎の月曜、18 日・25 日の担当がある */
function seedMondayBase(): void {
  seedToday(state, NOON.jan14);
  seedAssignment(state.world.calendar, MONTH, [rule('dishes', 'taro', [MONDAY])]);
  for (const date of ['2027-01-18', '2027-01-25']) {
    seedDuty(state.world.calendar, {
      dutyId: randomUUID(),
      date,
      choreTypeId: CHORES.dishes.choreTypeId,
      childUserId: CHILDREN.taro.userId,
    });
  }
}

const dutyAt = (date: string, choreTypeId: string = CHORES.dishes.choreTypeId) =>
  state.world.calendar.get(calendarKey(dutySk(MONTH, date, choreTypeId)));

/** 124 件の担当（4 種類 × 31 日、すべて太郎）と、日ごとに変えた 2 件。割り当てもある */
function seedLargeBase(): void {
  seedFourTypes();
  const taroRules = [
    rule('dishes', 'taro', ALL_DAYS),
    rule('laundry', 'taro', ALL_DAYS),
    rule('garbage', 'taro', ALL_DAYS),
    rule('bath', 'taro', ALL_DAYS),
  ];
  seedAssignment(state.world.calendar, MONTH, taroRules);
  for (const date of datesOfMonth(MONTH)) {
    for (const chore of ['dishes', 'laundry', 'garbage', 'bath'] as const) {
      const manual = chore === 'dishes' && (date === '2027-01-01' || date === '2027-01-31');
      seedDuty(state.world.calendar, {
        dutyId: randomUUID(),
        date,
        choreTypeId: CHORES[chore].choreTypeId,
        childUserId: CHILDREN.taro.userId,
        ...(manual ? { origin: 'manual' as const, version: 2 } : {}),
      });
    }
  }
  pendingRules = [
    rule('dishes', 'hanako', ALL_DAYS),
    rule('laundry', 'hanako', ALL_DAYS),
    rule('garbage', 'hanako', ALL_DAYS),
    rule('bath', 'hanako', ALL_DAYS),
  ];
}

/** 印を付けた保存: 一覧を印なしで取り、その印を付けて送る */
async function saveWithConfirmation(): Promise<APIGatewayProxyStructuredResultV2> {
  const unconfirmed = await saveAs('mother', MONTH, pendingRules);
  expect(unconfirmed.statusCode).toBe(409);
  const { changesHash } = errorOf(unconfirmed).details as { changesHash: string };
  return saveAs('mother', MONTH, pendingRules, { confirmedChangesHash: changesHash });
}

const calendarOf = (res: APIGatewayProxyStructuredResultV2) => bodyOf<MonthCalendar>(res);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
    pendingRules = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '124 件の初めての保存は、担当を 3 回と割り当てを 1 回に分けて書く',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_DEC15_FOUR, seedFourTypes);
      When('お母さんが 2027 年 1 月に保存する', async () => {
        response = await saveAs('mother', MONTH, pendingRules);
      });
      Then('応答は 200 で、担当は 124 件できる', () => {
        expect(response.statusCode).toBe(200);
        expect(calendarOf(response).duties).toHaveLength(124);
        expect(dutyItems(state.world.calendar)).toHaveLength(124);
        expectRefsMatchDuties(state.world);
      });
      And('書き込みの取引は 4 回で、項目数は 99・99・65・6 になる', () => {
        expect(state.world.hooks.transactionSizes).toEqual([99, 99, 65, 6]);
      });
    },
  );

  Scenario(
    '310 件の保存は、担当を 8 回と割り当てを 1 回に分けて書く',
    ({ Given, When, Then, And }) => {
      Given(
        '今日は 2026 年 12 月 15 日（火）で、「使う」種類が 10 個あり、10 個の種類を毎日、子供に割り当てる',
        seedTenTypes,
      );
      When('お母さんが 2027 年 1 月に保存する', async () => {
        response = await saveAs('mother', MONTH, pendingRules);
      });
      Then('応答は 200 で、担当は 310 件できる', () => {
        expect(response.statusCode).toBe(200);
        expect(dutyItems(state.world.calendar)).toHaveLength(310);
        expectRefsMatchDuties(state.world);
      });
      And('書き込みの取引は 9 回で、どの項目数も 100 を超えない', () => {
        const sizes = state.world.hooks.transactionSizes;
        expect(sizes).toHaveLength(9);
        expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
        expect(sizes.slice(0, 7)).toEqual(Array(7).fill(99));
        expect(sizes[8]).toBe(12);
      });
    },
  );

  Scenario(
    '初めての保存が途中で失敗しても、もう一度保存すると正しい状態になる',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_DEC15_FOUR, seedFourTypes);
      And('2 回目の書き込みが ThrottlingError で断られる', () => {
        state.world.hooks.failTransaction(2, 'ThrottlingError');
      });
      When('お母さんが 2027 年 1 月に保存し、失敗したあともう一度保存する', async () => {
        first = await saveAs('mother', MONTH, pendingRules);
        expect(dutyItems(state.world.calendar)).toHaveLength(47);
        expect(storedAssignment(state.world, MONTH)).toBeUndefined();
        second = await saveAs('mother', MONTH, pendingRules);
      });
      Then(
        '1 回目は 500 で、書けたのは最初の 47 件だけで割り当ては書かれず、PARTIAL_FAILURE のログが残る',
        () => {
          expect(first.statusCode).toBe(500);
          expect(errorOf(first).reason).toBe('INTERNAL');
          expect(state.logs.find((l) => l.event === 'ASSIGNMENT_PARTIAL_FAILURE')).toMatchObject({
            writtenChunks: 1,
            totalChunks: 4,
            month: MONTH,
          });
        },
      );
      And('2 回目は 200 で、担当は 124 件そろい、割り当ても書かれている', () => {
        expect(second.statusCode).toBe(200);
        expect(dutyItems(state.world.calendar)).toHaveLength(124);
        expectRefsMatchDuties(state.world);
        expect(storedAssignment(state.world, MONTH)?.rules).toHaveLength(4);
      });
    },
  );

  Scenario(
    '保存し直しが途中で失敗しても、もう一度保存すると正しい状態になる',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_JAN14_MONDAY, seedMondayBase);
      And('2 回目の書き込みが ThrottlingError で断られる', () => {
        state.world.hooks.failTransaction(2, 'ThrottlingError');
      });
      When('お母さんが皿洗いを花子の月曜に保存し、失敗したあともう一度保存する', async () => {
        pendingRules = [rule('dishes', 'hanako', [MONDAY])];
        first = await saveAs('mother', MONTH, pendingRules);
        expect(dutyLines(state.world)).toEqual([
          '01-18 皿洗い 花子 todo rule v2',
          '01-25 皿洗い 花子 todo rule v2',
        ]);
        expect(storedAssignment(state.world, MONTH)?.rules).toEqual([
          rule('dishes', 'taro', [MONDAY]),
        ]);
        second = await saveAs('mother', MONTH, pendingRules);
      });
      Then(
        '1 回目は 500 で、担当は花子に変わったが割り当ては太郎のままで、PARTIAL_FAILURE のログが残る',
        () => {
          expect(first.statusCode).toBe(500);
          expect(state.logs.find((l) => l.event === 'ASSIGNMENT_PARTIAL_FAILURE')).toMatchObject({
            writtenChunks: 1,
            totalChunks: 2,
          });
        },
      );
      And('2 回目は 200 で、担当は花子のまま、割り当ても花子の月曜になる', () => {
        expect(second.statusCode).toBe(200);
        expect(dutyLines(state.world)).toEqual([
          '01-18 皿洗い 花子 todo rule v2',
          '01-25 皿洗い 花子 todo rule v2',
        ]);
        expect(storedAssignment(state.world, MONTH)?.rules).toEqual(pendingRules);
      });
    },
  );

  Scenario(
    '書き込みの直前に「済」が入ると、その担当は変わらず 1 回だけやり直して収まる',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_JAN14_MONDAY, seedMondayBase);
      And('1 回目の書き込みの直前に、25 日の担当が「済」になる', () => {
        state.world.hooks.beforeTransaction(1, () => {
          const duty = dutyAt('2027-01-25');
          if (duty) Object.assign(duty, { status: 'done', version: 2 });
        });
      });
      When('お母さんが皿洗いを花子の月曜に保存する', async () => {
        response = await saveAs('mother', MONTH, [rule('dishes', 'hanako', [MONDAY])]);
      });
      Then('応答は 200 で、18 日は花子に変わり、25 日は太郎の「済」のまま変わらない', () => {
        expect(response.statusCode).toBe(200);
        expect(dutyLines(state.world)).toEqual([
          '01-18 皿洗い 花子 todo rule v2',
          '01-25 皿洗い 太郎 done rule v2',
        ]);
        // 取り消された 1 回 + やり直しの担当 + 割り当て
        expect(state.world.hooks.transactionSizes).toHaveLength(3);
      });
    },
  );

  Scenario('書き込みの直前に月が確定すると、409 で何も書かない', ({ Given, And, When, Then }) => {
    Given(GIVEN_DEC15_FOUR, seedFourTypes);
    And('1 回目の書き込みの直前に、1 月が確定する', () => {
      state.world.hooks.beforeTransaction(1, () =>
        seedMonthState(state.world.calendar, MONTH, true),
      );
    });
    When('お母さんが 2027 年 1 月に保存する', async () => {
      response = await saveAs('mother', MONTH, pendingRules);
    });
    Then('応答は 409 で理由は MONTH_CONFIRMED、担当も割り当ても作られていない', () => {
      expect(response.statusCode).toBe(409);
      expect(errorOf(response).reason).toBe('MONTH_CONFIRMED');
      expect(dutyItems(state.world.calendar)).toEqual([]);
      expect(storedAssignment(state.world, MONTH)).toBeUndefined();
    });
  });

  Scenario(
    '書き込みの直前に種類が「使わない」になると、422 で何も書かない',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_JAN13, () => seedToday(state, NOON.jan13));
      And('1 回目の書き込みの直前に、皿洗いが「使わない」になる', () => {
        state.world.hooks.beforeTransaction(1, () => {
          const dishes = state.world.choreTypes.get(
            `${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`,
          );
          if (dishes) dishes.active = false;
        });
      });
      When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する', async () => {
        response = await saveAs('mother', MONTH, [rule('dishes', 'taro', [MONDAY])]);
      });
      Then('応答は 422 で理由は CHORE_TYPE_INACTIVE、担当も割り当ても作られていない', () => {
        expect(response.statusCode).toBe(422);
        expect(errorOf(response).reason).toBe('CHORE_TYPE_INACTIVE');
        expect(dutyItems(state.world.calendar)).toEqual([]);
        expect(storedAssignment(state.world, MONTH)).toBeUndefined();
      });
    },
  );

  Scenario(
    '2 つの保存が同じ日の同じ種類を同時に作ろうとしても、二重にならない',
    ({ Given, When, Then }) => {
      Given(GIVEN_JAN13, () => seedToday(state, NOON.jan13));
      When('お母さんの 2 つの画面が、皿洗いを太郎の月曜と花子の月曜で同時に保存する', async () => {
        responses = await Promise.all([
          saveAs('mother', MONTH, [rule('dishes', 'taro', [MONDAY])]),
          saveAs('mother', MONTH, [rule('dishes', 'hanako', [MONDAY])]),
        ]);
      });
      Then('担当は日付と種類ごとに 1 つだけで、引き当てもそろっている', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
        const duties = dutyItems(state.world.calendar);
        expect(duties.map((d) => d.date)).toEqual(['2027-01-18', '2027-01-25']);
        expectRefsMatchDuties(state.world);
      });
    },
  );

  Scenario(
    '読んだあとに担当が消されて作り直されても、作り直された別の担当は変わらない',
    ({ Given, And, When, Then }) => {
      let recreatedId = '';
      Given(GIVEN_JAN14_MONDAY, seedMondayBase);
      And(
        '1 回目の書き込みの直前に、18 日の担当が消されて別の担当として作り直され、2 回目の書き込みは断られる',
        () => {
          recreatedId = randomUUID();
          state.world.hooks.beforeTransaction(1, () => {
            for (const [key, item] of [...state.world.calendar]) {
              if (item.date === '2027-01-18') state.world.calendar.delete(key);
              if (String(item.sk).startsWith('DID#') && item.date === '2027-01-18') {
                state.world.calendar.delete(key);
              }
            }
            seedDuty(state.world.calendar, {
              dutyId: recreatedId,
              date: '2027-01-18',
              choreTypeId: CHORES.dishes.choreTypeId,
              childUserId: CHILDREN.taro.userId,
            });
          });
          state.world.hooks.failTransaction(2, 'ThrottlingError');
        },
      );
      When('お母さんが皿洗いを花子の月曜に保存する', async () => {
        response = await saveAs('mother', MONTH, [rule('dishes', 'hanako', [MONDAY])]);
      });
      Then(
        '応答は 500 で、作り直された別の 18 日の担当は太郎のまま version も変わっていない',
        () => {
          expect(response.statusCode).toBe(500);
          expect(dutyAt('2027-01-18')).toMatchObject({
            dutyId: recreatedId,
            childUserId: CHILDREN.taro.userId,
            version: 1,
          });
          expect(dutyAt('2027-01-25')).toMatchObject({ childUserId: CHILDREN.taro.userId });
        },
      );
    },
  );

  Scenario(
    '前の試行が上書きした担当が一覧から消えても、部分集合なので続行して保存できる',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_LARGE_BASE, seedLargeBase);
      And(
        '印を付けた保存の途中で、2 回目の書き込みの直前に、30 日の洗濯物たたみが「済」になる',
        () => {
          state.world.hooks.beforeTransaction(2, () => {
            const duty = dutyAt('2027-01-30', CHORES.laundry.choreTypeId);
            if (duty) Object.assign(duty, { status: 'done', version: 2 });
          });
        },
      );
      When('お母さんが全部を花子に変える割り当てを、印を付けて保存する', async () => {
        response = await saveWithConfirmation();
      });
      Then(
        '応答は 200 で、日ごとに変えた 2 件も花子になり、「済」の 1 件は太郎のままである',
        () => {
          expect(response.statusCode).toBe(200);
          expect(dutyAt('2027-01-01')).toMatchObject({
            childUserId: CHILDREN.hanako.userId,
            origin: 'rule',
          });
          expect(dutyAt('2027-01-31')).toMatchObject({
            childUserId: CHILDREN.hanako.userId,
            origin: 'rule',
          });
          expect(dutyAt('2027-01-30', CHORES.laundry.choreTypeId)).toMatchObject({
            childUserId: CHILDREN.taro.userId,
            status: 'done',
          });
          const hanako = dutyItems(state.world.calendar).filter(
            (d) => d.childUserId === CHILDREN.hanako.userId,
          );
          expect(hanako).toHaveLength(123);
          expect(storedAssignment(state.world, MONTH)?.rules).toHaveLength(4);
        },
      );
    },
  );

  Scenario(
    'やり直しの間に別の人が担当を変えて行の値が違うと、新しい一覧で 409 になる',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_LARGE_BASE, seedLargeBase);
      And(
        '印を付けた保存の途中で、2 回目の書き込みの直前に、31 日の皿洗いの version が増える',
        () => {
          state.world.hooks.beforeTransaction(2, () => {
            const duty = dutyAt('2027-01-31');
            if (duty) duty.version = 3;
          });
        },
      );
      When('お母さんが全部を花子に変える割り当てを、印を付けて保存する', async () => {
        response = await saveWithConfirmation();
      });
      Then(
        '応答は 409 で理由は OVERWRITE_CONFIRMATION_REQUIRED、新しい一覧は 31 日の皿洗いだけで新しい version を含む',
        () => {
          expect(response.statusCode).toBe(409);
          expect(errorOf(response).reason).toBe('OVERWRITE_CONFIRMATION_REQUIRED');
          const details = errorOf(response).details as {
            changes: OverwriteChange[];
            changesHash: string;
          };
          expect(details.changes).toEqual([
            {
              date: '2027-01-31',
              choreTypeId: CHORES.dishes.choreTypeId,
              fromChildUserId: CHILDREN.taro.userId,
              toChildUserId: CHILDREN.hanako.userId,
            },
          ]);
          expect(details.changesHash).toBe(
            computeChangesHash(FAMILY_ID, MONTH, [
              {
                ...details.changes[0],
                version: 3,
              } as Parameters<typeof computeChangesHash>[2][number],
            ]),
          );
        },
      );
    },
  );

  Scenario(
    '思いがけない Code で断られると 500 になり、何も書かれていない失敗はログに残る',
    ({ Given, And, When, Then }) => {
      Given(GIVEN_JAN13, () => seedToday(state, NOON.jan13));
      And('1 回目の書き込みが ThrottlingError で断られる', () => {
        state.world.hooks.failTransaction(1, 'ThrottlingError');
      });
      When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する', async () => {
        response = await saveAs('mother', MONTH, [rule('dishes', 'taro', [MONDAY])]);
      });
      Then('応答は 500 で、REJECTED のログが残り、担当も割り当ても作られていない', () => {
        expect(response.statusCode).toBe(500);
        expect(state.logs.find((l) => l.event === 'ASSIGNMENT_REJECTED')).toMatchObject({
          reason: 'INTERNAL',
        });
        expect(state.logs.some((l) => l.event === 'ASSIGNMENT_PARTIAL_FAILURE')).toBe(false);
        expect(state.world.calendar.size).toBe(0);
      });
    },
  );

  Scenario('競合が 2 回続くと 500 になる', ({ Given, And, When, Then }) => {
    Given(GIVEN_JAN13, () => seedToday(state, NOON.jan13));
    And('1 回目と 2 回目の書き込みが TransactionConflict で断られる', () => {
      state.world.hooks.failTransaction(1, 'TransactionConflict');
      state.world.hooks.failTransaction(2, 'TransactionConflict');
    });
    When('お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する', async () => {
      response = await saveAs('mother', MONTH, [rule('dishes', 'taro', [MONDAY])]);
    });
    Then('応答は 500 で、担当も割り当ても作られていない', () => {
      expect(response.statusCode).toBe(500);
      expect(state.world.hooks.transactionSizes).toHaveLength(2);
      expect(state.world.calendar.size).toBe(0);
    });
  });

  Scenario('残り時間が 5 秒を切っていると、書かずに 500 にする', ({ Given, When, Then }) => {
    Given(GIVEN_JAN13, () => seedToday(state, NOON.jan13));
    When(
      'Lambda の残り時間が 4 秒の状態で、お母さんが 2027 年 1 月に、皿洗いを太郎の月曜で保存する',
      async () => {
        response = await saveAs(
          'mother',
          MONTH,
          [rule('dishes', 'taro', [MONDAY])],
          {},
          { getRemainingTimeInMillis: () => 4000 },
        );
      },
    );
    Then('応答は 500 で、書き込みの取引は行われていない', () => {
      expect(response.statusCode).toBe(500);
      expect(state.world.hooks.transactionSizes).toEqual([]);
      expect(state.world.calendar.size).toBe(0);
    });
  });
});
