import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { InvitationPreview, InvitationView, Me, MeFamily } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  FAMILY_NAME,
  KEY_1,
  KEY_2,
  NOW,
  PEOPLE,
  seedFamily,
  seedUser,
  type PersonKey,
} from './helpers/seed';
import {
  FAKE_MALFORMED_INVITE_TOKEN,
  FAKE_ROTATED_INVITE_TOKEN,
  FAKE_SUZUKI_INVITE_TOKEN,
  FAKE_UNKNOWN_INVITE_TOKEN,
} from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u2-invitation/accept-invitation.feature');

const DAY_MS = 24 * 60 * 60 * 1000;
const SUZUKI_FAMILY_ID = 'fam-suzuki';
/** テストの中で作る決まった 22 文字の印（本物ではない） */
const SUZUKI_TOKEN = FAKE_SUZUKI_INVITE_TOKEN;
const UNKNOWN_TOKEN = FAKE_UNKNOWN_INVITE_TOKEN;
const MALFORMED_TOKEN = FAKE_MALFORMED_INVITE_TOKEN;

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;
let responses: APIGatewayProxyStructuredResultV2[];
let logs: string[];
/** 山田家のいまの招待の印と期限 */
let currentToken: string;
let currentExpiresAt: string;
/** 作り直されて使えなくなった印 */
let replacedToken: string | undefined;

function tokenOf(view: InvitationView): string {
  return new URL(view.url).searchParams.get('invitation') ?? '';
}

const open = (person: PersonKey, token = currentToken) =>
  call('GET', `/v1/invitations/${token}`, { person });

const accept = (
  person: PersonKey,
  token = currentToken,
  options: { key?: string | null; body?: unknown } = {},
) =>
  call('POST', `/v1/invitations/${token}/accept`, {
    person,
    ...(options.key === null ? {} : { key: options.key ?? KEY_1 }),
    ...(options.body !== undefined ? { body: options.body } : {}),
  });

async function motherCreates(key: string): Promise<InvitationView> {
  const res = await call('POST', '/v1/family/invitations', { person: 'mother', key });
  expect(res.statusCode).toBe(201);
  const view = bodyOf<InvitationView>(res);
  currentToken = tokenOf(view);
  currentExpiresAt = view.expiresAt;
  return view;
}

function user(person: PersonKey) {
  return world.users.get(PEOPLE[person].userId);
}

function reasonOf(res: APIGatewayProxyStructuredResultV2): string | undefined {
  return bodyOf<{ error?: { reason: string } }>(res).error?.reason;
}

function expectError(status: number, reason: string): void {
  expect(response.statusCode).toBe(status);
  expect(reasonOf(response)).toBe(reason);
}

function seedMotherAndInvitation(): Promise<InvitationView> {
  seedFamily(world.families);
  seedUser(world.users, 'mother', {
    familyId: FAMILY_ID,
    role: 'admin',
    familyJoinedAt: '2026-11-01T00:00:00.000Z',
  });
  return motherCreates(KEY_1);
}

function seedSuzukiFamily(withInvitation: boolean): void {
  seedFamily(world.families, {
    familyId: SUZUKI_FAMILY_ID,
    name: '鈴木家',
    adminUserId: 'user-suzuki',
    ...(withInvitation
      ? { currentInvitationToken: SUZUKI_TOKEN, currentInvitationId: 'inv-suzuki' }
      : {}),
  });
  if (withInvitation) {
    world.invitations.set(SUZUKI_TOKEN, {
      token: SUZUKI_TOKEN,
      invitationId: 'inv-suzuki',
      familyId: SUZUKI_FAMILY_ID,
      createdByUserId: 'user-suzuki',
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      status: 'active',
      ttl: Math.floor(NOW.getTime() / 1000) + 8 * 24 * 60 * 60,
    });
  }
}

