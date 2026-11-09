import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Duty } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect } from 'vitest';
import { onDutyReassigned, type DutyReassignedEvent } from '../../src/services/dutyReassignedHook';
import {
  FAKE_ADMIN_USER_ID,
  FAKE_DUTY_ID_1,
  FAKE_DUTY_ID_2,
  FAKE_DUTY_ID_3,
  FAKE_OTHER_FAMILY_ID,
  FAKE_UPPERCASE_UUID,
} from '../fixtures/fakeSecrets';
import { bodyOf, FAMILY_CREATED_AT, FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  callAs,
  calendarKey,
  CHILDREN,
  CHORES,
  dutyRefSk,
  dutySk,
  seedDuty,
  seedMonthState,
  seedOutsideChild,
  type ChildKey,
} from './helpers/seed';
import {
  beginScenario,
  calendarReads,
  dutyPath,
  endScenario,
  errorOf,
  NOON,
  seedToday,
  type ScenarioState,
} from './helpers/scenario';

const feature = await loadFeature(
  'packages/backend/test/u5-assignment-calendar/change-duty.feature',
);

const MONTH = '2027-01';
const DISHES = CHORES.dishes.choreTypeId;
const GIVEN_TARO_TODO =
  '今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎の「未」の担当である';
const DUTY_ID = FAKE_DUTY_ID_1;

let state: ScenarioState;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let events: DutyReassignedEvent[];

function seedBase(options: Partial<Parameters<typeof seedDuty>[1]> = {}): void {
  seedToday(state, NOON.jan14);
  seedDuty(state.world.calendar, {
    dutyId: DUTY_ID,
    date: '2027-01-18',
    choreTypeId: DISHES,
    childUserId: CHILDREN.taro.userId,
    ...options,
  });
}

const storedDuty = (date = '2027-01-18') =>
  state.world.calendar.get(calendarKey(dutySk(MONTH, date, DISHES)));

const change = (actor: 'mother' | ChildKey, child: ChildKey, dutyId = DUTY_ID) =>
  callAs(actor, 'PATCH', dutyPath(dutyId), { childUserId: CHILDREN[child].userId });

