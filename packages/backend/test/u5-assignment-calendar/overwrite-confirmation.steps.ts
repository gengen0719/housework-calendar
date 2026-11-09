import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { OverwriteChange } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { computeChangesHash } from '../../src/services/changesHash';
import type { HashedChange } from '../../src/services/assignmentPlanner';
import { FAKE_CHANGES_HASH_MALFORMED, FAKE_CHANGES_HASH_MISMATCH } from '../fixtures/fakeSecrets';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  CHILDREN,
  CHORES,
  calendarKey,
  dutyItems,
  dutySk,
  seedAssignment,
  seedDuty,
} from './helpers/seed';
import {
  beginScenario,
  dutyLines,
  endScenario,
  errorOf,
  MONDAY,
  NOON,
  rule,
  saveAs,
  seedToday,
  storedAssignment,
  THURSDAY,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/overwrite-confirmation.feature',
);

const MONTH = '2027-01';
const DISHES = CHORES.dishes.choreTypeId;
const GIVEN_BASE =
  '今日は 2027 年 1 月 14 日（木）で、皿洗いは太郎の月曜と木曜の割り当てで、18 日は花子に変えた担当、21 日は次郎が引き受けた担当である';

let state: ScenarioState;
let first: APIGatewayProxyStructuredResultV2;
let second: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];

const sameRules = () => [rule('dishes', 'taro', [MONDAY, THURSDAY])];

/** 18 日（花子に変えた担当）と 21 日（次郎が引き受けた担当）を土台に置く */
function seedBase(extra: () => void = () => undefined): void {
  seedToday(state, NOON.jan14);
  seedAssignment(state.world.calendar, MONTH, sameRules());
  const at = (date: string, child: 'taro' | 'hanako' | 'jiro', options = {}) =>
    seedDuty(state.world.calendar, {
      dutyId: randomUUID(),
      date,
      choreTypeId: DISHES,
      childUserId: CHILDREN[child].userId,
      ...options,
    });
  at('2027-01-18', 'hanako', { origin: 'manual', version: 2 });
  at('2027-01-21', 'jiro', { origin: 'swap', version: 3 });
  at('2027-01-25', 'taro');
  at('2027-01-28', 'taro');
  extra();
}

const expectedRows: HashedChange[] = [
  {
    date: '2027-01-18',
    choreTypeId: DISHES,
    fromChildUserId: CHILDREN.hanako.userId,
    toChildUserId: CHILDREN.taro.userId,
    version: 2,
  },
  {
    date: '2027-01-21',
    choreTypeId: DISHES,
    fromChildUserId: CHILDREN.jiro.userId,
    toChildUserId: CHILDREN.taro.userId,
    version: 3,
  },
];

const detailsOf = (res: APIGatewayProxyStructuredResultV2) =>
  errorOf(res).details as { changes: OverwriteChange[]; changesHash: string };

