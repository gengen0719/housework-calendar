import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import {
  GROUP_JOIN_GUIDE,
  GROUP_REGISTER_BUTTON,
  GROUP_REGISTER_IN_GROUP_ONLY,
  NOTIFICATION_GROUP_ADMIN_ONLY,
  MESSAGES,
} from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/line';
import type { NotificationGroup } from '../../src/models';
import {
  FAMILY_ID,
  FAMILY_NAME,
  PEOPLE,
  seedFamily,
  seedUser,
} from '../u2-invitation/helpers/seed';
import { setupWorld, stubLineFetch, webhookRequest } from '../u1-skeleton-family/helpers/world';
import { GROUP_ID, joinEvent, messageEvent, postbackEvent } from './helpers/events';

const feature = await loadFeature(
  'packages/backend/test/u3-notification-group/register-group.feature',
);

const GROUP_NAME = '山田家のグループ';
const OTHER_FAMILY_ID = 'fam-sato';
const OLD_GROUP_ID = 'C_old';
const OTHER_GROUP_ID = 'C_other';
const SEEDED_AT = '2026-11-01T00:00:00.000Z';

type World = ReturnType<typeof setupWorld>;
type SummaryMode = 'ok' | 'http500' | 'timeout';

let world: World;
let line: ReturnType<typeof stubLineFetch>;
let response: APIGatewayProxyStructuredResultV2;
let logs: string[];
let events: unknown[];
let summaryMode: SummaryMode;
let replyOk: boolean;
let summaryCalls: string[];

/** LINE の API の差し替え。グループの概要と reply の失敗を、場面ごとに切り替えられるようにする。 */
function installLine(): void {
  line = stubLineFetch();
  const baseFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/summary')) {
        summaryCalls.push(url);
        if (summaryMode === 'timeout') throw new DOMException('timed out', 'TimeoutError');
        if (summaryMode === 'http500') return new Response('error', { status: 500 });
        return new Response(JSON.stringify({ groupId: GROUP_ID, groupName: GROUP_NAME }), {
          status: 200,
        });
      }
      if (url.includes('/message/reply') && !replyOk) {
        line.calls.push({
          url,
          method: init?.method ?? 'GET',
          body: JSON.parse(String(init?.body)),
        });
        return new Response('error', { status: 500 });
      }
      return baseFetch(input, init);
    }),
  );
}

async function send(): Promise<void> {
  response = (await handler(webhookRequest({ events }))) as APIGatewayProxyStructuredResultV2;
}

function seedGroup(groupId: string, familyId: string): void {
  const group: NotificationGroup = {
    groupId,
    familyId,
    registeredByUserId: 'user-someone',
    registeredAt: SEEDED_AT,
  };
  world.notificationGroups.set(groupId, { ...group });
}

function seedYamada(): void {
  seedFamily(world.families);
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
}

function seedSato(): void {
  seedFamily(world.families, {
    familyId: OTHER_FAMILY_ID,
    name: '佐藤家',
    adminUserId: 'user-sato',
  });
}

function yamada(): Record<string, unknown> | undefined {
  return world.families.get(FAMILY_ID);
}

interface ReplyBody {
  replyToken: string;
  messages: { type: string; text?: string; template?: Record<string, unknown> }[];
}

function replyBodies(): ReplyBody[] {
  return line.replies().map((call) => call.body as ReplyBody);
}

function replyTexts(): string[] {
  return replyBodies().flatMap((body) =>
    body.messages.flatMap((m) => (m.type === 'text' && m.text !== undefined ? [m.text] : [])),
  );
}

function expectRegisteredYamada(expectedName: string | undefined): void {
  const group = world.notificationGroups.get(GROUP_ID);
  expect(group).toMatchObject({
    groupId: GROUP_ID,
    familyId: FAMILY_ID,
    registeredByUserId: PEOPLE.mother.userId,
  });
  expect(typeof group?.registeredAt).toBe('string');
  expect(group?.groupName).toBe(expectedName);
}

