import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { InvitationView } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  KEY_1,
  KEY_2,
  LIFF_URL,
  NOW,
  PEOPLE,
  seedFamily,
  seedUser,
} from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u2-invitation/create-invitation.feature');

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let created: InvitationView | undefined;
let logs: string[];

const DAY_MS = 24 * 60 * 60 * 1000;

function tokenOf(view: InvitationView): string {
  return new URL(view.url).searchParams.get('invitation') ?? '';
}

function activeInvitations() {
  return [...world.invitations.values()].filter((i) => i.status === 'active');
}

function currentToken(): unknown {
  return world.families.get(FAMILY_ID)?.currentInvitationToken;
}

function seedMother(): void {
  seedFamily(world.families);
  seedUser(world.users, 'mother', {
    familyId: FAMILY_ID,
    role: 'admin',
    familyJoinedAt: '2026-11-01T00:00:00.000Z',
  });
}

function seedTaro(): void {
  seedUser(world.users, 'taro', {
    familyId: FAMILY_ID,
    role: 'child',
    familyJoinedAt: '2026-11-02T00:00:00.000Z',
  });
}

/** key が null のときは Idempotency-Key を付けない。 */
async function motherCreates(key: string | null = KEY_1) {
  response = await call('POST', '/v1/family/invitations', {
    person: 'mother',
    ...(key ? { key } : {}),
  });
  return response;
}

async function motherHasCreated(): Promise<void> {
  const res = await motherCreates(KEY_1);
  created = bodyOf<InvitationView>(res);
}

/** 別の端末の作り直しが先に入った状態を、DB の中に直接作る（「読んだあとに別の書き込みが先に入った」）。 */
function otherDeviceRotates(label: string): void {
  const previousToken = String(currentToken());
  const previous = world.invitations.get(previousToken);
  if (previous) previous.status = 'replaced';
  const token = `Other${label}`.padEnd(22, 'x');
  world.invitations.set(token, {
    token,
    invitationId: `inv-other-${label}`,
    familyId: FAMILY_ID,
    createdByUserId: PEOPLE.mother.userId,
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
    status: 'active',
    ttl: Math.floor(NOW.getTime() / 1000) + 8 * 24 * 60 * 60,
  });
  const family = world.families.get(FAMILY_ID);
  if (family) {
    family.currentInvitationToken = token;
    family.currentInvitationId = `inv-other-${label}`;
  }
}

