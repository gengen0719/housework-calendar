import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { ChoreType } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  KEY_1,
  seedFamily,
  seedUser,
  type PersonKey,
} from '../u2-invitation/helpers/seed';
import { nameMarkers, OTHER_FAMILY_ID, seedChoreType, summarize, typeItems } from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u4-chore-types/create-chore-type.feature');

const PATH = '/v1/chore-types';

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let logs: string[];

function seedMother(): void {
  seedFamily(world.families);
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
}

function seedTaro(): void {
  seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
}

/** key が null のときは Idempotency-Key を付けない。 */
const post = async (person: PersonKey, body: unknown, key: string | null = KEY_1) => {
  const result = await call('POST', PATH, { person, body, ...(key ? { key } : {}) });
  response = result;
  return result;
};

/** When の手順用（応答は response に残す）。 */
const submit = async (person: PersonKey, body: unknown, key: string | null = KEY_1) => {
  await post(person, body, key);
};

const list = async (person: PersonKey) => {
  response = await call('GET', PATH, { person });
  return response;
};

const bodyError = (res: APIGatewayProxyStructuredResultV2) =>
  bodyOf<{ error: { reason: string; details?: Record<string, unknown> } }>(res).error;

function expectNothingRegistered(): void {
  expect(typeItems(world.choreTypes)).toHaveLength(0);
  expect(nameMarkers(world.choreTypes)).toHaveLength(0);
}

function expectOnlyDishes(): void {
  const types = typeItems(world.choreTypes);
  expect(types).toHaveLength(1);
  expect(types[0]?.name).toBe('皿洗い');
  expect(nameMarkers(world.choreTypes)).toHaveLength(1);
}

