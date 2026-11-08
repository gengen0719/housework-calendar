import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/api';
import { ApiError } from '../../src/lib/errors';
import { requireAdmin } from '../../src/middleware/requireAdmin';
import { requireAuth } from '../../src/middleware/requireAuth';
import { requireMembership } from '../../src/middleware/requireMembership';
import { requireSameFamily } from '../../src/middleware/requireSameFamily';
import type { User } from '../../src/models';
import { signSession } from '../../src/services/tokenService';
import {
  apiRequest,
  HANAKO_LINE_ID,
  LOGIN_CHANNEL_ID,
  setupWorld,
  SIGNING_SECRET,
  stubLineFetch,
  VALID_ID_TOKEN,
} from './helpers/world';

const feature = await loadFeature('packages/backend/test/u1-skeleton-family/session.feature');

type World = ReturnType<typeof setupWorld>;
let world: World;
let line: ReturnType<typeof stubLineFetch>;
let response: APIGatewayProxyStructuredResultV2;
let idToken: string;
let sessionToken: string | undefined;
let caught: unknown;

const START = new Date('2026-11-01T00:00:00.000Z');
const HANAKO_USER_ID = 'user-hanako';

function seedFamily(): void {
  world.families.set('fam-1', {
    familyId: 'fam-1',
    name: '田中家',
    adminUserId: 'user-mother',
    createdAt: '2026-11-01T00:00:00.000Z',
  });
}

