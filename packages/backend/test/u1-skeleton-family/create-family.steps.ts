import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/api';
import type { User } from '../../src/models';
import { signSession } from '../../src/services/tokenService';
import {
  apiRequest,
  HANAKO_LINE_ID,
  setupWorld,
  SIGNING_SECRET,
  stubLineFetch,
} from './helpers/world';
import { FAKE_IDEMPOTENCY_KEY_1, FAKE_NOT_A_UUID_IDEMPOTENCY_KEY } from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u1-skeleton-family/create-family.feature');

type World = ReturnType<typeof setupWorld>;
let world: World;
let response: APIGatewayProxyStructuredResultV2;
let firstResponse: APIGatewayProxyStructuredResultV2 | undefined;
let responses: APIGatewayProxyStructuredResultV2[];
let sessionToken: string;
let currentKey: string;

const START = new Date('2026-11-01T00:00:00.000Z');
const HANAKO_USER_ID = 'user-hanako';
const KEY_1 = FAKE_IDEMPOTENCY_KEY_1;

function seedHanako(withFamily: boolean): void {
  const user: User = {
    userId: HANAKO_USER_ID,
    lineUserId: HANAKO_LINE_ID,
    displayName: '花子',
    friendStatus: 'friend',
    registeredAt: '2026-11-01T00:00:00.000Z',
    friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
    ...(withFamily ? { familyId: 'fam-yamada', role: 'child' as const } : {}),
  };
  world.users.set(user.userId, { ...user });
  if (withFamily) {
    world.families.set('fam-yamada', {
      familyId: 'fam-yamada',
      name: '山田家',
      adminUserId: 'user-mother',
      createdAt: '2026-11-01T00:00:00.000Z',
    });
  }
  sessionToken = signSession(HANAKO_USER_ID, SIGNING_SECRET).token;
}

interface FamilyBody {
  familyId?: string;
  name?: string;
  role?: string;
  family?: { familyId: string; name: string; role: string } | null;
  error?: { reason: string };
}

function bodyOf(res: APIGatewayProxyStructuredResultV2 = response): FamilyBody {
  return JSON.parse(String(res.body)) as FamilyBody;
}

async function postFamily(
  name: string,
  headers: Record<string, string>,
): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(
    apiRequest('POST', '/v1/families', { body: { name }, token: sessionToken, headers }),
  )) as APIGatewayProxyStructuredResultV2;
}

async function createWithKey(name: string, key: string): Promise<void> {
  currentKey = key;
  response = await postFamily(name, { 'idempotency-key': key });
}

function hanako(): Record<string, unknown> {
  return world.users.get(HANAKO_USER_ID) as Record<string, unknown>;
}

