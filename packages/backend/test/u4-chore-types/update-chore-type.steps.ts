import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { ChoreType } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import * as calendarPort from '../../src/services/calendarPort';
import * as choreTypeService from '../../src/services/choreTypeService';
import {
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
  FAKE_CHORE_TYPE_ID_3,
} from '../fixtures/fakeSecrets';
import { CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  KEY_1,
  PEOPLE,
  seedFamily,
  seedUser,
  type PersonKey,
} from '../u2-invitation/helpers/seed';
import { nameMarkers, OTHER_FAMILY_ID, seedChoreType, summarize, typeItems } from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u4-chore-types/update-chore-type.feature');

const COLLECTION = '/v1/chore-types';
const ID_DISH = FAKE_CHORE_TYPE_ID_1;
const ID_LAUNDRY = FAKE_CHORE_TYPE_ID_2;
const ID_SUZUKI = FAKE_CHORE_TYPE_ID_3;
const NOT_AN_ID = 'not-a-uuid';

const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' } as const;

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];

const typeKey = (id: string, familyId = FAMILY_ID) => `${familyId}#TYPE#${id}`;
const nameKey = (name: string) => `${FAMILY_ID}#NAME#${name}`;

const send = async (
  method: string,
  id: string,
  person: PersonKey,
  body?: unknown,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const result = await call(method, `${COLLECTION}/${id}`, {
    person,
    ...(body !== undefined ? { body } : {}),
  });
  response = result;
  return result;
};
const put = (id: string, body: unknown, person: PersonKey = 'mother') =>
  send('PUT', id, person, body);
const patch = (id: string, body?: unknown, person: PersonKey = 'mother') =>
  send('PATCH', id, person, body);
const del = (id: string, person: PersonKey = 'mother') => send('DELETE', id, person);
/** When の手順用（応答は response に残す） */
const settle = async (action: Promise<unknown>): Promise<void> => {
  await action;
};

const bodyError = (res: APIGatewayProxyStructuredResultV2) =>
  bodyOf<{ error: { reason: string; details?: Record<string, unknown> } }>(res).error;

function seedMother(): void {
  seedFamily(world.families);
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
}

function seedDish(): void {
  seedMother();
  seedChoreType(world.choreTypes, { choreTypeId: ID_DISH, name: '皿洗い', unitPrice: 100 });
}

function seedDishAndLaundry(laundryActive = true): void {
  seedDish();
  seedChoreType(world.choreTypes, {
    choreTypeId: ID_LAUNDRY,
    name: '洗濯物たたみ',
    unitPrice: 50,
    active: laundryActive,
  });
}

function expectDishUnchanged(): void {
  const dish = world.choreTypes.get(typeKey(ID_DISH));
  expect(dish).toMatchObject({ name: '皿洗い', unitPrice: 100, active: true });
  expect(world.choreTypes.get(nameKey('皿洗い'))).toMatchObject({ choreTypeId: ID_DISH });
}

function expectAll(status: number, reason: string): void {
  expect(responses.length).toBeGreaterThan(0);
  for (const res of responses) {
    expect(res.statusCode).toBe(status);
    expect(bodyError(res).reason).toBe(reason);
  }
}