function lastTransactionSize(): number {
  const calls = world.mock.commandCalls(TransactWriteCommand);
  return (calls[calls.length - 1]?.args[0].input.TransactItems ?? []).length;
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    world = setupWorld();
    process.env.ENTRY = 'api';
    created = undefined;
    responses = [];
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
  });
  AfterEachScenario(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const givenMother = (Given: (text: string, fn: () => void) => void) =>
    Given('山田家の管理者のお母さんがいる', seedMother);
  const andMotherHasCreated = (And: (text: string, fn: () => Promise<void>) => void) =>
    And('お母さんが招待用のリンクを作ってある', motherHasCreated);

  Scenario(
    '管理者が招待を作ると、22 文字の印を含むリンクと 24 時間後の期限が返る',
    ({ Given, When, Then, And }) => {
      givenMother(Given);
      When('お母さんが招待用のリンクを作る', async () => void (await motherCreates()));
      Then('応答は 201 になる', () => expect(response.statusCode).toBe(201));
      And('リンクは LIFF の URL に 22 文字の印を付けたものである', () => {
        created = bodyOf<InvitationView>(response);
        expect(created.url).toMatch(
          new RegExp(`^${LIFF_URL.replace(/\./g, '\\.')}\\?invitation=[A-Za-z0-9_-]{22}$`),
        );
      });
      And('期限は作った時刻の 24 時間後である', () => {
        expect(created?.expiresAt).toBe(new Date(NOW.getTime() + DAY_MS).toISOString());
      });
    },
  );

  Scenario('招待がなければ、いまの招待は null', ({ Given, When, Then }) => {
    givenMother(Given);
    When('お母さんがいまの招待を見る', async () => {
      response = await call('GET', '/v1/family/invitation', { person: 'mother' });
    });
    Then('応答は 200 で本文は null になる', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf(response)).toBeNull();
    });
  });

  Scenario(
    '管理者がいまの招待を見ると、作ったときと同じリンクと期限が返る',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      andMotherHasCreated(And);
      When('お母さんがいまの招待を見る', async () => {
        response = await call('GET', '/v1/family/invitation', { person: 'mother' });
      });
      Then('作ったときと同じリンクと期限が返る', () => {
        expect(response.statusCode).toBe(200);
        expect(bodyOf(response)).toEqual(created);
      });
    },
  );

  Scenario(
    '作り直すと、前の招待は使えなくなり、いまの招待は新しいものになる',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      andMotherHasCreated(And);
      When(
        'お母さんが別の Idempotency-Key で招待用のリンクを作り直す',
        async () => void (await motherCreates(KEY_2)),
      );
      Then('新しいリンクは前のリンクと違う', () => {
        expect(response.statusCode).toBe(201);
        expect(bodyOf<InvitationView>(response).url).not.toBe(created?.url);
      });
      And('前の招待は作り直された状態になり、新しい招待は使える状態になる', () => {
        const previous = world.invitations.get(tokenOf(created as InvitationView));
        expect(previous?.status).toBe('replaced');
        const next = world.invitations.get(tokenOf(bodyOf<InvitationView>(response)));
        expect(next?.status).toBe('active');
        expect(activeInvitations()).toHaveLength(1);
      });
      And('いまの招待を見ると新しいリンクが返る', async () => {
        const current = await call('GET', '/v1/family/invitation', { person: 'mother' });
        expect(bodyOf(current)).toEqual(bodyOf(response));
      });
    },
  );

  Scenario(
    '子供が作ろうとすると 403 ADMIN_ONLY で、招待はできない',
    ({ Given, When, Then, And }) => {
      Given('山田家の管理者のお母さんと子供の太郎がいる', () => {
        seedMother();
        seedTaro();
      });
      When('太郎が招待用のリンクを作ろうとする', async () => {
        response = await call('POST', '/v1/family/invitations', { person: 'taro', key: KEY_1 });
      });
      Then('応答は 403 で理由は ADMIN_ONLY になる', () => {
        expect(response.statusCode).toBe(403);
        expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe('ADMIN_ONLY');
      });
      And('招待は 1 つもできていない', () => {
        expect(world.invitations.size).toBe(0);
        expect(currentToken()).toBeUndefined();
      });
    },
  );

  Scenario('子供がいまの招待を見ようとしても 403 ADMIN_ONLY', ({ Given, When, Then }) => {
    Given('山田家の管理者のお母さんと子供の太郎がいる', () => {
      seedMother();
      seedTaro();
    });
    When('太郎がいまの招待を見ようとする', async () => {
      response = await call('GET', '/v1/family/invitation', { person: 'taro' });
    });
    Then('応答は 403 で理由は ADMIN_ONLY になる', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe('ADMIN_ONLY');
    });
  });

  Scenario(
    '同じ Idempotency-Key で 2 回送ると、招待は 1 つで、同じリンクが返る',
    ({ Given, When, Then, And }) => {
      givenMother(Given);
      When('お母さんが同じ Idempotency-Key で招待用のリンクを 2 回作る', async () => {
        responses = [await motherCreates(KEY_1), await motherCreates(KEY_1)];
      });
      Then('どちらの応答も 201 で同じリンクと期限である', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
        expect(bodyOf(responses[1] as APIGatewayProxyStructuredResultV2)).toEqual(
          bodyOf(responses[0] as APIGatewayProxyStructuredResultV2),
        );
      });
      And('招待は 1 つだけできている', () => {
        expect(world.invitations.size).toBe(1);
        expect(activeInvitations()).toHaveLength(1);
      });
    },
  );

  Scenario(
    '同じ Idempotency-Key で別の操作の記録があると 422 IDEMPOTENCY_KEY_REUSED',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      And('同じ Idempotency-Key で別の家族の招待の記録がある', () => {
        world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY_1}`, {
          userId: PEOPLE.mother.userId,
          idempotencyKey: KEY_1,
          operation: 'createInvitation',
          target: 'fam-other',
          result: { url: `${LIFF_URL}?invitation=old`, expiresAt: NOW.toISOString() },
          expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
        });
      });
      When(
        'お母さんがその Idempotency-Key で招待用のリンクを作る',
        async () => void (await motherCreates(KEY_1)),
      );
      Then('応答は 422 で理由は IDEMPOTENCY_KEY_REUSED になる', () => {
        expect(response.statusCode).toBe(422);
        expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe(
          'IDEMPOTENCY_KEY_REUSED',
        );
      });
      And('招待は 1 つもできていない', () => expect(world.invitations.size).toBe(0));
    },
  );

  Scenario('Idempotency-Key がなければ 400 IDEMPOTENCY_KEY_REQUIRED', ({ Given, When, Then }) => {
    givenMother(Given);
    When(
      'お母さんが Idempotency-Key なしで招待用のリンクを作る',
      async () => void (await motherCreates(null)),
    );
    Then('応答は 400 で理由は IDEMPOTENCY_KEY_REQUIRED になる', () => {
      expect(response.statusCode).toBe(400);
      expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe(
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    });
  });

  Scenario(
    '2 つの端末から同時に作り直すと、使える招待は 1 つだけになる',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      andMotherHasCreated(And);
      And('1 つ目の端末が読んだあとに、2 つ目の端末の作り直しが先に入る', () => {
        world.hooks.beforeNextTransaction = () => otherDeviceRotates('A');
      });
      When('1 つ目の端末が作り直す', async () => void (await motherCreates(KEY_2)));
      Then('応答は 201 になる', () => expect(response.statusCode).toBe(201));
      And('使える招待は 1 つだけである', () => expect(activeInvitations()).toHaveLength(1));
      And('最後に作った招待がいまの招待である', () => {
        const view = bodyOf<InvitationView>(response);
        expect(currentToken()).toBe(tokenOf(view));
        expect(activeInvitations()[0]?.token).toBe(tokenOf(view));
      });
    },
  );

  Scenario(
    '作り直しの競合が続いたら 500 INTERNAL で、使える招待は変わらない',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      andMotherHasCreated(And);
      And('作り直しのたびに別の端末の作り直しが先に入る', () => {
        let n = 0;
        const racer = () => {
          otherDeviceRotates(String(n++));
          world.hooks.beforeNextTransaction = racer;
        };
        world.hooks.beforeNextTransaction = racer;
      });
      When(
        'お母さんが別の Idempotency-Key で招待用のリンクを作り直す',
        async () => void (await motherCreates(KEY_2)),
      );
      Then('応答は 500 で理由は INTERNAL になる', () => {
        expect(response.statusCode).toBe(500);
        expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe('INTERNAL');
        // やり直しは 1 回だけ（取引は 2 回まで）
        expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1 + 2);
        expect(activeInvitations()).toHaveLength(1);
      });
    },
  );

  Scenario('前の招待が TTL で消えたあとでも、作り直せる', ({ Given, And, When, Then }) => {
    givenMother(Given);
    andMotherHasCreated(And);
    And('前の招待の項目が TTL で消えている', () => {
      world.invitations.delete(tokenOf(created as InvitationView));
    });
    When(
      'お母さんが別の Idempotency-Key で招待用のリンクを作り直す',
      async () => void (await motherCreates(KEY_2)),
    );
    Then('応答は 201 になる', () => {
      expect(response.statusCode).toBe(201);
      // 前の招待の Update を含まない 3 件
      expect(lastTransactionSize()).toBe(3);
    });
    And('いまの招待を見ると新しいリンクが返る', async () => {
      const current = await call('GET', '/v1/family/invitation', { person: 'mother' });
      expect(bodyOf(current)).toEqual(bodyOf(response));
    });
  });

  Scenario(
    '読んだあとに前の招待が TTL で消えても、やり直して作り直せる',
    ({ Given, And, When, Then }) => {
      givenMother(Given);
      andMotherHasCreated(And);
      And('作り直しの取引の直前に前の招待の項目が TTL で消える', () => {
        const previousToken = tokenOf(created as InvitationView);
        world.hooks.beforeNextTransaction = () => void world.invitations.delete(previousToken);
      });
      When(
        'お母さんが別の Idempotency-Key で招待用のリンクを作り直す',
        async () => void (await motherCreates(KEY_2)),
      );
      Then('応答は 201 になる', () => {
        expect(response.statusCode).toBe(201);
        expect(lastTransactionSize()).toBe(3);
      });
      And('使える招待は 1 つだけである', () => expect(activeInvitations()).toHaveLength(1));
    },
  );

  Scenario('招待を作ったログに、印の先頭 4 文字だけが出る', ({ Given, When, Then, And }) => {
    givenMother(Given);
    When('お母さんが招待用のリンクを作る', async () => void (await motherCreates()));
    Then('INVITATION_CREATED のログに印の先頭 4 文字が tokenPrefix として出る', () => {
      created = bodyOf<InvitationView>(response);
      const line = logs
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((l) => l.event === 'INVITATION_CREATED');
      expect(line?.tokenPrefix).toBe(tokenOf(created).slice(0, 4));
      expect(line?.familyId).toBe(FAMILY_ID);
      expect(line?.userId).toBe(PEOPLE.mother.userId);
      expect(line?.replacedPrevious).toBe(false);
    });
    And('どのログの行にも印の全体が含まれない', () => {
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.join('\n')).not.toContain(tokenOf(created as InvitationView));
    });
  });
});