function expectNothingRecorded(): void {
  expect(world.families.size).toBe(0);
  expect(world.requestRecords.size).toBe(0);
  expect(hanako().familyId).toBeUndefined();
  expect(hanako().role).toBeUndefined();
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    world = setupWorld();
    process.env.ENTRY = 'api';
    stubLineFetch();
    firstResponse = undefined;
    responses = [];
    currentKey = KEY_1;
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  Scenario('名前を入れて作ると家族ができ作った人が管理者になる', ({ Given, When, Then, And }) => {
    Given('家族に入っていない友だちの花子さんがセッションを持っている', () => seedHanako(false));
    When('花子さんが家族の名前を「田中家」にして新しい印で家族を作る', () =>
      createWithKey('田中家', KEY_1),
    );
    Then('応答は 201 になる', () => expect(response.statusCode).toBe(201));
    And('応答に家族の名前「田中家」と管理者の役割が入っている', () => {
      const body = bodyOf();
      expect(body.name).toBe('田中家');
      expect(body.role).toBe('admin');
      expect(typeof body.familyId).toBe('string');
    });
    And('家族が 1 つ記録され管理者は花子さんである', () => {
      expect(world.families.size).toBe(1);
      const family = [...world.families.values()][0] as Record<string, unknown>;
      expect(family.name).toBe('田中家');
      expect(family.adminUserId).toBe(HANAKO_USER_ID);
      expect(family.familyId).toBe(bodyOf().familyId);
    });
    And('花子さんは家族に入り管理者になっている', () => {
      expect(hanako().familyId).toBe(bodyOf().familyId);
      expect(hanako().role).toBe('admin');
    });
    And('続けて自分の情報を求めると花子さんの家族と管理者の役割が返る', async () => {
      const me = (await handler(
        apiRequest('GET', '/v1/me', { token: sessionToken }),
      )) as APIGatewayProxyStructuredResultV2;
      expect(me.statusCode).toBe(200);
      expect(bodyOf(me).family).toMatchObject({
        familyId: bodyOf().familyId,
        name: '田中家',
        role: 'admin',
      });
    });
  });

  Scenario('すでに家族に入っている人は 409', ({ Given, When, Then, And }) => {
    Given('家族に入っている友だちの花子さんがセッションを持っている', () => seedHanako(true));
    When('花子さんが家族の名前を「山田家」にして新しい印で家族を作る', () =>
      createWithKey('山田家', KEY_1),
    );
    Then('応答は 409 で理由は ALREADY_IN_FAMILY になる', () => {
      expect(response.statusCode).toBe(409);
      expect(bodyOf().error?.reason).toBe('ALREADY_IN_FAMILY');
    });
    And('家族は増えず花子さんの家族はそのままである', () => {
      expect(world.families.size).toBe(1);
      expect(hanako().familyId).toBe('fam-yamada');
      expect(hanako().role).toBe('child');
      expect(world.requestRecords.size).toBe(0);
    });
  });

  Scenario('名前が空・空白だけ・21 文字なら 422', ({ Given, When, Then, And }) => {
    Given('家族に入っていない友だちの花子さんがセッションを持っている', () => seedHanako(false));
    When(
      '花子さんが空の名前・空白だけの名前・21 文字の名前でそれぞれ家族を作ろうとする',
      async () => {
        for (const [index, name] of ['', '   　 ', 'あ'.repeat(21)].entries()) {
          responses.push(
            await postFamily(name, {
              'idempotency-key': `00000000-0000-4000-8000-00000000010${index}`,
            }),
          );
        }
      },
    );
    Then('どれも 422 で理由は INVALID_FAMILY_NAME になる', () => {
      expect(responses).toHaveLength(3);
      for (const res of responses) {
        expect(res.statusCode).toBe(422);
        expect(bodyOf(res).error?.reason).toBe('INVALID_FAMILY_NAME');
      }
    });
    And('家族は作られず何も記録されない', expectNothingRecorded);
  });

  Scenario(
    '同じ印で送り直すと前と同じ結果が返り家族は 1 つのまま',
    ({ Given, And, When, Then }) => {
      Given('家族に入っていない友だちの花子さんがセッションを持っている', () => seedHanako(false));
      And('花子さんが家族の名前を「田中家」にして新しい印で家族を作った', async () => {
        await createWithKey('田中家', KEY_1);
        expect(response.statusCode).toBe(201);
        firstResponse = response;
      });
      When('花子さんが同じ印で同じ家族の作成をもう一度送る', () => createWithKey('田中家', KEY_1));
      Then('応答は 201 になる', () => expect(response.statusCode).toBe(201));
      And('応答は最初の応答と同じである', () => {
        expect(bodyOf()).toEqual(bodyOf(firstResponse as APIGatewayProxyStructuredResultV2));
      });
      And('家族が 1 つだけ記録されている', () => {
        expect(world.families.size).toBe(1);
        expect(world.requestRecords.size).toBe(1);
        expect(currentKey).toBe(KEY_1);
      });
    },
  );

  Scenario('印がない・UUID でないと 400', ({ Given, When, Then, And }) => {
    Given('家族に入っていない友だちの花子さんがセッションを持っている', () => seedHanako(false));
    When('花子さんが印なしと UUID でない印で家族を作ろうとする', async () => {
      responses.push(await postFamily('田中家', {}));
      responses.push(
        await postFamily('田中家', { 'idempotency-key': FAKE_NOT_A_UUID_IDEMPOTENCY_KEY }),
      );
    });
    Then('どちらも 400 で理由は IDEMPOTENCY_KEY_REQUIRED になる', () => {
      expect(responses).toHaveLength(2);
      for (const res of responses) {
        expect(res.statusCode).toBe(400);
        expect(bodyOf(res).error?.reason).toBe('IDEMPOTENCY_KEY_REQUIRED');
      }
    });
    And('家族は作られず何も記録されない', expectNothingRecorded);
  });

  Scenario(
    '家族の作成と利用者の更新の途中で失敗するとどちらも残らない',
    ({ Given, And, When, Then }) => {
      Given('家族に入っていない友だちの花子さんがセッションを持っている', () => seedHanako(false));
      And('家族と利用者をまとめて書く処理が思いがけず失敗する', () => {
        world.mock.on(TransactWriteCommand).rejects(new Error('DynamoDB is down'));
      });
      When('花子さんが家族の名前を「田中家」にして新しい印で家族を作る', () =>
        createWithKey('田中家', KEY_1),
      );
      Then('応答は 500 で理由は INTERNAL になる', () => {
        expect(response.statusCode).toBe(500);
        expect(bodyOf().error?.reason).toBe('INTERNAL');
      });
      And('家族は作られず花子さんは家族に入っていない', () => {
        expect(world.families.size).toBe(0);
        expect(hanako().familyId).toBeUndefined();
        expect(hanako().role).toBeUndefined();
      });
      And('送り直しの記録も残らない', () => expect(world.requestRecords.size).toBe(0));
    },
  );
});