function logLines(): Record<string, unknown>[] {
  return logs.map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function meOf(person: PersonKey): Promise<MeFamily | null> {
  const res = await call('GET', '/v1/me', { person });
  return bodyOf<Me>(res).family;
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    world = setupWorld();
    process.env.ENTRY = 'api';
    responses = [];
    logs = [];
    replacedToken = undefined;
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
  });
  AfterEachScenario(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  type Step = (text: string, fn: () => void | Promise<void>) => void;
  const givenMotherInvited = (Given: Step) =>
    Given('山田家の管理者のお母さんが招待用のリンクを作ってある', async () => {
      await seedMotherAndInvitation();
    });
  const andHanakoFriend = (And: Step) =>
    And('家族に入っていない友だちの花子さんがいる', () => seedUser(world.users, 'hanako'));
  const andHanakoNotInFamily = (And: Step) =>
    And('花子さんは家族に入っていない', () => {
      expect(user('hanako')?.familyId).toBeUndefined();
      expect(user('hanako')?.role).toBeUndefined();
    });
  const andHanakoChildOfYamada = (And: Step, text = '花子さんは山田家の子供のままである') =>
    And(text, () => {
      expect(user('hanako')?.familyId).toBe(FAMILY_ID);
      expect(user('hanako')?.role).toBe('child');
    });

  Scenario(
    '家族に入っていない友だちが招待を開くと、家族の名前と期限が返る',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      When('花子さんが招待を開く', async () => void (response = await open('hanako')));
      Then('応答は 200 で家族の名前と期限が返る', () => {
        expect(response.statusCode).toBe(200);
        const preview = bodyOf<InvitationPreview>(response);
        expect(preview).toEqual({ familyName: FAMILY_NAME, expiresAt: currentExpiresAt });
      });
      andHanakoNotInFamily(And);
    },
  );

  Scenario('参加すると、その家族の子供になる', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    andHanakoFriend(And);
    When('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
    Then('応答は 200 で山田家の子供として返る', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<MeFamily>(response)).toEqual({
        familyId: FAMILY_ID,
        name: FAMILY_NAME,
        role: 'child',
        notificationGroupRegistered: false,
      });
    });
    And('花子さんの自分の情報は、山田家の子供になっている', async () => {
      const family = await meOf('hanako');
      expect(family?.familyId).toBe(FAMILY_ID);
      expect(family?.role).toBe('child');
    });
    And('花子さんは家族に入った時刻が記録されている', () => {
      expect(user('hanako')?.familyJoinedAt).toBe(NOW.toISOString());
    });
  });

  Scenario('同じリンクで子供 3 人が参加できる', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    And('家族に入っていない友だちの花子さんと太郎さんと次郎さんがいる', () => {
      for (const person of ['hanako', 'taro', 'jiro'] as const) seedUser(world.users, person);
    });
    When('3 人がそれぞれ同じ招待に参加する', async () => {
      responses = [];
      for (const person of ['hanako', 'taro', 'jiro'] as const) {
        responses.push(await accept(person));
      }
    });
    Then('3 人とも応答は 200 になる', () =>
      expect(responses.map((r) => r.statusCode)).toEqual([200, 200, 200]),
    );
    And('3 人とも山田家の子供になっている', () => {
      for (const person of ['hanako', 'taro', 'jiro'] as const) {
        expect(user(person)?.familyId).toBe(FAMILY_ID);
        expect(user(person)?.role).toBe('child');
      }
    });
  });

  Scenario(
    'ほかの家族に入っている人は、開くときも参加するときも断られる',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      And('花子さんは鈴木家の管理者である', () => {
        seedSuzukiFamily(false);
        seedUser(world.users, 'hanako', {
          familyId: SUZUKI_FAMILY_ID,
          role: 'admin',
          familyJoinedAt: '2026-11-01T00:00:00.000Z',
        });
      });
      When('花子さんが招待を開く', async () => void (response = await open('hanako')));
      Then('開いたときの応答は 409 で理由は ALREADY_IN_OTHER_FAMILY になる', () =>
        expectError(409, 'ALREADY_IN_OTHER_FAMILY'),
      );
      When('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
      Then('参加したときの応答は 409 で理由は ALREADY_IN_OTHER_FAMILY になる', () =>
        expectError(409, 'ALREADY_IN_OTHER_FAMILY'),
      );
      And('花子さんの家族と役割は変わっていない', () => {
        expect(user('hanako')?.familyId).toBe(SUZUKI_FAMILY_ID);
        expect(user('hanako')?.role).toBe('admin');
      });
    },
  );

  Scenario(
    '同じ家族の人が開くと ALREADY_IN_FAMILY で、役割は変わらない',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      And('山田家の子供の太郎さんがいる', () =>
        seedUser(world.users, 'taro', {
          familyId: FAMILY_ID,
          role: 'child',
          familyJoinedAt: '2026-11-02T00:00:00.000Z',
        }),
      );
      When('お母さんが自分の招待を開く', async () => void (response = await open('mother')));
      Then('開いたときの応答は 409 で理由は ALREADY_IN_FAMILY になる', () =>
        expectError(409, 'ALREADY_IN_FAMILY'),
      );
      When('太郎さんが招待に参加する', async () => void (response = await accept('taro')));
      Then('参加したときの応答は 409 で理由は ALREADY_IN_FAMILY になる', () =>
        expectError(409, 'ALREADY_IN_FAMILY'),
      );
      And('お母さんは管理者のままで、太郎さんは子供のままである', () => {
        expect(user('mother')?.role).toBe('admin');
        expect(user('taro')?.role).toBe('child');
      });
    },
  );

  Scenario('使えない招待は、どれも同じ INVITATION_INVALID になる', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    andHanakoFriend(And);
    let bodies: string[];
    When(
      '花子さんが、ない印・作り直された印・期限が過ぎた印・期限ちょうどの印・形の違う印を、開くときと参加するときに送る',
      async () => {
        bodies = [];
        responses = [];
        const record = (res: APIGatewayProxyStructuredResultV2) => {
          responses.push(res);
          bodies.push(String(res.body));
        };
        const both = async (token: string) => {
          record(await open('hanako', token));
          record(await accept('hanako', token));
        };
        await both(UNKNOWN_TOKEN);
        await both(MALFORMED_TOKEN);
        // 作り直された印
        replacedToken = currentToken;
        await motherCreates(KEY_2);
        await both(replacedToken);
        // 期限ちょうど（使えない）と、期限を過ぎたあと
        vi.setSystemTime(new Date(currentExpiresAt));
        await both(currentToken);
        vi.setSystemTime(new Date(Date.parse(currentExpiresAt) + 1000));
        await both(currentToken);
      },
    );
    Then(
      'どれも応答は 409 で理由は INVITATION_INVALID になり、応答の本文はすべて同じである',
      () => {
        expect(responses).toHaveLength(10);
        for (const res of responses) {
          expect(res.statusCode).toBe(409);
          expect(reasonOf(res)).toBe('INVITATION_INVALID');
        }
        expect(new Set(bodies).size).toBe(1);
      },
    );
    andHanakoNotInFamily(And);
  });

  Scenario(
    '招待を開いたあと、管理者が作り直してから「参加する」を送ると、参加できない',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      When('花子さんが招待を開く', async () => {
        response = await open('hanako');
        expect(response.statusCode).toBe(200);
      });
      And('お母さんが招待用のリンクを作り直す', async () => {
        replacedToken = currentToken;
        await motherCreates(KEY_2);
      });
      And('花子さんが前のリンクの招待に参加する', async () => {
        response = await accept('hanako', replacedToken);
      });
      Then('応答は 409 で理由は INVITATION_INVALID になる', () =>
        expectError(409, 'INVITATION_INVALID'),
      );
      andHanakoNotInFamily(And);
    },
  );

  Scenario(
    '招待を開いたあと、期限が過ぎてから「参加する」を送ると、参加できない',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      When('花子さんが招待を開く', async () => {
        response = await open('hanako');
        expect(response.statusCode).toBe(200);
      });
      And('招待の期限が過ぎる', () => {
        vi.setSystemTime(new Date(Date.parse(currentExpiresAt) + 1000));
      });
      And('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
      Then('応答は 409 で理由は INVITATION_INVALID になる', () =>
        expectError(409, 'INVITATION_INVALID'),
      );
      andHanakoNotInFamily(And);
    },
  );

  Scenario(
    '読んだあとに招待が使えなくなっても、取引の条件で参加できない',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      And('参加の取引の直前に、お母さんが招待を作り直す', () => {
        world.hooks.beforeNextTransaction = () => {
          const old = world.invitations.get(currentToken);
          if (old) old.status = 'replaced';
          const family = world.families.get(FAMILY_ID);
          if (family) family.currentInvitationToken = FAKE_ROTATED_INVITE_TOKEN;
        };
      });
      When('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
      Then('応答は 409 で理由は INVITATION_INVALID になる', () =>
        expectError(409, 'INVITATION_INVALID'),
      );
      andHanakoNotInFamily(And);
    },
  );

  Scenario(
    '2 つの招待で同時に参加しようとすると、1 つの家族にだけ入る',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      And('鈴木家にも使える招待がある', () => seedSuzukiFamily(true));
      andHanakoFriend(And);
      And('参加の取引の直前に、花子さんが鈴木家の招待で先に参加する', () => {
        world.hooks.beforeNextTransaction = () => {
          const hanako = user('hanako');
          if (hanako) {
            hanako.familyId = SUZUKI_FAMILY_ID;
            hanako.role = 'child';
            hanako.familyJoinedAt = NOW.toISOString();
          }
        };
      });
      When('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
      Then('応答は 409 で理由は ALREADY_IN_OTHER_FAMILY になる', () =>
        expectError(409, 'ALREADY_IN_OTHER_FAMILY'),
      );
      And('花子さんは鈴木家の子供だけになっている', () => {
        expect(user('hanako')?.familyId).toBe(SUZUKI_FAMILY_ID);
        expect(user('hanako')?.role).toBe('child');
      });
    },
  );

  Scenario(
    '参加したあと同じ Idempotency-Key で送り直すと、前と同じ 200 が返る',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      When('花子さんが同じ Idempotency-Key で招待に 2 回参加する', async () => {
        responses = [await accept('hanako'), await accept('hanako')];
      });
      Then('どちらの応答も 200 で同じ本文である', () => {
        expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
        expect(responses[1]?.body).toBe(responses[0]?.body);
      });
    },
  );

  Scenario(
    '同じ Idempotency-Key で別の招待に参加しようとすると 422 IDEMPOTENCY_KEY_REUSED',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      And('鈴木家にも使える招待がある', () => seedSuzukiFamily(true));
      andHanakoFriend(And);
      When('花子さんが山田家の招待に参加する', async () => {
        response = await accept('hanako');
        expect(response.statusCode).toBe(200);
      });
      And('花子さんが同じ Idempotency-Key で鈴木家の招待に参加しようとする', async () => {
        response = await accept('hanako', SUZUKI_TOKEN);
      });
      Then('応答は 422 で理由は IDEMPOTENCY_KEY_REUSED になる', () =>
        expectError(422, 'IDEMPOTENCY_KEY_REUSED'),
      );
      andHanakoChildOfYamada(And, '花子さんは山田家の子供のままである');
    },
  );

  Scenario(
    'Idempotency-Key がなければ参加は 400 IDEMPOTENCY_KEY_REQUIRED',
    ({ Given, And, When, Then }) => {
      givenMotherInvited(Given);
      andHanakoFriend(And);
      When(
        '花子さんが Idempotency-Key なしで招待に参加する',
        async () => void (response = await accept('hanako', currentToken, { key: null })),
      );
      Then('応答は 400 で理由は IDEMPOTENCY_KEY_REQUIRED になる', () =>
        expectError(400, 'IDEMPOTENCY_KEY_REQUIRED'),
      );
      andHanakoNotInFamily(And);
    },
  );

  Scenario('本文に別の家族の ID を入れても、招待の家族に入る', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    And('鈴木家にも使える招待がある', () => seedSuzukiFamily(true));
    andHanakoFriend(And);
    When(
      '花子さんが本文に鈴木家の ID を入れて山田家の招待に参加する',
      async () =>
        void (response = await accept('hanako', currentToken, {
          body: { familyId: SUZUKI_FAMILY_ID },
        })),
    );
    Then('応答は 200 で山田家の子供として返る', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<MeFamily>(response).familyId).toBe(FAMILY_ID);
    });
    andHanakoChildOfYamada(And);
  });

  Scenario('ブロック中の人は 403 NOT_FRIEND', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    And('ブロック中の花子さんがいる', () =>
      seedUser(world.users, 'hanako', { friendStatus: 'blocked' }),
    );
    When('花子さんが招待を開く', async () => void (response = await open('hanako')));
    Then('開いたときの応答は 403 で理由は NOT_FRIEND になる', () => expectError(403, 'NOT_FRIEND'));
    When('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
    Then('参加したときの応答は 403 で理由は NOT_FRIEND になる', () =>
      expectError(403, 'NOT_FRIEND'),
    );
    andHanakoNotInFamily(And);
  });

  Scenario('断ったログと参加のログに、印の全体が出ない', ({ Given, And, When, Then }) => {
    givenMotherInvited(Given);
    andHanakoFriend(And);
    When('花子さんが形の違う印を開く', async () => void (await open('hanako', MALFORMED_TOKEN)));
    And('花子さんが作り直された印を開く', async () => {
      replacedToken = currentToken;
      await motherCreates(KEY_2);
      await open('hanako', replacedToken);
    });
    And('花子さんが招待に参加する', async () => void (response = await accept('hanako')));
    Then('INVITATION_REJECTED のログに理由と、形が正しい印のときだけ印の先頭 4 文字が出る', () => {
      const rejected = logLines().filter((l) => l.event === 'INVITATION_REJECTED');
      expect(rejected).toHaveLength(2);
      const [malformed, replaced] = rejected;
      expect(malformed?.reason).toBe('INVITATION_INVALID');
      expect(malformed).not.toHaveProperty('tokenPrefix');
      expect(replaced?.reason).toBe('INVITATION_INVALID');
      expect(replaced?.tokenPrefix).toBe((replacedToken ?? '').slice(0, 4));
      expect(replaced?.userId).toBe(PEOPLE.hanako.userId);
    });
    And('INVITATION_ACCEPTED のログに家族の ID と利用者の ID と印の先頭 4 文字が出る', () => {
      expect(response.statusCode).toBe(200);
      const accepted = logLines().find((l) => l.event === 'INVITATION_ACCEPTED');
      expect(accepted?.familyId).toBe(FAMILY_ID);
      expect(accepted?.userId).toBe(PEOPLE.hanako.userId);
      expect(accepted?.tokenPrefix).toBe(currentToken.slice(0, 4));
    });
    And('どのログの行にも印の全体が含まれない', () => {
      const all = logs.join('\n');
      expect(all.length).toBeGreaterThan(0);
      for (const token of [currentToken, replacedToken ?? '', MALFORMED_TOKEN]) {
        expect(all).not.toContain(token);
      }
    });
  });
});