function cancel(...codes: string[]): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    responses = [];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  AfterEachScenario(() => {
    calendarPort.resetCalendarPort();
    vi.restoreAllMocks();
  });

  Scenario('単価を 100 円から 120 円に変えると、C7 が 120 を返す', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
    When('お母さんが皿洗いを名前そのまま、単価 120 に変える', () =>
      settle(put(ID_DISH, { name: '皿洗い', unitPrice: 120 })),
    );
    Then('応答は 200 で、単価 120 円の「皿洗い」が返る', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<ChoreType>(response)).toMatchObject({
        choreTypeId: ID_DISH,
        name: '皿洗い',
        unitPrice: 120,
        active: true,
      });
      expect(bodyOf(response)).not.toHaveProperty('familyId');
    });
    And('C7 の今の単価は 120 を返し、名前の印は 1 つのままである', async () => {
      expect(await choreTypeService.getCurrentUnitPrice(ctx, ID_DISH)).toEqual({
        ok: true,
        value: 120,
      });
      expect(nameMarkers(world.choreTypes)).toHaveLength(1);
    });
  });

  Scenario('名前を変えると、古い名前で別の種類を登録できる', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
    When('お母さんが皿洗いの名前を「食器洗い」に変える', () =>
      settle(put(ID_DISH, { name: '食器洗い', unitPrice: 100 })),
    );
    Then('応答は 200 で、名前「食器洗い」が返る', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<ChoreType>(response).name).toBe('食器洗い');
    });
    And('名前の印は「食器洗い」の 1 つだけで、古い名前の印は残っていない', () => {
      expect(nameMarkers(world.choreTypes).map((m) => m.sk)).toEqual(['NAME#食器洗い']);
      expect(nameMarkers(world.choreTypes)[0]).toMatchObject({ choreTypeId: ID_DISH });
    });
    And('お母さんが名前「皿洗い」で新しい種類を登録すると 201 になる', async () => {
      const created = await call('POST', COLLECTION, {
        person: 'mother',
        key: KEY_1,
        body: { name: '皿洗い', unitPrice: 80 },
      });
      expect(created.statusCode).toBe(201);
      expect(typeItems(world.choreTypes)).toHaveLength(2);
    });
  });

  Scenario('新しい名前がほかの種類と重なると 409 になる', ({ Given, When, Then, And }) => {
    Given(
      '山田家の管理者のお母さんがいて、「使う」種類「皿洗い」と「使わない」種類「洗濯物たたみ」がある',
      () => seedDishAndLaundry(false),
    );
    When('お母さんが皿洗いの名前を「洗濯物たたみ」に変える', () =>
      settle(put(ID_DISH, { name: '洗濯物たたみ', unitPrice: 100 })),
    );
    Then('応答は 409 で理由は CHORE_TYPE_NAME_TAKEN、conflictActive は false になる', () => {
      expect(response.statusCode).toBe(409);
      const error = bodyError(response);
      expect(error.reason).toBe('CHORE_TYPE_NAME_TAKEN');
      expect(error.details).toEqual({ conflictActive: false });
    });
    And('皿洗いの名前と名前の印は変わっていない', expectDishUnchanged);
  });

  Scenario(
    '2 つの種類を同時に同じ名前に変えると、1 つだけが変わる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」と「洗濯物たたみ」がある', () =>
        seedDishAndLaundry(true),
      );
      When('お母さんが皿洗いと洗濯物たたみを同時に名前「お手伝い」に変える', async () => {
        responses = await Promise.all([
          put(ID_DISH, { name: 'お手伝い', unitPrice: 100 }),
          put(ID_LAUNDRY, { name: 'お手伝い', unitPrice: 50 }),
        ]);
      });
      Then('応答は 200 が 1 つと 409 が 1 つで、409 の理由は CHORE_TYPE_NAME_TAKEN になる', () => {
        expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
        const loser = responses.find((r) => r.statusCode === 409);
        expect(bodyError(loser as APIGatewayProxyStructuredResultV2).reason).toBe(
          'CHORE_TYPE_NAME_TAKEN',
        );
      });
      And('名前「お手伝い」の種類は 1 つだけで、名前の印も 2 つのままである', () => {
        expect(typeItems(world.choreTypes).filter((t) => t.name === 'お手伝い')).toHaveLength(1);
        const markers = nameMarkers(world.choreTypes);
        expect(markers).toHaveLength(2);
        expect(markers.filter((m) => m.sk === 'NAME#お手伝い')).toHaveLength(1);
      });
    },
  );

  Scenario(
    '名前を変えない変更の途中で別の要求が名前を変えても、名前と名前の印がずれない',
    ({ Given, And, When, Then }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      And('読んだあとに別の端末が皿洗いの名前を「食器洗い」に変える', () => {
        world.hooks.beforeNextUpdate = () => {
          const dish = world.choreTypes.get(typeKey(ID_DISH));
          if (dish) dish.name = '食器洗い';
          world.choreTypes.delete(nameKey('皿洗い'));
          world.choreTypes.set(nameKey('食器洗い'), {
            familyId: FAMILY_ID,
            sk: 'NAME#食器洗い',
            choreTypeId: ID_DISH,
          });
        };
      });
      When('お母さんが皿洗いを名前そのまま、単価 120 に変える', () =>
        settle(put(ID_DISH, { name: '皿洗い', unitPrice: 120 })),
      );
      Then('応答は 200 で、単価 120 円が返る', () => {
        expect(response.statusCode).toBe(200);
        expect(bodyOf<ChoreType>(response).unitPrice).toBe(120);
      });
      And('種類の名前と同じ名前の印が 1 つだけあり、ほかの名前の印は残っていない', () => {
        const dish = world.choreTypes.get(typeKey(ID_DISH));
        const markers = nameMarkers(world.choreTypes);
        expect(markers).toHaveLength(1);
        expect(markers[0]).toMatchObject({ sk: `NAME#${dish?.name}`, choreTypeId: ID_DISH });
        expect(dish?.unitPrice).toBe(120);
      });
    },
  );

  Scenario('変更の入力が正しくないと 422 で、何も変わらない', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
    When('お母さんが皿洗いを単価 -1、名前の空、説明 101 文字に変えようとする', async () => {
      responses.push(await put(ID_DISH, { name: '皿洗い', unitPrice: -1 }));
      responses.push(await put(ID_DISH, { name: '', unitPrice: 100 }));
      responses.push(
        await put(ID_DISH, { name: '皿洗い', unitPrice: 100, description: 'あ'.repeat(101) }),
      );
    });
    Then(
      '応答は 422 で、理由は INVALID_UNIT_PRICE、INVALID_CHORE_TYPE_NAME、INVALID_DESCRIPTION になる',
      () => {
        expect(responses.map((r) => r.statusCode)).toEqual([422, 422, 422]);
        expect(responses.map((r) => bodyError(r).reason)).toEqual([
          'INVALID_UNIT_PRICE',
          'INVALID_CHORE_TYPE_NAME',
          'INVALID_DESCRIPTION',
        ]);
      },
    );
    And('皿洗いの名前と名前の印は変わっていない', expectDishUnchanged);
  });

  Scenario(
    '「使わない」にすると一覧の下に移り、単価は残り、「使う」に戻せる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」と「洗濯物たたみ」がある', () =>
        seedDishAndLaundry(true),
      );
      When('お母さんが皿洗いを「使わない」にする', () => settle(patch(ID_DISH, { active: false })));
      Then('応答は 200 で、皿洗いは active が false になる', () => {
        expect(response.statusCode).toBe(200);
        expect(bodyOf<ChoreType>(response)).toMatchObject({ choreTypeId: ID_DISH, active: false });
      });
      And('一覧は 洗濯物たたみ、皿洗い（使わない）の順になる', async () => {
        const listed = await call('GET', COLLECTION, { person: 'mother' });
        expect(summarize(bodyOf<ChoreType[]>(listed))).toEqual([
          '洗濯物たたみ 50',
          '皿洗い 100 (使わない)',
        ]);
      });
      And('C7 の一覧は皿洗いを active が false で返し、今の単価は 100 を返す', async () => {
        const all = await choreTypeService.list(ctx);
        expect(all.find((t) => t.choreTypeId === ID_DISH)?.active).toBe(false);
        expect(await choreTypeService.getCurrentUnitPrice(ctx, ID_DISH)).toEqual({
          ok: true,
          value: 100,
        });
      });
      And('お母さんが皿洗いを「使う」に戻すと、一覧の先頭に戻る', async () => {
        const back = await patch(ID_DISH, { active: true });
        expect(back.statusCode).toBe(200);
        const listed = await call('GET', COLLECTION, { person: 'mother' });
        expect(summarize(bodyOf<ChoreType[]>(listed))).toEqual(['皿洗い 100', '洗濯物たたみ 50']);
      });
    },
  );

  Scenario(
    'PATCH の本文が "false"・0・なしなら 422 で、何も変わらない',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      When('お母さんが皿洗いの PATCH に "false"、0、本文なしを送る', async () => {
        responses.push(await patch(ID_DISH, { active: 'false' }));
        responses.push(await patch(ID_DISH, { active: 0 }));
        responses.push(await patch(ID_DISH));
      });
      Then('どの応答も 422 で理由は INVALID_REQUEST になる', () => {
        expect(responses).toHaveLength(3);
        expectAll(422, 'INVALID_REQUEST');
      });
      And('皿洗いは「使う」のままである', expectDishUnchanged);
    },
  );

  Scenario(
    '割り当てに使われていない種類を消すと、一覧からなくなり、同じ名前でまた登録できる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      When('お母さんが皿洗いを消す', () => settle(del(ID_DISH)));
      Then('応答は 204 で、一覧に皿洗いはなく、種類も名前の印もない', async () => {
        expect(response.statusCode).toBe(204);
        const listed = await call('GET', COLLECTION, { person: 'mother' });
        expect(bodyOf<ChoreType[]>(listed)).toEqual([]);
        expect(typeItems(world.choreTypes)).toHaveLength(0);
        expect(nameMarkers(world.choreTypes)).toHaveLength(0);
      });
      And('お母さんが名前「皿洗い」で新しい種類を登録すると 201 になる', async () => {
        const created = await call('POST', COLLECTION, {
          person: 'mother',
          key: KEY_1,
          body: { name: '皿洗い', unitPrice: 100 },
        });
        expect(created.statusCode).toBe(201);
      });
    },
  );

  Scenario(
    '割り当てに使われている種類は消せず、「使わない」のまま残る',
    ({ Given, And, When, Then }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      And('仮のカレンダーの窓口は皿洗いを「使われている」と答える', () => {
        calendarPort.setCalendarPort({ isChoreTypeAssigned: async () => true });
      });
      When('お母さんが皿洗いを消す', () => settle(del(ID_DISH)));
      Then('応答は 409 で理由は CHORE_TYPE_IN_USE になる', () => {
        expect(response.statusCode).toBe(409);
        expect(bodyError(response).reason).toBe('CHORE_TYPE_IN_USE');
      });
      And('皿洗いは「使わない」のまま残り、名前の印も残っている', () => {
        expect(world.choreTypes.get(typeKey(ID_DISH))).toMatchObject({
          name: '皿洗い',
          active: false,
        });
        expect(world.choreTypes.get(nameKey('皿洗い'))).toMatchObject({ choreTypeId: ID_DISH });
      });
    },
  );

  Scenario(
    '消す途中で別の画面が「使う」に戻すと、消さずに 409 CHORE_TYPE_STATE_CHANGED になる',
    ({ Given, And, When, Then }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      And('消す直前に別の画面が皿洗いを「使う」に戻す', () => {
        world.hooks.beforeNextTransaction = () => {
          const dish = world.choreTypes.get(typeKey(ID_DISH));
          if (dish) dish.active = true;
        };
      });
      When('お母さんが皿洗いを消す', () => settle(del(ID_DISH)));
      Then('応答は 409 で理由は CHORE_TYPE_STATE_CHANGED になる', () => {
        expect(response.statusCode).toBe(409);
        expect(bodyError(response).reason).toBe('CHORE_TYPE_STATE_CHANGED');
      });
      And('皿洗いは「使う」のまま残り、名前の印も残っている', expectDishUnchanged);
    },
  );

  Scenario('もう消えた種類を消すと 404 になる', ({ Given, And, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
    And('お母さんが皿洗いを消してある', async () => {
      expect((await del(ID_DISH)).statusCode).toBe(204);
    });
    When('お母さんが皿洗いをもう一度消す', () => settle(del(ID_DISH)));
    Then('応答は 404 で理由は NOT_FOUND になる', () => {
      expect(response.statusCode).toBe(404);
      expect(bodyError(response).reason).toBe('NOT_FOUND');
    });
  });

  Scenario(
    'ほかの家族の種類の ID には、本文が正しくても誤っていても 404 になる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、鈴木家に「使う」種類「風呂掃除」がある', () => {
        seedMother();
        seedChoreType(world.choreTypes, {
          choreTypeId: ID_SUZUKI,
          name: '風呂掃除',
          familyId: OTHER_FAMILY_ID,
        });
      });
      When(
        'お母さんが鈴木家の種類に正しい本文と誤った本文で PUT・PATCH と DELETE を送る',
        async () => {
          responses.push(await put(ID_SUZUKI, { name: '風呂掃除', unitPrice: 1 }));
          responses.push(await put(ID_SUZUKI, { name: '', unitPrice: -1 }));
          responses.push(await patch(ID_SUZUKI, { active: false }));
          responses.push(await patch(ID_SUZUKI, { active: 'x' }));
          responses.push(await del(ID_SUZUKI));
        },
      );
      Then('どの応答も 404 で理由は NOT_FOUND になる', () => {
        expect(responses).toHaveLength(5);
        expectAll(404, 'NOT_FOUND');
      });
      And('鈴木家の種類は変わっていない', () => {
        expect(world.choreTypes.get(typeKey(ID_SUZUKI, OTHER_FAMILY_ID))).toMatchObject({
          name: '風呂掃除',
          unitPrice: 100,
          active: true,
        });
        expect(world.choreTypes.get(`${OTHER_FAMILY_ID}#NAME#風呂掃除`)).toMatchObject({
          choreTypeId: ID_SUZUKI,
        });
      });
      And('C7 の今の単価は鈴木家の種類に対して NOT_FOUND を返す', async () => {
        expect(await choreTypeService.getCurrentUnitPrice(ctx, ID_SUZUKI)).toEqual({
          ok: false,
          reason: 'NOT_FOUND',
        });
      });
    },
  );

  Scenario('形の違う ID は、テーブルを読む前に 404 になる', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
    When('お母さんが形の違う ID に PUT・PATCH・DELETE を送る', async () => {
      responses.push(await put(NOT_AN_ID, { name: '皿洗い', unitPrice: 100 }));
      responses.push(await patch(NOT_AN_ID, { active: false }));
      responses.push(await del(NOT_AN_ID));
    });
    Then('どの応答も 404 で理由は NOT_FOUND になる', () => {
      expect(responses).toHaveLength(3);
      expectAll(404, 'NOT_FOUND');
    });
    And('種類のテーブルは 1 回も読み書きされていない', () => {
      const calls = [GetCommand, UpdateCommand, QueryCommand, TransactWriteCommand].flatMap(
        (command) => world.mock.commandCalls(command as typeof GetCommand),
      );
      const touched = calls.filter((c) =>
        JSON.stringify(c.args[0].input).includes(CHORE_TYPES_TABLE),
      );
      expect(touched).toHaveLength(0);
    });
  });

  Scenario(
    '子供が変更・PATCH・消すをしようとすると 403 で、何も変わらない',
    ({ Given, When, Then, And }) => {
      Given(
        '山田家の管理者のお母さんと子供の太郎さんがいて、「使う」種類「皿洗い」が単価 100 円である',
        () => {
          seedDish();
          seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
        },
      );
      When('太郎さんが皿洗いに PUT・PATCH・DELETE を送る', async () => {
        responses.push(await put(ID_DISH, { name: '食器洗い', unitPrice: 1 }, 'taro'));
        responses.push(await patch(ID_DISH, { active: false }, 'taro'));
        responses.push(await del(ID_DISH, 'taro'));
      });
      Then('どの応答も 403 で理由は ADMIN_ONLY になる', () => {
        expect(responses).toHaveLength(3);
        expectAll(403, 'ADMIN_ONLY');
      });
      And('皿洗いの名前と名前の印は変わっていない', expectDishUnchanged);
    },
  );

  Scenario(
    'トランザクションが思いがけない Code で断られると 500 になる',
    ({ Given, And, When, Then }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」が単価 100 円である', seedDish);
      And('種類のテーブルへのトランザクションは思いがけない Code で断られる', () => {
        world.mock.on(TransactWriteCommand).rejects(cancel('ValidationError', 'None', 'None'));
      });
      When('お母さんが皿洗いの名前を「食器洗い」に変える', async () => {
        responses.push(await put(ID_DISH, { name: '食器洗い', unitPrice: 100 }));
      });
      And('お母さんが皿洗いを消す', async () => {
        responses.push(await del(ID_DISH));
      });
      Then('どちらの応答も 500 で理由は INTERNAL になる', () => {
        expect(responses).toHaveLength(2);
        expectAll(500, 'INTERNAL');
      });
    },
  );
});