function expectRegisteredReply(): void {
  const texts = replyTexts();
  expect(texts).toHaveLength(1);
  expect(texts[0]?.startsWith(`このグループを${FAMILY_NAME}のお知らせ先にしました。`)).toBe(true);
}

function expectOnlyNewGroup(): void {
  expect([...world.notificationGroups.keys()]).toEqual([GROUP_ID]);
  expect(world.notificationGroups.get(GROUP_ID)?.familyId).toBe(FAMILY_ID);
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    summaryMode = 'ok';
    replyOk = true;
    summaryCalls = [];
    logs = [];
    events = [];
    installLine();
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
  });

  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  Scenario(
    '公式アカウントがグループに参加すると、ボタンつきの案内が届く',
    ({ Given, When, Then, And }) => {
      Given('公式アカウントが家族のグループに招待される', () => {
        events = [joinEvent('evt-join-ok')];
      });
      When('Webhook が届く', send);
      Then('応答は 200 になる', () => {
        expect(response.statusCode).toBe(200);
      });
      And('案内と「このグループをお知らせ先にする」ボタンが reply で届く', () => {
        const [body] = replyBodies();
        expect(body?.replyToken).toBe('reply-evt-join-ok');
        const template = body?.messages[0]?.template as {
          text: string;
          actions: { label: string }[];
        };
        expect(template.text).toBe(GROUP_JOIN_GUIDE);
        expect(template.actions[0]?.label).toBe(GROUP_REGISTER_BUTTON);
      });
      And('ボタンを押すと登録の操作の postback が送られる', () => {
        const template = replyBodies()[0]?.messages[0]?.template as {
          actions: { type: string; data: string }[];
        };
        expect(template.actions[0]).toMatchObject({
          type: 'postback',
          data: 'action=group.register',
        });
      });
    },
  );

  Scenario('複数人のトーク（room）に参加しても何も届かない', ({ Given, When, Then, And }) => {
    Given('公式アカウントが複数人のトーク（room）に招待される', () => {
      events = [joinEvent('evt-join-room', { kind: 'room' })];
    });
    When('Webhook が届く', send);
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('返事は送られない', () => {
      expect(line.replies()).toHaveLength(0);
    });
  });

  Scenario(
    '管理者がボタンを押すと、そのグループがお知らせ先になる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('山田家にはお知らせ先がない', () => {
        expect(yamada()?.notificationGroupId).toBeUndefined();
      });
      And('グループの名前は「山田家のグループ」として受け取れる', () => {
        summaryMode = 'ok';
      });
      When('お母さんが家族のグループで登録のボタンを押す', async () => {
        events = [postbackEvent('evt-pb-reg', 'action=group.register')];
        await send();
      });
      Then('応答は 200 になる', () => {
        expect(response.statusCode).toBe(200);
      });
      And('そのグループが山田家のお知らせ先として、名前と登録した人つきで記録される', () => {
        expectRegisteredYamada(GROUP_NAME);
      });
      And('山田家の記録がそのグループを指す', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario('管理者が「登録」と送っても登録できる', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者としている', seedYamada);
    And('山田家にはお知らせ先がない', () => {
      expect(yamada()?.notificationGroupId).toBeUndefined();
    });
    And('グループの名前は「山田家のグループ」として受け取れる', () => {
      summaryMode = 'ok';
    });
    When('お母さんが家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-msg-reg', '登録')];
      await send();
    });
    Then('そのグループが山田家のお知らせ先として、名前と登録した人つきで記録される', () => {
      expectRegisteredYamada(GROUP_NAME);
    });
    And(
      '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
      expectRegisteredReply,
    );
  });

  Scenario(
    '別のグループで登録すると、お知らせ先が新しいグループに置き換わる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('山田家は前のグループ「C_old」をお知らせ先にしている', () => {
        seedGroup(OLD_GROUP_ID, FAMILY_ID);
        world.families.set(FAMILY_ID, { ...yamada(), notificationGroupId: OLD_GROUP_ID });
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-msg-replace', '登録')];
        await send();
      });
      Then('山田家のお知らせ先の記録は新しいグループの 1 件だけである', expectOnlyNewGroup);
      And('山田家の記録が新しいグループを指す', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
      });
      And('前のグループには何も送られない', () => {
        expect(line.calls.some((c) => c.url.includes('/push'))).toBe(false);
        expect(JSON.stringify(line.calls.map((c) => c.body))).not.toContain(OLD_GROUP_ID);
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario('同じグループで登録し直しても、同じ返事で記録は 1 つ', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者としている', seedYamada);
    And('山田家にはお知らせ先がない', () => {
      expect(yamada()?.notificationGroupId).toBeUndefined();
    });
    When('お母さんが家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-msg-1', '登録')];
      await send();
    });
    And('お母さんがもう一度、別のイベントで家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-msg-2', '登録')];
      await send();
    });
    Then('山田家のお知らせ先の記録は新しいグループの 1 件だけである', expectOnlyNewGroup);
    And('同じ返事が 2 回届く', () => {
      const texts = replyTexts();
      expect(texts).toHaveLength(2);
      expect(texts[0]).toBe(texts[1]);
    });
  });

  Scenario('子供が登録しようとすると断られる', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者として、太郎さんが子供としている', () => {
      seedYamada();
      seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    });
    When('太郎さんが家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-child', '登録', { lineUserId: 'U_taro' })];
      await send();
    });
    Then('お知らせ先の記録は 1 件もない', () => {
      expect(world.notificationGroups.size).toBe(0);
      expect(yamada()?.notificationGroupId).toBeUndefined();
    });
    And('「お知らせ先を登録できるのは管理者だけです」という返事が届く', () => {
      expect(replyTexts()).toEqual([NOTIFICATION_GROUP_ADMIN_ONLY]);
    });
  });

  Scenario(
    '家族に入っていない人・記録がない人・ブロック中の管理者・送り主が分からないイベントも同じ文言で断られる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('家族に入っていない花子さんがいる', () => {
        seedUser(world.users, 'hanako');
      });
      And('ブロック中の管理者の次郎さんがいる', () => {
        seedUser(world.users, 'jiro', {
          familyId: FAMILY_ID,
          role: 'admin',
          friendStatus: 'blocked',
        });
      });
      When(
        '花子さん、記録のない人、ブロック中の次郎さん、送り主が分からないイベントが、それぞれ家族のグループで「登録」と送る',
        async () => {
          events = [
            messageEvent('evt-o-1', '登録', { lineUserId: 'U_hanako' }),
            messageEvent('evt-o-2', '登録', { lineUserId: 'U_nobody' }),
            messageEvent('evt-o-3', '登録', { lineUserId: 'U_jiro' }),
            messageEvent('evt-o-4', '登録', { lineUserId: undefined }),
          ];
          await send();
        },
      );
      Then('お知らせ先の記録は 1 件もない', () => {
        expect(world.notificationGroups.size).toBe(0);
        expect(yamada()?.notificationGroupId).toBeUndefined();
      });
      And('「お知らせ先を登録できるのは管理者だけです」という返事が 4 件届く', () => {
        expect(replyTexts()).toEqual(Array(4).fill(NOTIFICATION_GROUP_ADMIN_ONLY));
      });
    },
  );

  Scenario(
    '別の家族のお知らせ先になっているグループは断られ、元の家族のお知らせ先は変わらない',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('そのグループは佐藤家のお知らせ先になっている', () => {
        seedSato();
        seedGroup(GROUP_ID, OTHER_FAMILY_ID);
        world.families.set(OTHER_FAMILY_ID, {
          ...world.families.get(OTHER_FAMILY_ID),
          notificationGroupId: GROUP_ID,
        });
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-taken', '登録')];
        await send();
      });
      Then('「このグループはほかの家族のお知らせ先になっています」という返事が届く', () => {
        expect(replyTexts()).toEqual([MESSAGES.GROUP_USED_BY_OTHER_FAMILY]);
      });
      And('そのグループは佐藤家のお知らせ先のままである', () => {
        expect(world.notificationGroups.get(GROUP_ID)?.familyId).toBe(OTHER_FAMILY_ID);
        expect(world.families.get(OTHER_FAMILY_ID)?.notificationGroupId).toBe(GROUP_ID);
      });
      And('グループの名前は LINE に問い合わせていない', () => {
        expect(summaryCalls).toHaveLength(0);
      });
    },
  );

  Scenario(
    '1 対 1 のトークで「登録」と送ると、グループの中で行うよう案内される',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      When('お母さんが 1 対 1 のトークで「登録」と送る', async () => {
        events = [messageEvent('evt-one', '登録', { kind: 'user' })];
        await send();
      });
      Then('お知らせ先の記録は 1 件もない', () => {
        expect(world.notificationGroups.size).toBe(0);
      });
      And(
        '「お知らせ先の登録は、家族のグループ LINE の中で行ってください」という返事が届く',
        () => {
          expect(replyTexts()).toEqual([GROUP_REGISTER_IN_GROUP_ONLY]);
        },
      );
    },
  );

  Scenario('グループの名前を LINE が返せなくても登録できる', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者としている', seedYamada);
    And('グループの名前を LINE に問い合わせると 500 が返る', () => {
      summaryMode = 'http500';
    });
    When('お母さんが家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-name-500', '登録')];
      await send();
    });
    Then('そのグループが名前が空のまま山田家のお知らせ先として記録される', () => {
      expectRegisteredYamada(undefined);
      expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
    });
    And(
      '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
      expectRegisteredReply,
    );
  });

  Scenario(
    'グループの名前の受け取りが時間切れになっても登録できる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('グループの名前を LINE に問い合わせると時間切れになる', () => {
        summaryMode = 'timeout';
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-name-timeout', '登録')];
        await send();
      });
      Then('そのグループが名前が空のまま山田家のお知らせ先として記録される', () => {
        expectRegisteredYamada(undefined);
        expect(logs.some((l) => l.includes('GROUP_SUMMARY_FAILED') && l.includes('timeout'))).toBe(
          true,
        );
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario(
    '2 つの家族の管理者が同じグループで同時に登録すると、先の 1 つだけが登録される',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('山田家が読んだあとで、佐藤家が先にそのグループを登録する', () => {
        seedSato();
        world.hooks.beforeNextTransaction = () => {
          seedGroup(GROUP_ID, OTHER_FAMILY_ID);
          world.families.set(OTHER_FAMILY_ID, {
            ...world.families.get(OTHER_FAMILY_ID),
            notificationGroupId: GROUP_ID,
          });
        };
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-race-1', '登録')];
        await send();
      });
      Then('「このグループはほかの家族のお知らせ先になっています」という返事が届く', () => {
        expect(replyTexts()).toEqual([MESSAGES.GROUP_USED_BY_OTHER_FAMILY]);
      });
      And('そのグループは佐藤家のお知らせ先のままである', () => {
        expect(world.notificationGroups.get(GROUP_ID)?.familyId).toBe(OTHER_FAMILY_ID);
        expect(world.families.get(OTHER_FAMILY_ID)?.notificationGroupId).toBe(GROUP_ID);
      });
      And('山田家の記録はそのグループを指していない', () => {
        expect(yamada()?.notificationGroupId).toBeUndefined();
      });
    },
  );

  Scenario(
    '同じ家族の管理者が 2 つのグループで同時に登録すると、家族のお知らせ先は 1 つだけになる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('山田家にはお知らせ先がない', () => {
        expect(yamada()?.notificationGroupId).toBeUndefined();
      });
      And('山田家が読んだあとで、山田家が別のグループ「C_other」を先に登録する', () => {
        world.hooks.beforeNextTransaction = () => {
          seedGroup(OTHER_GROUP_ID, FAMILY_ID);
          world.families.set(FAMILY_ID, { ...yamada(), notificationGroupId: OTHER_GROUP_ID });
        };
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-race-2', '登録')];
        await send();
      });
      Then('山田家のお知らせ先の記録は新しいグループの 1 件だけである', expectOnlyNewGroup);
      And('山田家の記録が新しいグループを指す', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario(
    '家族のお知らせ先の記録がテーブルにないときも、登録し直せる',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And('山田家は前のグループ「C_old」を指しているが、そのグループの記録はテーブルにない', () => {
        world.families.set(FAMILY_ID, { ...yamada(), notificationGroupId: OLD_GROUP_ID });
      });
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-rollback', '登録')];
        await send();
      });
      Then('山田家のお知らせ先の記録は新しいグループの 1 件だけである', expectOnlyNewGroup);
      And('山田家の記録が新しいグループを指す', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario(
    'グループの記録は残っているが家族が指していないとき、登録し直すと直る',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', seedYamada);
      And(
        'そのグループの記録は山田家のものとして残っているが、山田家の記録はそのグループを指していない',
        () => {
          seedGroup(GROUP_ID, FAMILY_ID);
          expect(yamada()?.notificationGroupId).toBeUndefined();
        },
      );
      When('お母さんが家族のグループで「登録」と送る', async () => {
        events = [messageEvent('evt-mismatch', '登録')];
        await send();
      });
      Then('山田家のお知らせ先の記録は新しいグループの 1 件だけである', expectOnlyNewGroup);
      And('山田家の記録が新しいグループを指す', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
      });
      And(
        '「このグループを山田家のお知らせ先にしました。」から始まる返事が届く',
        expectRegisteredReply,
      );
    },
  );

  Scenario('reply が失敗しても登録は残る', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者としている', seedYamada);
    And('山田家にはお知らせ先がない', () => {
      expect(yamada()?.notificationGroupId).toBeUndefined();
    });
    And('返事の送信が LINE で失敗する', () => {
      replyOk = false;
    });
    When('お母さんが家族のグループで「登録」と送る', async () => {
      events = [messageEvent('evt-reply-fail', '登録')];
      await send();
    });
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('そのグループが山田家のお知らせ先として、名前と登録した人つきで記録される', () => {
      expectRegisteredYamada(GROUP_NAME);
      expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
    });
    And('返事の失敗が警告としてログに残る', () => {
      expect(
        logs.some((l) => l.includes('"level":"warn"') && l.includes('LINE_REPLY_FAILED')),
      ).toBe(true);
    });
  });

  Scenario('ログにグループの名前・会話の本文・表示名が出ない', ({ Given, When, Then, And }) => {
    Given('山田家にはお母さんが管理者としている', seedYamada);
    And('山田家にはお知らせ先がない', () => {
      expect(yamada()?.notificationGroupId).toBeUndefined();
    });
    And('グループの名前は「山田家のグループ」として受け取れる', () => {
      summaryMode = 'ok';
    });
    When('お母さんが家族のグループで「 登録 」と送る', async () => {
      events = [messageEvent('evt-log', ' 登録 ')];
      await send();
    });
    Then('どのログの行にもグループの名前と本文と表示名が出ない', () => {
      expect(logs.some((l) => l.includes('NOTIFICATION_GROUP_REGISTERED'))).toBe(true);
      const all = logs.join('\n');
      expect(all).not.toContain(GROUP_NAME);
      expect(all).not.toContain(PEOPLE.mother.displayName);
      expect(all).not.toContain('登録');
    });
  });
});