const toShown = (rows: HashedChange[]): OverwriteChange[] =>
  rows.map(({ date, choreTypeId, fromChildUserId, toChildUserId }) => ({
    date,
    choreTypeId,
    fromChildUserId,
    toChildUserId,
  }));

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '上書きされる担当があると、変化の一覧と印を返して何も書かない',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_BASE, () => seedBase());
      When('お母さんが同じ割り当てを、印なしで保存し直す', async () => {
        first = await saveAs('mother', MONTH, sameRules());
      });
      Then(
        '応答は 409 で理由は OVERWRITE_CONFIRMATION_REQUIRED、変化の一覧は 18 日の花子から太郎と 21 日の次郎から太郎の 2 行になる',
        () => {
          expect(first.statusCode).toBe(409);
          expect(errorOf(first).reason).toBe('OVERWRITE_CONFIRMATION_REQUIRED');
          expect(detailsOf(first).changes).toEqual(toShown(expectedRows));
        },
      );
      And('印は一覧から作った値と同じで、担当も割り当ても書き換わっていない', () => {
        expect(detailsOf(first).changesHash).toBe(
          computeChangesHash(FAMILY_ID, MONTH, expectedRows),
        );
        expect(state.world.hooks.transactionSizes).toEqual([]);
        expect(dutyLines(state.world)).toContain('01-18 皿洗い 花子 todo manual v2');
        expect(dutyLines(state.world)).toContain('01-21 皿洗い 次郎 todo swap v3');
      });
    },
  );

  Scenario('印を付けて送り直すと保存される', ({ Given, When, Then }) => {
    Given(GIVEN_BASE, () => seedBase());
    When('お母さんが同じ割り当てを印なしで保存し直し、返ってきた印を付けて送り直す', async () => {
      first = await saveAs('mother', MONTH, sameRules());
      second = await saveAs('mother', MONTH, sameRules(), {
        confirmedChangesHash: detailsOf(first).changesHash,
      });
    });
    Then(
      '応答は 200 で、18 日と 21 日の皿洗いは太郎になり、origin は rule、version は 1 増える',
      () => {
        expect(first.statusCode).toBe(409);
        expect(second.statusCode).toBe(200);
        const lines = dutyLines(state.world);
        expect(lines).toContain('01-18 皿洗い 太郎 todo rule v3');
        expect(lines).toContain('01-21 皿洗い 太郎 todo rule v4');
      },
    );
  });

  Scenario(
    '確かめのあとに担当が変わっていると、印が合わず新しい一覧がもう一度返る',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_BASE, () => seedBase());
      When(
        'お母さんが同じ割り当てを印なしで保存し直し、そのあと 18 日の担当が変わってから、返ってきた印を付けて送り直す',
        async () => {
          first = await saveAs('mother', MONTH, sameRules());
          const key = calendarKey(dutySk(MONTH, '2027-01-18', DISHES));
          const duty = state.world.calendar.get(key);
          if (duty) {
            duty.version = 5;
            duty.childUserId = CHILDREN.jiro.userId;
          }
          second = await saveAs('mother', MONTH, sameRules(), {
            confirmedChangesHash: detailsOf(first).changesHash,
          });
        },
      );
      Then(
        '応答は 409 で、新しい一覧は変わった 18 日の version を含み、新しい印は前の印と違う',
        () => {
          expect(second.statusCode).toBe(409);
          expect(errorOf(second).reason).toBe('OVERWRITE_CONFIRMATION_REQUIRED');
          const rows = [
            { ...expectedRows[0], fromChildUserId: CHILDREN.jiro.userId, version: 5 },
            expectedRows[1],
          ] as HashedChange[];
          expect(detailsOf(second).changes).toEqual(toShown(rows));
          expect(detailsOf(second).changesHash).toBe(computeChangesHash(FAMILY_ID, MONTH, rows));
          expect(detailsOf(second).changesHash).not.toBe(detailsOf(first).changesHash);
        },
      );
      And('担当は書き換わっていない', () => {
        expect(state.world.hooks.transactionSizes).toEqual([]);
        expect(dutyLines(state.world)).toContain('01-21 皿洗い 次郎 todo swap v3');
      });
    },
  );

  Scenario('形の誤りの印は 422、形が正しくて合わない印は 409 になる', ({ Given, When, Then }) => {
    Given(GIVEN_BASE, () => seedBase());
    When('お母さんが形の違う印と、形は正しいが合わない印を付けて保存し直す', async () => {
      responses.push(
        await saveAs('mother', MONTH, sameRules(), {
          confirmedChangesHash: FAKE_CHANGES_HASH_MALFORMED,
        }),
      );
      responses.push(
        await saveAs('mother', MONTH, sameRules(), {
          confirmedChangesHash: FAKE_CHANGES_HASH_MISMATCH,
        }),
      );
    });
    Then(
      '形の違う印は 422 の INVALID_ASSIGNMENT、合わない印は 409 の OVERWRITE_CONFIRMATION_REQUIRED で一覧と正しい印が返る',
      () => {
        const [malformed, mismatch] = responses as [
          APIGatewayProxyStructuredResultV2,
          APIGatewayProxyStructuredResultV2,
        ];
        expect(malformed.statusCode).toBe(422);
        expect(errorOf(malformed).reason).toBe('INVALID_ASSIGNMENT');
        expect(mismatch.statusCode).toBe(409);
        expect(detailsOf(mismatch).changes).toEqual(toShown(expectedRows));
        expect(detailsOf(mismatch).changesHash).toBe(
          computeChangesHash(FAMILY_ID, MONTH, expectedRows),
        );
      },
    );
  });

  Scenario(
    '上書きする担当がなければ印は要らず、付いていても無視される',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、皿洗いは太郎の月曜と木曜の割り当てで、担当は origin が rule だけである',
        () => {
          seedToday(state, NOON.jan14);
          seedAssignment(state.world.calendar, MONTH, sameRules());
          for (const date of ['2027-01-18', '2027-01-21', '2027-01-25', '2027-01-28']) {
            seedDuty(state.world.calendar, {
              dutyId: randomUUID(),
              date,
              choreTypeId: DISHES,
              childUserId: CHILDREN.taro.userId,
            });
          }
        },
      );
      When('お母さんが花子の月曜と木曜に、合わない印を付けて保存し直す', async () => {
        first = await saveAs('mother', MONTH, [rule('dishes', 'hanako', [MONDAY, THURSDAY])], {
          confirmedChangesHash: FAKE_CHANGES_HASH_MISMATCH,
        });
      });
      Then('応答は 200 で、18 日以降の皿洗いは花子に変わる', () => {
        expect(first.statusCode).toBe(200);
        expect(dutyLines(state.world)).toEqual(
          ['01-18', '01-21', '01-25', '01-28'].map((d) => `${d} 皿洗い 花子 todo rule v2`),
        );
      });
    },
  );

  Scenario('作り直しでなくなる担当は、行き先なしで一覧に出る', ({ Given, When, Then }) => {
    Given(GIVEN_BASE, () => seedBase());
    When('お母さんが皿洗いを太郎の木曜だけに保存し直し、返ってきた印を付けて送り直す', async () => {
      const thursdayOnly = [rule('dishes', 'taro', [THURSDAY])];
      first = await saveAs('mother', MONTH, thursdayOnly);
      second = await saveAs('mother', MONTH, thursdayOnly, {
        confirmedChangesHash: detailsOf(first).changesHash,
      });
    });
    Then(
      '最初の応答の一覧では 18 日の行き先が空で、送り直すと 200 になり 18 日の皿洗いは消える',
      () => {
        expect(first.statusCode).toBe(409);
        const eighteenth = detailsOf(first).changes.find((row) => row.date === '2027-01-18');
        expect(eighteenth).toEqual({
          date: '2027-01-18',
          choreTypeId: DISHES,
          fromChildUserId: CHILDREN.hanako.userId,
          toChildUserId: null,
        });
        expect(second.statusCode).toBe(200);
        expect(dutyLines(state.world).some((line) => line.startsWith('01-18'))).toBe(false);
        expect(dutyItems(state.world.calendar).map((d) => d.date)).toContain('2027-01-21');
        expect(storedAssignment(state.world, MONTH)?.rules).toEqual([
          rule('dishes', 'taro', [THURSDAY]),
        ]);
      },
    );
  });

  Scenario('「済」の担当と、割り当てから作った担当は一覧に入らない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、皿洗いは太郎の月曜と木曜の割り当てで、18 日は花子に変えた担当、21 日は次郎が引き受けた担当であり、25 日は次郎が引き受けて「済」になっている',
      () =>
        seedBase(() =>
          seedDuty(state.world.calendar, {
            dutyId: randomUUID(),
            date: '2027-01-25',
            choreTypeId: DISHES,
            childUserId: CHILDREN.jiro.userId,
            status: 'done',
            origin: 'swap',
            version: 4,
          }),
        ),
    );
    When('お母さんが同じ割り当てを、印なしで保存し直す', async () => {
      first = await saveAs('mother', MONTH, sameRules());
    });
    Then(
      '一覧は 18 日と 21 日の 2 行だけで、25 日の「済」と 28 日の割り当てから作った担当は入らない',
      () => {
        expect(first.statusCode).toBe(409);
        expect(detailsOf(first).changes.map((row) => row.date)).toEqual([
          '2027-01-18',
          '2027-01-21',
        ]);
      },
    );
  });

  Scenario('作った印は、入力の行の順番に左右されない', ({ Given, When, Then }) => {
    Given(GIVEN_BASE, () => seedBase());
    When('お母さんが行の順番を入れ替えた 2 つの本文で、保存し直す', async () => {
      first = await saveAs('mother', MONTH, [
        rule('dishes', 'taro', [MONDAY]),
        rule('dishes', 'taro', [THURSDAY]),
      ]);
      second = await saveAs('mother', MONTH, [
        rule('dishes', 'taro', [THURSDAY]),
        rule('dishes', 'taro', [MONDAY]),
      ]);
    });
    Then('どちらの応答も同じ印を返し、その印は一覧の順番を入れ替えても変わらない', () => {
      expect(first.statusCode).toBe(409);
      expect(second.statusCode).toBe(409);
      expect(detailsOf(first).changesHash).toBe(detailsOf(second).changesHash);
      expect(detailsOf(first).changesHash).toBe(
        computeChangesHash(FAMILY_ID, MONTH, [...expectedRows].reverse()),
      );
    });
  });
});