function seedHanako(overrides: Partial<User> = {}): void {
  const user: User = {
    userId: HANAKO_USER_ID,
    lineUserId: HANAKO_LINE_ID,
    displayName: '花子',
    friendStatus: 'friend',
    familyId: 'fam-1',
    role: 'child',
    registeredAt: '2026-11-01T00:00:00.000Z',
    friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
  world.users.set(user.userId, { ...user });
  if (user.familyId) seedFamily();
}

function seedHanakoWithoutFamily(): void {
  seedHanako();
  const user = world.users.get(HANAKO_USER_ID) as Record<string, unknown>;
  delete user.familyId;
  delete user.role;
}

function hanakoRecords(): User[] {
  return [...world.users.values()].filter(
    (u) => u.lineUserId === HANAKO_LINE_ID,
  ) as unknown as User[];
}

interface ResponseBody {
  sessionToken?: string;
  expiresAt?: string;
  error?: { reason: string };
}

function bodyOf(): ResponseBody {
  return JSON.parse(String(response.body)) as ResponseBody;
}

async function postSession(): Promise<void> {
  response = (await handler(
    apiRequest('POST', '/v1/sessions', { body: { idToken } }),
  )) as APIGatewayProxyStructuredResultV2;
}

async function getMe(token: string | undefined): Promise<void> {
  response = (await handler(
    apiRequest('GET', '/v1/me', { ...(token ? { token } : {}) }),
  )) as APIGatewayProxyStructuredResultV2;
}

async function obtainSession(): Promise<void> {
  idToken = VALID_ID_TOKEN;
  await postSession();
  expect(response.statusCode).toBe(200);
  sessionToken = bodyOf().sessionToken as string;
}

function expectStatus(status: number, reason?: string): void {
  expect(response.statusCode).toBe(status);
  if (reason) expect(bodyOf().error?.reason).toBe(reason);
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** 通す確かめを仕組みとして直接動かし、断られた理由を受け取る。 */
async function runChecks(
  ...checks: Array<(auth: Awaited<ReturnType<typeof requireAuth>>) => void>
): Promise<void> {
  caught = undefined;
  try {
    const token = signSession(HANAKO_USER_ID, SIGNING_SECRET).token;
    const auth = await requireAuth({ authorization: `Bearer ${token}` }, SIGNING_SECRET);
    for (const check of checks) check(auth);
  } catch (error) {
    caught = error;
  }
}

function expectRejected(status: number, reason: string): void {
  expect(caught).toBeInstanceOf(ApiError);
  expect((caught as ApiError).status).toBe(status);
  expect((caught as ApiError).reason).toBe(reason);
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    world = setupWorld();
    process.env.ENTRY = 'api';
    line = stubLineFetch();
    idToken = VALID_ID_TOKEN;
    sessionToken = undefined;
    caught = undefined;
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  Scenario('正しい ID トークンでセッションが出る', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('花子さんの正しい ID トークンがある', () => {
      idToken = VALID_ID_TOKEN;
    });
    When('画面がその ID トークンでセッションを求める', postSession);
    Then('応答は 200 になる', () => expectStatus(200));
    And('LINE の verify にログインチャネルの ID を付けて問い合わせている', () => {
      const call = line.calls.find((c) => c.url === 'https://api.line.me/oauth2/v2.1/verify');
      expect(call?.method).toBe('POST');
      const form = new URLSearchParams(String(call?.body));
      expect(form.get('id_token')).toBe(VALID_ID_TOKEN);
      expect(form.get('client_id')).toBe(LOGIN_CHANNEL_ID);
    });
    And('セッションの期限は 1 時間後になる', () => {
      expect(bodyOf().expiresAt).toBe(new Date(START.getTime() + 3600_000).toISOString());
    });
    And('セッションの中身は利用者の ID と期限だけである', () => {
      const payload = JSON.parse(
        Buffer.from(String(bodyOf().sessionToken).split('.')[1] as string, 'base64url').toString(),
      ) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['exp', 'userId']);
      expect(payload.userId).toBe(HANAKO_USER_ID);
      expect(payload.exp).toBe(START.getTime() / 1000 + 3600);
    });
  });

  Scenario('偽の ID トークンは 401', ({ Given, When, Then, And }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    When('画面が偽の ID トークンでセッションを求める', async () => {
      idToken = 'forged-id-token';
      await postSession();
    });
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
    And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
  });

  Scenario('別のチャネルの ID トークンは 401', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('LINE は別のチャネルの ID トークンだと答える', () => {
      line = stubLineFetch({
        verify: () => ({
          status: 400,
          body: { error: 'invalid_request', error_description: 'Invalid IdToken Client ID.' },
        }),
      });
    });
    When('画面がその ID トークンでセッションを求める', postSession);
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
    And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
  });

  Scenario('期限切れの ID トークンは 401', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('LINE は期限切れの ID トークンだと答える', () => {
      line = stubLineFetch({
        verify: () => ({
          status: 400,
          body: { error: 'invalid_request', error_description: 'IdToken expired.' },
        }),
      });
    });
    When('画面がその ID トークンでセッションを求める', postSession);
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
    And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
  });

  Scenario('記録がない人が友だちなら記録してセッションを出す', ({ Given, And, When, Then }) => {
    Given('花子さんはまだ記録されていない', () => expect(hanakoRecords()).toHaveLength(0));
    And('花子さんの正しい ID トークンがある', () => {
      idToken = VALID_ID_TOKEN;
    });
    And('LINE では花子さんは友だちである', () => {
      line = stubLineFetch({ profile: 'ok', displayName: '花子' });
    });
    When('画面がその ID トークンでセッションを求める', postSession);
    Then('応答は 200 になる', () => expectStatus(200));
    And('花子さんは友だちとして 1 人だけ記録される', () => {
      expect(hanakoRecords()).toHaveLength(1);
      expect(hanakoRecords()[0]?.friendStatus).toBe('friend');
    });
    And('表示名は LINE から受け取った「花子」になる', () => {
      expect(hanakoRecords()[0]?.displayName).toBe('花子');
    });
  });

  Scenario(
    '記録がない人が友だちでなければ 403 でセッションは出ない',
    ({ Given, And, When, Then }) => {
      Given('花子さんはまだ記録されていない', () => expect(hanakoRecords()).toHaveLength(0));
      And('花子さんの正しい ID トークンがある', () => {
        idToken = VALID_ID_TOKEN;
      });
      And('LINE では花子さんは友だちではない', () => {
        line = stubLineFetch({ profile: 'not-friend' });
      });
      When('画面がその ID トークンでセッションを求める', postSession);
      Then('応答は 403 で理由は NOT_FRIEND になる', () => expectStatus(403, 'NOT_FRIEND'));
      And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
      And('何も記録されない', () => expect(world.users.size).toBe(0));
    },
  );

  Scenario(
    'ブロック中の人が LINE で友だちに戻っていれば記録を直してセッションを出す',
    ({ Given, And, When, Then }) => {
      Given('家族に入っているブロック中の花子さんが記録されている', () =>
        seedHanako({ friendStatus: 'blocked' }),
      );
      And('花子さんの正しい ID トークンがある', () => {
        idToken = VALID_ID_TOKEN;
      });
      And('LINE では花子さんは友だちである', () => {
        line = stubLineFetch({ profile: 'ok', displayName: 'はなこ' });
      });
      When('画面がその ID トークンでセッションを求める', postSession);
      Then('応答は 200 になる', () => expectStatus(200));
      And('花子さんは友だちに戻り家族と役割はそのままである', () => {
        expect(hanakoRecords()).toHaveLength(1);
        const user = hanakoRecords()[0];
        expect(user?.friendStatus).toBe('friend');
        expect(user?.displayName).toBe('花子');
        expect(user?.familyId).toBe('fam-1');
        expect(user?.role).toBe('child');
      });
    },
  );

  Scenario(
    'ブロック中の人が友だちでなければ 403 でセッションは出ない',
    ({ Given, And, When, Then }) => {
      Given('家族に入っているブロック中の花子さんが記録されている', () =>
        seedHanako({ friendStatus: 'blocked' }),
      );
      And('花子さんの正しい ID トークンがある', () => {
        idToken = VALID_ID_TOKEN;
      });
      And('LINE では花子さんは友だちではない', () => {
        line = stubLineFetch({ profile: 'not-friend' });
      });
      When('画面がその ID トークンでセッションを求める', postSession);
      Then('応答は 403 で理由は NOT_FRIEND になる', () => expectStatus(403, 'NOT_FRIEND'));
      And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
      And('花子さんはブロック中のままである', () => {
        expect(hanakoRecords()[0]?.friendStatus).toBe('blocked');
      });
    },
  );

  Scenario('LINE に問い合わせられないときは 503', ({ Given, And, When, Then }) => {
    Given('花子さんはまだ記録されていない', () => expect(hanakoRecords()).toHaveLength(0));
    And('花子さんの正しい ID トークンがある', () => {
      idToken = VALID_ID_TOKEN;
    });
    And('LINE のプロフィールの取得が失敗する', () => {
      line = stubLineFetch({ profile: 'fail' });
    });
    When('画面がその ID トークンでセッションを求める', postSession);
    Then('応答は 503 で理由は SERVICE_TEMPORARILY_UNAVAILABLE になる', () =>
      expectStatus(503, 'SERVICE_TEMPORARILY_UNAVAILABLE'),
    );
    And('セッションは出ない', () => expect(bodyOf().sessionToken).toBeUndefined());
    And('何も記録されない', () => expect(world.users.size).toBe(0));
  });

  Scenario('セッションなしの GET /v1/me は 401', ({ Given, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    When('画面がセッションなしで自分の情報を求める', () => getMe(undefined));
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
  });

  Scenario('期限切れのセッションの GET /v1/me は 401', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('花子さんのセッションがある', obtainSession);
    And('1 時間と 1 分が過ぎた', () => {
      vi.setSystemTime(new Date(START.getTime() + 61 * 60_000));
    });
    When('画面がそのセッションで自分の情報を求める', () => getMe(sessionToken));
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
  });

  Scenario('alg を変えたセッションの GET /v1/me は 401', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('署名のない alg none のセッションがある', () => {
      const exp = START.getTime() / 1000 + 3600;
      sessionToken = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ userId: HANAKO_USER_ID, exp })}.`;
    });
    When('画面がそのセッションで自分の情報を求める', () => getMe(sessionToken));
    Then('応答は 401 で理由は UNAUTHENTICATED になる', () => expectStatus(401, 'UNAUTHENTICATED'));
  });

  Scenario('家族に入っていない友だちは family が null', ({ Given, And, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが記録されている', seedHanakoWithoutFamily);
    And('花子さんのセッションがある', obtainSession);
    When('画面がそのセッションで自分の情報を求める', () => getMe(sessionToken));
    Then('応答は 200 になる', () => expectStatus(200));
    And('自分の情報は花子さんの表示名で family が null である', () => {
      expect(bodyOf()).toEqual({ userId: HANAKO_USER_ID, displayName: '花子', family: null });
    });
  });

  Scenario('家族に入っている人は家族と役割が返る', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('花子さんのセッションがある', obtainSession);
    When('画面がそのセッションで自分の情報を求める', () => getMe(sessionToken));
    Then('応答は 200 になる', () => expectStatus(200));
    And('自分の情報に家族の名前と子供の役割とお知らせ先が未登録であることが入っている', () => {
      expect(bodyOf()).toEqual({
        userId: HANAKO_USER_ID,
        displayName: '花子',
        family: {
          familyId: 'fam-1',
          name: '田中家',
          role: 'child',
          notificationGroupRegistered: false,
        },
      });
    });
  });

  Scenario('セッションのあとでブロックした人の GET /v1/me は 403', ({ Given, And, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    And('花子さんのセッションがある', obtainSession);
    And('花子さんがその後ブロックした', () => {
      (world.users.get(HANAKO_USER_ID) as Record<string, unknown>).friendStatus = 'blocked';
    });
    When('画面がそのセッションで自分の情報を求める', () => getMe(sessionToken));
    Then('応答は 403 で理由は NOT_FRIEND になる', () => expectStatus(403, 'NOT_FRIEND'));
  });

  Scenario('家族に入っていない人が家族のデータを求めると 403', ({ Given, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが記録されている', seedHanakoWithoutFamily);
    When('花子さんが家族のデータの確かめを通ろうとする', () =>
      runChecks((auth) => requireMembership(auth)),
    );
    Then('理由 NOT_FAMILY_MEMBER の 403 で断られる', () =>
      expectRejected(403, 'NOT_FAMILY_MEMBER'),
    );
  });

  Scenario('子供が管理者の操作をすると 403', ({ Given, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    When('花子さんが管理者の操作の確かめを通ろうとする', () =>
      runChecks((auth) => requireAdmin(requireMembership(auth))),
    );
    Then('理由 ADMIN_ONLY の 403 で断られる', () => expectRejected(403, 'ADMIN_ONLY'));
  });

  Scenario('ほかの家族の ID を指定すると 404', ({ Given, When, Then }) => {
    Given('家族に入っている友だちの花子さんが記録されている', () => seedHanako());
    When('花子さんがほかの家族の ID を指定する', () =>
      runChecks((auth) => requireSameFamily(requireMembership(auth), 'fam-other')),
    );
    Then('理由 NOT_FOUND の 404 で断られる', () => expectRejected(404, 'NOT_FOUND'));
  });
});
