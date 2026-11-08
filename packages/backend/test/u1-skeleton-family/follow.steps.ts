import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/line';
import type { User } from '../../src/models';
import { FAKE_WRONG_LINE_SIGNATURE } from '../fixtures/fakeSecrets';
import {
  followEvent,
  HANAKO_LINE_ID,
  LIFF_URL,
  setupWorld,
  stubLineFetch,
  unfollowEvent,
  webhookRequest,
} from './helpers/world';

const feature = await loadFeature('packages/backend/test/u1-skeleton-family/follow.feature');

type World = ReturnType<typeof setupWorld>;
let world: World;
let line: ReturnType<typeof stubLineFetch>;
let response: APIGatewayProxyStructuredResultV2;

const EVENT_ID = 'evt-follow-1';

function seedHanako(overrides: Partial<User> = {}): void {
  const user: User = {
    userId: 'user-hanako',
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
}

function hanakoRecords(): User[] {
  return [...world.users.values()].filter(
    (u) => u.lineUserId === HANAKO_LINE_ID,
  ) as unknown as User[];
}

async function send(...args: Parameters<typeof webhookRequest>): Promise<void> {
  response = (await handler(webhookRequest(...args))) as APIGatewayProxyStructuredResultV2;
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    line = stubLineFetch();
  });

  AfterEachScenario(() => {
    vi.unstubAllGlobals();
  });

  Scenario('初めて友だち登録すると利用者が記録され返事が届く', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    When('花子さんが公式アカウントを友だち登録する', async () => {
      await send({ events: [followEvent()] });
    });
    Then('花子さんは友だちとして 1 人だけ記録される', () => {
      const records = hanakoRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.friendStatus).toBe('friend');
    });
    And('表示名は LINE から受け取った「花子」になる', () => {
      expect(hanakoRecords()[0]?.displayName).toBe('花子');
    });
    And('あいさつとアプリを開くボタンと使い始め方の説明が返事として届く', () => {
      const replies = line.replies();
      expect(replies).toHaveLength(1);
      const body = replies[0]?.body as { replyToken: string; messages: { type: string }[] };
      expect(body.replyToken).toBe(`reply-${EVENT_ID}`);
      const serialized = JSON.stringify(body.messages);
      expect(serialized).toContain(LIFF_URL);
      expect(serialized).toContain('家族を作る');
      expect(serialized).toContain('招待を待つ');
      expect(body.messages.map((m) => m.type)).toEqual(['text', 'template']);
    });
    And('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
  });

  Scenario(
    'ブロックして登録し直しても記録は 1 人のままで表示名と家族は変わらない',
    ({ Given, When, Then, And }) => {
      Given('家族に入っている花子さんが表示名「花子」で記録されている', () => {
        seedHanako();
      });
      And('花子さんはブロック中である', () => {
        seedHanako({ friendStatus: 'blocked' });
      });
      When('花子さんが表示名「はなこ」で友だち登録し直す', async () => {
        line = stubLineFetch({ displayName: 'はなこ' });
        await send({ events: [followEvent('evt-follow-2')] });
      });
      Then('花子さんの記録は 1 人のままである', () => {
        expect(hanakoRecords()).toHaveLength(1);
      });
      And('表示名は最初の「花子」のままである', () => {
        expect(hanakoRecords()[0]?.displayName).toBe('花子');
      });
      And('花子さんは友だちに戻る', () => {
        expect(hanakoRecords()[0]?.friendStatus).toBe('friend');
      });
      And('家族と役割は前と同じである', () => {
        expect(hanakoRecords()[0]?.familyId).toBe('fam-1');
        expect(hanakoRecords()[0]?.role).toBe('child');
      });
    },
  );

  Scenario('ブロックするとブロック中になり返事はしない', ({ Given, When, Then, And }) => {
    Given('家族に入っている花子さんが表示名「花子」で記録されている', () => {
      seedHanako();
    });
    When('花子さんが公式アカウントをブロックする', async () => {
      await send({ events: [unfollowEvent()] });
    });
    Then('花子さんはブロック中と記録される', () => {
      expect(hanakoRecords()[0]?.friendStatus).toBe('blocked');
    });
    And('家族と役割は消えない', () => {
      expect(hanakoRecords()[0]?.familyId).toBe('fam-1');
      expect(hanakoRecords()[0]?.role).toBe('child');
    });
    And('返事は送られない', () => {
      expect(line.replies()).toHaveLength(0);
    });
    And('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
  });

  Scenario('署名が合わないと 401 で何も記録しない', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    When('間違った署名で友だち登録の Webhook が届く', async () => {
      await send({ events: [followEvent()] }, { signature: FAKE_WRONG_LINE_SIGNATURE });
    });
    Then('応答は 401 になる', () => {
      expect(response.statusCode).toBe(401);
    });
    And('何も記録されない', () => {
      expect(world.users.size).toBe(0);
      expect(world.events.size).toBe(0);
    });
  });

  Scenario('Base64 で届いた本文でも署名を正しく確かめる', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    When('本文が Base64 で届いた友だち登録の Webhook が正しい署名で届く', async () => {
      await send({ events: [followEvent()] }, { base64: true });
    });
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('花子さんは友だちとして 1 人だけ記録される', () => {
      expect(hanakoRecords()).toHaveLength(1);
    });
  });

  Scenario('CloudFront の秘密のヘッダーがないと 403', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    When('秘密のヘッダーなしで友だち登録の Webhook が届く', async () => {
      await send({ events: [followEvent()] }, { origin: null });
    });
    Then('応答は 403 になる', () => {
      expect(response.statusCode).toBe(403);
    });
    And('何も記録されない', () => {
      expect(world.users.size).toBe(0);
      expect(world.events.size).toBe(0);
    });
  });

  Scenario('同じイベント ID が 2 回届いても 1 回だけ処理する', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    When('同じイベント ID の友だち登録の Webhook が 2 回届く', async () => {
      await send({ events: [followEvent()] });
      await send({ events: [followEvent()] });
    });
    Then('返事は 1 回だけ送られる', () => {
      expect(line.replies()).toHaveLength(1);
    });
    And('花子さんは友だちとして 1 人だけ記録される', () => {
      expect(hanakoRecords()).toHaveLength(1);
      expect(response.statusCode).toBe(200);
    });
  });

  Scenario('処理中のまま 2 分を過ぎたイベントは処理し直す', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    And('同じイベント ID が 3 分前から処理中のまま残っている', () => {
      world.events.set(EVENT_ID, {
        webhookEventId: EVENT_ID,
        status: 'processing',
        receivedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      });
    });
    When('同じイベント ID の友だち登録の Webhook が届く', async () => {
      await send({ events: [followEvent()] });
    });
    Then('花子さんは友だちとして 1 人だけ記録される', () => {
      expect(hanakoRecords()).toHaveLength(1);
    });
    And('返事は 1 回だけ送られる', () => {
      expect(line.replies()).toHaveLength(1);
    });
    And('イベントは処理済みになる', () => {
      expect(world.events.get(EVENT_ID)?.status).toBe('done');
    });
  });

  Scenario('処理中のイベントが 2 分以内ならもう一度は処理しない', ({ Given, When, Then, And }) => {
    Given('花子さんはまだ記録されていない', () => {
      expect(hanakoRecords()).toHaveLength(0);
    });
    And('同じイベント ID が 30 秒前から処理中のまま残っている', () => {
      world.events.set(EVENT_ID, {
        webhookEventId: EVENT_ID,
        status: 'processing',
        receivedAt: new Date(Date.now() - 30_000).toISOString(),
      });
    });
    When('同じイベント ID の友だち登録の Webhook が届く', async () => {
      await send({ events: [followEvent()] });
    });
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('何も記録されない', () => {
      expect(world.users.size).toBe(0);
    });
    And('返事は送られない', () => {
      expect(line.replies()).toHaveLength(0);
    });
  });

  Scenario(
    '処理中に思いがけない失敗が起きると処理中の記録を消して 500 を返す',
    ({ Given, When, Then, And }) => {
      Given('花子さんはまだ記録されていない', () => {
        expect(hanakoRecords()).toHaveLength(0);
      });
      And('LINE のプロフィールの取得が失敗する', () => {
        line = stubLineFetch({ profile: 'fail' });
      });
      When('花子さんが公式アカウントを友だち登録する', async () => {
        await send({ events: [followEvent()] });
      });
      Then('応答は 500 になる', () => {
        expect(response.statusCode).toBe(500);
      });
      And('そのイベントの処理中の記録は消えている', () => {
        expect(world.events.has(EVENT_ID)).toBe(false);
      });
      And('何も記録されない', () => {
        expect(world.users.size).toBe(0);
      });
    },
  );
});