function expectNameTaken(active: boolean): void {
  expect(response.statusCode).toBe(409);
  const error = bodyError(response);
  expect(error.reason).toBe('CHORE_TYPE_NAME_TAKEN');
  expect(error.details).toEqual({ conflictActive: active });
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    responses = [];
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
  });
  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });

  const givenMotherAlone = () => seedMother();

  Scenario(
    '管理者が「皿洗い 100 円」を説明つきで登録すると、一覧に出る',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      When('お母さんが名前「皿洗い」、単価 100、説明「夕食のあと」で種類を登録する', () =>
        submit('mother', { name: '皿洗い', unitPrice: 100, description: '夕食のあと' }),
      );
      Then('応答は 201 で、使う種類「皿洗い」の単価 100 円と説明が返る', () => {
        expect(response.statusCode).toBe(201);
        const created = bodyOf<ChoreType>(response);
        expect(created).toMatchObject({
          name: '皿洗い',
          unitPrice: 100,
          description: '夕食のあと',
          active: true,
        });
        expect(created.choreTypeId).toMatch(/^[0-9a-f-]{36}$/);
        expect(created).not.toHaveProperty('familyId');
      });
      And('お母さんが一覧を見ると「皿洗い 100 円」が 1 件だけ出る', async () => {
        const res = await list('mother');
        expect(res.statusCode).toBe(200);
        expect(summarize(bodyOf<ChoreType[]>(res))).toEqual(['皿洗い 100']);
      });
    },
  );

  Scenario(
    '単価に -1、1.5、空、文字列を入れると 422 で、何も登録されない',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      When('お母さんが単価に -1、1.5、空、"100" を入れて種類を登録する', async () => {
        for (const unitPrice of [-1, 1.5, '', '100']) {
          responses.push(await post('mother', { name: '皿洗い', unitPrice }));
        }
      });
      Then('どの応答も 422 で理由は INVALID_UNIT_PRICE になる', () => {
        expect(responses).toHaveLength(4);
        for (const res of responses) {
          expect(res.statusCode).toBe(422);
          expect(bodyError(res).reason).toBe('INVALID_UNIT_PRICE');
        }
      });
      And('種類もその名前の印も 1 つも登録されていない', expectNothingRegistered);
    },
  );

  Scenario(
    '名前が空・21 文字・改行入り、説明が 101 文字なら 422 になる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      When('お母さんが名前の空・21 文字・改行入りと、説明 101 文字で種類を登録する', async () => {
        for (const name of ['', 'あ'.repeat(21), '皿\n洗い']) {
          responses.push(await post('mother', { name, unitPrice: 100 }));
        }
        responses.push(
          await post('mother', { name: '皿洗い', unitPrice: 100, description: 'あ'.repeat(101) }),
        );
      });
      Then('名前の 3 つは 422 で理由は INVALID_CHORE_TYPE_NAME になる', () => {
        for (const res of responses.slice(0, 3)) {
          expect(res.statusCode).toBe(422);
          expect(bodyError(res).reason).toBe('INVALID_CHORE_TYPE_NAME');
        }
      });
      And('説明は 422 で理由は INVALID_DESCRIPTION になる', () => {
        expect(responses[3]?.statusCode).toBe(422);
        expect(bodyError(responses[3] as APIGatewayProxyStructuredResultV2).reason).toBe(
          'INVALID_DESCRIPTION',
        );
      });
      And('種類もその名前の印も 1 つも登録されていない', expectNothingRegistered);
    },
  );

  Scenario(
    '同じ名前の「使う」種類があると 409 で、別の名前を勧める手がかりが返る',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」がある', () => {
        seedMother();
        seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い' });
      });
      When('お母さんが名前「皿洗い」で種類を登録する', () =>
        submit('mother', { name: '皿洗い', unitPrice: 100 }),
      );
      Then('応答は 409 で理由は CHORE_TYPE_NAME_TAKEN、conflictActive は true になる', () =>
        expectNameTaken(true),
      );
      And('種類は「皿洗い」の 1 件のままである', expectOnlyDishes);
    },
  );

  Scenario(
    '同じ名前の「使わない」種類があると 409 で、「使う」に戻す手がかりが返る',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、「使わない」種類「皿洗い」がある', () => {
        seedMother();
        seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い', active: false });
      });
      When('お母さんが名前「皿洗い」で種類を登録する', () =>
        submit('mother', { name: '皿洗い', unitPrice: 100 }),
      );
      Then('応答は 409 で理由は CHORE_TYPE_NAME_TAKEN、conflictActive は false になる', () =>
        expectNameTaken(false),
      );
      And('種類は「皿洗い」の 1 件のままである', expectOnlyDishes);
    },
  );

  Scenario('前後の空白だけが違う名前も同じ名前として断られる', ({ Given, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」がある', () => {
      seedMother();
      seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い' });
    });
    When('お母さんが名前「　皿洗い 」で種類を登録する', () =>
      submit('mother', { name: '　皿洗い ', unitPrice: 100 }),
    );
    Then('応答は 409 で理由は CHORE_TYPE_NAME_TAKEN、conflictActive は true になる', () =>
      expectNameTaken(true),
    );
  });

  Scenario(
    '同じ名前で 2 つ同時に登録すると、1 つだけが登録される',
    ({ Given, And, When, Then }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      And('読んだあとに別の端末が同じ名前「皿洗い」を先に登録する', () => {
        world.hooks.beforeNextTransaction = () =>
          seedChoreType(world.choreTypes, { choreTypeId: 'type-other-device', name: '皿洗い' });
      });
      When('お母さんが名前「皿洗い」で種類を登録する', () =>
        submit('mother', { name: '皿洗い', unitPrice: 100 }),
      );
      Then('応答は 409 で理由は CHORE_TYPE_NAME_TAKEN、conflictActive は true になる', () =>
        expectNameTaken(true),
      );
      And('種類は「皿洗い」の 1 件だけである', () => {
        expectOnlyDishes();
        expect(typeItems(world.choreTypes)[0]?.choreTypeId).toBe('type-other-device');
      });
    },
  );

  Scenario('子供が登録しようとすると 403 で、何も変わらない', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんと子供の太郎さんがいて、お手伝いの種類はまだない', () => {
      seedMother();
      seedTaro();
    });
    When('太郎さんが名前「皿洗い」で種類を登録する', () =>
      submit('taro', { name: '皿洗い', unitPrice: 100 }),
    );
    Then('応答は 403 で理由は ADMIN_ONLY になる', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyError(response).reason).toBe('ADMIN_ONLY');
    });
    And('種類もその名前の印も 1 つも登録されていない', expectNothingRegistered);
  });

  Scenario(
    '同じ Idempotency-Key で 2 回送っても、種類は 1 つだけ',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      When(
        'お母さんが同じ Idempotency-Key で名前「皿洗い」、単価 100 の登録を 2 回送る',
        async () => {
          responses.push(await post('mother', { name: '皿洗い', unitPrice: 100 }, KEY_1));
          responses.push(await post('mother', { name: '皿洗い', unitPrice: 100 }, KEY_1));
        },
      );
      Then('2 回とも 201 で、同じ種類が返る', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
        const [first, second] = responses.map((r) => bodyOf<ChoreType>(r));
        expect(second).toEqual(first);
      });
      And('種類は「皿洗い」の 1 件だけである', expectOnlyDishes);
    },
  );

  Scenario(
    '同じ Idempotency-Key で本文が違うと 422 IDEMPOTENCY_KEY_REUSED になる',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
      When(
        'お母さんが同じ Idempotency-Key で、名前「皿洗い」のあとに名前「洗濯物たたみ」を送る',
        async () => {
          responses.push(await post('mother', { name: '皿洗い', unitPrice: 100 }, KEY_1));
          responses.push(await post('mother', { name: '洗濯物たたみ', unitPrice: 100 }, KEY_1));
        },
      );
      Then('2 回目の応答は 422 で理由は IDEMPOTENCY_KEY_REUSED になる', () => {
        expect(responses[0]?.statusCode).toBe(201);
        expect(responses[1]?.statusCode).toBe(422);
        expect(bodyError(responses[1] as APIGatewayProxyStructuredResultV2).reason).toBe(
          'IDEMPOTENCY_KEY_REUSED',
        );
      });
      And('種類は「皿洗い」の 1 件だけである', expectOnlyDishes);
    },
  );

  Scenario('Idempotency-Key がないと 400 で、何も登録されない', ({ Given, When, Then, And }) => {
    Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
    When('お母さんが Idempotency-Key なしで名前「皿洗い」の登録を送る', () =>
      submit('mother', { name: '皿洗い', unitPrice: 100 }, null),
    );
    Then('応答は 400 で理由は IDEMPOTENCY_KEY_REQUIRED になる', () => {
      expect(response.statusCode).toBe(400);
      expect(bodyError(response).reason).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
    And('種類もその名前の印も 1 つも登録されていない', expectNothingRegistered);
  });

  Scenario(
    '一覧は「使う」を登録した順に並べ、そのあとに「使わない」を並べる',
    ({ Given, And, When, Then }) => {
      Given(
        '山田家の管理者のお母さんがいて、皿洗い・洗濯物たたみ・お風呂掃除を順に登録してある',
        () => {
          seedMother();
          seedChoreType(world.choreTypes, {
            choreTypeId: 'type-c',
            name: '皿洗い',
            createdAt: '2026-11-01T00:00:00.000Z',
          });
          seedChoreType(world.choreTypes, {
            choreTypeId: 'type-a',
            name: '洗濯物たたみ',
            unitPrice: 50,
            createdAt: '2026-11-02T00:00:00.000Z',
          });
          seedChoreType(world.choreTypes, {
            choreTypeId: 'type-b',
            name: 'お風呂掃除',
            unitPrice: 200,
            createdAt: '2026-11-03T00:00:00.000Z',
          });
        },
      );
      And('洗濯物たたみは「使わない」になっている', () => {
        const item = world.choreTypes.get(`${FAMILY_ID}#TYPE#type-a`);
        if (item) item.active = false;
      });
      When('お母さんが一覧を見る', async () => {
        await list('mother');
      });
      Then(
        '一覧は 皿洗い、お風呂掃除、洗濯物たたみ の順で、洗濯物たたみだけが「使わない」になっている',
        () => {
          expect(response.statusCode).toBe(200);
          expect(summarize(bodyOf<ChoreType[]>(response))).toEqual([
            '皿洗い 100',
            'お風呂掃除 200',
            '洗濯物たたみ 50 (使わない)',
          ]);
        },
      );
    },
  );

  Scenario('子供も一覧を見られる', ({ Given, When, Then }) => {
    Given('山田家の管理者のお母さんと子供の太郎さんがいて、「使う」種類「皿洗い」がある', () => {
      seedMother();
      seedTaro();
      seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い' });
    });
    When('太郎さんが一覧を見る', async () => {
      await list('taro');
    });
    Then('応答は 200 で「皿洗い」が返る', () => {
      expect(response.statusCode).toBe(200);
      expect(summarize(bodyOf<ChoreType[]>(response))).toEqual(['皿洗い 100']);
    });
  });

  Scenario('家族のメンバーでない人は一覧を見られない', ({ Given, And, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」がある', () => {
      seedMother();
      seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い' });
    });
    And('家族に入っていない花子さんがいる', () => {
      seedUser(world.users, 'hanako');
    });
    When('花子さんが一覧を見る', async () => {
      await list('hanako');
    });
    Then('応答は 403 で理由は NOT_FAMILY_MEMBER になり、種類は返らない', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyError(response).reason).toBe('NOT_FAMILY_MEMBER');
      expect(String(response.body)).not.toContain('皿洗い');
    });
  });

  Scenario('ほかの家族の種類は一覧に出ない', ({ Given, And, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類「皿洗い」がある', () => {
      seedMother();
      seedChoreType(world.choreTypes, { choreTypeId: 'type-1', name: '皿洗い' });
    });
    And('鈴木家に「使う」種類「風呂掃除」がある', () => {
      seedChoreType(world.choreTypes, {
        choreTypeId: 'type-suzuki',
        name: '風呂掃除',
        familyId: OTHER_FAMILY_ID,
      });
    });
    When('お母さんが一覧を見る', async () => {
      await list('mother');
    });
    Then('一覧には「皿洗い」だけが出て、「風呂掃除」は出ない', () => {
      expect(summarize(bodyOf<ChoreType[]>(response))).toEqual(['皿洗い 100']);
      expect(String(response.body)).not.toContain('風呂掃除');
    });
  });

  Scenario('一覧は続きのある読み取りでも全件がそろう', ({ Given, And, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、「使う」種類が 5 件ある', () => {
      seedMother();
      for (let i = 1; i <= 5; i++) {
        seedChoreType(world.choreTypes, {
          choreTypeId: `type-${i}`,
          name: `お手伝い${i}`,
          createdAt: `2026-11-0${i}T00:00:00.000Z`,
        });
      }
    });
    And('テーブルは 2 件ずつ区切って返す', () => {
      world.hooks.queryPageSize = 2;
    });
    When('お母さんが一覧を見る', async () => {
      await list('mother');
    });
    Then('5 件すべてが返り、読み取りは 3 回に分かれている', () => {
      expect(bodyOf<ChoreType[]>(response)).toHaveLength(5);
      expect(world.mock.commandCalls(QueryCommand)).toHaveLength(3);
    });
  });

  Scenario('ログに種類の名前と説明が出ない', ({ Given, When, Then }) => {
    Given('山田家の管理者のお母さんがいて、お手伝いの種類はまだない', givenMotherAlone);
    When(
      'お母さんが名前「ひみつの皿洗い」、説明「ひみつの説明」で種類を登録して、一覧を見る',
      async () => {
        await post('mother', {
          name: 'ひみつの皿洗い',
          unitPrice: 100,
          description: 'ひみつの説明',
        });
        await list('mother');
      },
    );
    Then('ログに CHORE_TYPE_CREATED があり、名前と説明はどのログにも出ていない', () => {
      const created = logs.filter((line) => line.includes('CHORE_TYPE_CREATED'));
      expect(created).toHaveLength(1);
      expect(JSON.parse(created[0] as string)).toMatchObject({
        familyId: FAMILY_ID,
        unitPrice: 100,
      });
      expect(logs.length).toBeGreaterThan(1);
      for (const line of logs) {
        expect(line).not.toContain('ひみつ');
      }
    });
  });
});