const dutyOf = (res: APIGatewayProxyStructuredResultV2) => bodyOf<Duty>(res);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
    responses = [];
    events = [];
  });
  AfterEachScenario(() => {
    endScenario();
  });

  Scenario(
    '「未」の担当の子供を変えると、手で変えた担当になり version が 1 増える',
    ({ Given, When, Then, And }) => {
      Given(GIVEN_TARO_TODO, () => seedBase());
      When('お母さんが 18 日の皿洗いの担当を花子に変える', async () => {
        response = await change('mother', 'hanako');
      });
      Then(
        '応答は 200 で、担当は花子、origin は manual、version は 2、種類の名前は皿洗いである',
        () => {
          expect(response.statusCode).toBe(200);
          expect(dutyOf(response)).toMatchObject({
            dutyId: DUTY_ID,
            date: '2027-01-18',
            childUserId: CHILDREN.hanako.userId,
            origin: 'manual',
            version: 2,
            status: 'todo',
            choreName: '皿洗い',
          });
        },
      );
      And('保存された担当も花子で manual の version 2 になり、取引は 1 回である', () => {
        expect(storedDuty()).toMatchObject({
          childUserId: CHILDREN.hanako.userId,
          origin: 'manual',
          version: 2,
        });
        expect(state.world.hooks.transactionSizes).toEqual([2]);
      });
    },
  );

  Scenario('「済」や「×」の担当は変えられない', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎が「済」、21 日の皿洗いは太郎が「×」である',
      () => {
        seedBase({ status: 'done' });
        seedDuty(state.world.calendar, {
          dutyId: FAKE_DUTY_ID_2,
          date: '2027-01-21',
          choreTypeId: DISHES,
          childUserId: CHILDREN.taro.userId,
          status: 'skipped',
        });
      },
    );
    When('お母さんが 18 日と 21 日の皿洗いの担当をそれぞれ花子に変えようとする', async () => {
      responses.push(await change('mother', 'hanako', DUTY_ID));
      responses.push(await change('mother', 'hanako', FAKE_DUTY_ID_2));
    });
    Then('どちらも 409 で理由は DUTY_NOT_TODO、担当は変わらず取引は 0 回である', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([409, 409]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(['DUTY_NOT_TODO', 'DUTY_NOT_TODO']);
      expect(storedDuty()?.childUserId).toBe(CHILDREN.taro.userId);
      expect(storedDuty('2027-01-21')?.childUserId).toBe(CHILDREN.taro.userId);
      expect(state.world.hooks.transactionSizes).toEqual([]);
    });
  });

  Scenario('確定した月の担当は、同じ子供を指定しても 409 になる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎の「未」の担当であり、1 月は確定している',
      () => {
        seedBase();
        seedMonthState(state.world.calendar, MONTH, true);
      },
    );
    When(
      'お母さんが 18 日の皿洗いの担当を花子に変えようとし、続けて太郎のままにしようとする',
      async () => {
        responses.push(await change('mother', 'hanako'));
        responses.push(await change('mother', 'taro'));
      },
    );
    Then('どちらも 409 で理由は MONTH_CONFIRMED、担当は変わらず取引は 0 回である', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([409, 409]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual([
        'MONTH_CONFIRMED',
        'MONTH_CONFIRMED',
      ]);
      expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
      expect(state.world.hooks.transactionSizes).toEqual([]);
    });
  });

  Scenario('同じ子供を指定すると、何も書かず version も変わらない', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When('お母さんが 18 日の皿洗いの担当を太郎のままにする', async () => {
      response = await change('mother', 'taro');
    });
    Then(
      '応答は 200 で、担当は太郎、origin は rule、version は 1 のまま、取引は 0 回である',
      () => {
        expect(response.statusCode).toBe(200);
        expect(dutyOf(response)).toMatchObject({
          childUserId: CHILDREN.taro.userId,
          origin: 'rule',
          version: 1,
        });
        expect(state.world.hooks.transactionSizes).toEqual([]);
      },
    );
  });

  Scenario('過ぎた日の「未」の担当も、確定していなければ変えられる', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 14 日（木）で、10 日の皿洗いは太郎の「未」の担当である', () => {
      seedBase({ date: '2027-01-10' });
    });
    When('お母さんが 10 日の皿洗いの担当を次郎に変える', async () => {
      response = await change('mother', 'jiro');
    });
    Then('応答は 200 で、担当は次郎になる', () => {
      expect(response.statusCode).toBe(200);
      expect(storedDuty('2027-01-10')?.childUserId).toBe(CHILDREN.jiro.userId);
    });
  });

  Scenario('子供が変えようとすると 403 になり、何も読まない', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When('太郎が 18 日の皿洗いの担当を花子に変えようとする', async () => {
      state.world.hooks.readLog.length = 0;
      response = await change('taro', 'hanako');
    });
    Then('応答は 403 で理由は ADMIN_ONLY、Calendar は読まれず担当は変わらない', () => {
      expect(response.statusCode).toBe(403);
      expect(errorOf(response).reason).toBe('ADMIN_ONLY');
      expect(calendarReads(state.world)).toEqual([]);
      expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
    });
  });

  Scenario(
    'ほかの家族の担当の ID は、本文が正しくても誤っていても 404 になる',
    ({ Given, When, Then }) => {
      Given(
        '今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎の「未」の担当であり、ほかの家族にも担当がある',
        () => {
          seedBase();
          seedDuty(state.world.calendar, {
            dutyId: FAKE_DUTY_ID_2,
            date: '2027-01-18',
            choreTypeId: DISHES,
            childUserId: CHILDREN.taro.userId,
            familyId: FAKE_OTHER_FAMILY_ID,
          });
        },
      );
      When(
        'お母さんがほかの家族の担当を、正しい本文と誤った本文でそれぞれ変えようとする',
        async () => {
          responses.push(await change('mother', 'hanako', FAKE_DUTY_ID_2));
          responses.push(await callAs('mother', 'PATCH', dutyPath(FAKE_DUTY_ID_2), { wrong: 1 }));
        },
      );
      Then('どちらも 404 で理由は NOT_FOUND、ほかの家族の担当は変わらない', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([404, 404]);
        expect(responses.map((r) => errorOf(r).reason)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
        const other = state.world.calendar.get(
          calendarKey(dutySk(MONTH, '2027-01-18', DISHES), FAKE_OTHER_FAMILY_ID),
        );
        expect(other).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
        expect(state.world.hooks.transactionSizes).toEqual([]);
      });
    },
  );

  Scenario('形の違う担当の ID は、DynamoDB を読まずに 404 になる', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When(
      'お母さんが大文字の UUID と UUID でない文字列を担当の ID にして変えようとする',
      async () => {
        state.world.hooks.readLog.length = 0;
        responses.push(await change('mother', 'hanako', FAKE_UPPERCASE_UUID));
        responses.push(await change('mother', 'hanako', 'not-a-duty-id'));
      },
    );
    Then('どちらも 404 で理由は NOT_FOUND、Calendar は読まれない', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([404, 404]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
      expect(calendarReads(state.world)).toEqual([]);
    });
  });

  Scenario('ほかの家族の子供と管理者の ID は 404 になる', ({ Given, When, Then }) => {
    Given(
      '今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎の「未」の担当であり、次郎はほかの家族の子供で、もう 1 人の管理者がいる',
      () => {
        seedBase();
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
      'お母さんが 18 日の皿洗いの担当をほかの家族の子供、もう 1 人の管理者に変えようとする',
      async () => {
        responses.push(await change('mother', 'jiro'));
        responses.push(
          await callAs('mother', 'PATCH', dutyPath(DUTY_ID), { childUserId: FAKE_ADMIN_USER_ID }),
        );
      },
    );
    Then('どちらも 404 で理由は NOT_FOUND、担当は変わらない', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([404, 404]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
      expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
    });
  });

  Scenario('本文がない、数、childUserId がない本文は 422 になる', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When('お母さんが本文なし、数、childUserId のない本文で変えようとする', async () => {
      responses.push(await callAs('mother', 'PATCH', dutyPath(DUTY_ID)));
      responses.push(await callAs('mother', 'PATCH', dutyPath(DUTY_ID), 5));
      responses.push(await callAs('mother', 'PATCH', dutyPath(DUTY_ID), { other: 'x' }));
    });
    Then('いずれも 422 で理由は INVALID_REQUEST、担当は変わらない', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([422, 422, 422]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual([
        'INVALID_REQUEST',
        'INVALID_REQUEST',
        'INVALID_REQUEST',
      ]);
      expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
    });
  });

  Scenario('書き込みの直前に記録が入ると、409 DUTY_NOT_TODO になる', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When(
      'お母さんが 18 日の皿洗いの担当を花子に変えようとし、読んだあとに太郎が「済」の記録を入れる',
      async () => {
        state.world.hooks.beforeTransaction(1, () => {
          const duty = storedDuty();
          if (duty) Object.assign(duty, { status: 'done', version: 2 });
        });
        response = await change('mother', 'hanako');
      },
    );
    Then('応答は 409 で理由は DUTY_NOT_TODO、担当は太郎の「済」のままである', () => {
      expect(response.statusCode).toBe(409);
      expect(errorOf(response).reason).toBe('DUTY_NOT_TODO');
      expect(storedDuty()).toMatchObject({
        childUserId: CHILDREN.taro.userId,
        status: 'done',
        version: 2,
      });
    });
  });

  Scenario(
    '書き込みの直前に月の確定が入ると、409 MONTH_CONFIRMED になる',
    ({ Given, When, Then }) => {
      Given(GIVEN_TARO_TODO, () => seedBase());
      When(
        'お母さんが 18 日の皿洗いの担当を花子に変えようとし、読んだあとに 1 月が確定する',
        async () => {
          state.world.hooks.beforeTransaction(1, () =>
            seedMonthState(state.world.calendar, MONTH, true),
          );
          response = await change('mother', 'hanako');
        },
      );
      Then('応答は 409 で理由は MONTH_CONFIRMED、担当は太郎のままである', () => {
        expect(response.statusCode).toBe(409);
        expect(errorOf(response).reason).toBe('MONTH_CONFIRMED');
        expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
      });
    },
  );

  Scenario(
    '書き込みの直前に引き受けが入ると、読み直して 1 回だけやり直して書ける',
    ({ Given, When, Then }) => {
      Given(GIVEN_TARO_TODO, () => seedBase());
      When(
        'お母さんが 18 日の皿洗いの担当を花子に変えようとし、読んだあとに次郎が引き受ける',
        async () => {
          onDutyReassigned(async (event) => {
            events.push(event);
          });
          state.world.hooks.beforeTransaction(1, () => {
            const duty = storedDuty();
            if (duty) {
              Object.assign(duty, {
                childUserId: CHILDREN.jiro.userId,
                origin: 'swap',
                version: 2,
              });
            }
          });
          response = await change('mother', 'hanako');
        },
      );
      Then(
        '応答は 200 で、担当は花子の version 3 になり、取引は 2 回で、通知の元の子供は次郎である',
        () => {
          expect(response.statusCode).toBe(200);
          expect(dutyOf(response)).toMatchObject({
            childUserId: CHILDREN.hanako.userId,
            origin: 'manual',
            version: 3,
          });
          expect(state.world.hooks.transactionSizes).toEqual([2, 2]);
          expect(events).toHaveLength(1);
          expect(events[0]).toMatchObject({
            kind: 'child-changed',
            fromChildUserId: CHILDREN.jiro.userId,
            toChildUserId: CHILDREN.hanako.userId,
            newOrigin: 'manual',
          });
        },
      );
    },
  );

  Scenario(
    '読み直したら、すでに呼ばれた子供になっていれば、書かずに返す',
    ({ Given, When, Then }) => {
      Given(GIVEN_TARO_TODO, () => seedBase());
      When(
        'お母さんが 18 日の皿洗いの担当を花子に変えようとし、読んだあとに別の人が花子に変える',
        async () => {
          onDutyReassigned(async (event) => {
            events.push(event);
          });
          state.world.hooks.beforeTransaction(1, () => {
            const duty = storedDuty();
            if (duty) {
              Object.assign(duty, {
                childUserId: CHILDREN.hanako.userId,
                origin: 'manual',
                version: 2,
              });
            }
          });
          response = await change('mother', 'hanako');
        },
      );
      Then('応答は 200 で、担当は花子の version 2 のまま、取引は 1 回で、通知は呼ばれない', () => {
        expect(response.statusCode).toBe(200);
        expect(dutyOf(response)).toMatchObject({
          childUserId: CHILDREN.hanako.userId,
          version: 2,
        });
        expect(state.world.hooks.transactionSizes).toEqual([2]);
        expect(events).toEqual([]);
      });
    },
  );

  Scenario(
    '書き込みの直前に担当が消されて作り直されると、別の担当は変わらず 404 になる',
    ({ Given, When, Then }) => {
      Given(GIVEN_TARO_TODO, () => seedBase());
      When(
        'お母さんが 18 日の皿洗いの担当を花子に変えようとし、読んだあとに担当が消されて作り直される',
        async () => {
          state.world.hooks.beforeTransaction(1, () => {
            state.world.calendar.delete(calendarKey(dutySk(MONTH, '2027-01-18', DISHES)));
            state.world.calendar.delete(calendarKey(dutyRefSk(DUTY_ID)));
            seedDuty(state.world.calendar, {
              dutyId: FAKE_DUTY_ID_3,
              date: '2027-01-18',
              choreTypeId: DISHES,
              childUserId: CHILDREN.taro.userId,
            });
          });
          response = await change('mother', 'hanako');
        },
      );
      Then('応答は 404 で理由は NOT_FOUND、作り直された担当は太郎の version 1 のままである', () => {
        expect(response.statusCode).toBe(404);
        expect(errorOf(response).reason).toBe('NOT_FOUND');
        expect(storedDuty()).toMatchObject({
          dutyId: FAKE_DUTY_ID_3,
          childUserId: CHILDREN.taro.userId,
          version: 1,
        });
      });
    },
  );

  Scenario('競合が続くと 500、思いがけない失敗の Code でも 500 になる', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When(
      'お母さんが 18 日の皿洗いの担当を、取引が 2 回続けて競合したときと、ThrottlingError で断られたときに変えようとする',
      async () => {
        state.world.hooks.failTransaction(1, 'TransactionConflict');
        state.world.hooks.failTransaction(2, 'TransactionConflict');
        responses.push(await change('mother', 'hanako'));
        state.world.hooks.failTransaction(3, 'ThrottlingError');
        responses.push(await change('mother', 'hanako'));
      },
    );
    Then('どちらも 500 で理由は INTERNAL、担当は変わらない', () => {
      expect(responses.map((r) => r.statusCode)).toEqual([500, 500]);
      expect(responses.map((r) => errorOf(r).reason)).toEqual(['INTERNAL', 'INTERNAL']);
      expect(storedDuty()).toMatchObject({ childUserId: CHILDREN.taro.userId, version: 1 });
      // 競合は読み直して 2 回、思いがけない Code は読み直さず 1 回
      expect(state.world.hooks.transactionSizes).toHaveLength(3);
    });
  });

  Scenario('書けたあとに onDutyReassigned が呼ばれ、ログに残る', ({ Given, When, Then }) => {
    Given(GIVEN_TARO_TODO, () => seedBase());
    When(
      'お母さんが 18 日の皿洗いの担当を花子に変えるが、登録された通知の関数は投げる',
      async () => {
        onDutyReassigned(async (event) => {
          events.push(event);
          expect(storedDuty()?.childUserId).toBe(CHILDREN.hanako.userId);
          throw new Error('hook failed');
        });
        response = await change('mother', 'hanako');
      },
    );
    Then(
      '応答は 200 で、通知は書けたあとの担当を見て 1 回呼ばれ、DUTY_CHILD_CHANGED と DUTY_HOOK_FAILED がログに出て、名前は出ない',
      () => {
        expect(response.statusCode).toBe(200);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ dutyId: DUTY_ID, kind: 'child-changed' });
        const names = state.logs.map((line) => line.event);
        expect(names).toContain('DUTY_CHILD_CHANGED');
        expect(names).toContain('DUTY_HOOK_FAILED');
        const text = JSON.stringify(state.logs);
        expect(text).not.toContain('皿洗い');
        expect(text).not.toContain('花子');
        expect(text).not.toContain('太郎');
      },
    );
  });

  Scenario('断られたときのログに DUTY_CHANGE_REJECTED が出る', ({ Given, When, Then }) => {
    Given('今日は 2027 年 1 月 14 日（木）で、18 日の皿洗いは太郎が「済」である', () => {
      seedBase({ status: 'done' });
    });
    When('お母さんが 18 日の皿洗いの担当を花子に変えようとする', async () => {
      response = await change('mother', 'hanako');
    });
    Then('DUTY_CHANGE_REJECTED が理由 DUTY_NOT_TODO つきでログに出る', () => {
      expect(response.statusCode).toBe(409);
      expect(state.logs.find((line) => line.event === 'DUTY_CHANGE_REJECTED')).toMatchObject({
        reason: 'DUTY_NOT_TODO',
        dutyId: DUTY_ID,
      });
    });
  });
});
