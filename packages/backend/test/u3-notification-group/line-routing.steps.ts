import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/line';
import type { User } from '../../src/models';
import {
  followEvent,
  HANAKO_LINE_ID,
  setupWorld,
  stubLineFetch,
  unfollowEvent,
  webhookRequest,
} from '../u1-skeleton-family/helpers/world';
import { joinEvent, leaveEvent, messageEvent, postbackEvent } from './helpers/events';

const feature = await loadFeature(
  'packages/backend/test/u3-notification-group/line-routing.feature',
);

type World = ReturnType<typeof setupWorld>;
let world: World;
let line: ReturnType<typeof stubLineFetch>;
let response: APIGatewayProxyStructuredResultV2;
let logs: string[];
let events: unknown[];
let signature: string | undefined;

async function send(): Promise<void> {
  response = (await handler(
    webhookRequest({ events }, signature === undefined ? {} : { signature }),
  )) as APIGatewayProxyStructuredResultV2;
}

function ignoredLogged(): boolean {
  return logs.some((l) => l.includes('"event":"LINE_EVENT_IGNORED"'));
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    line = stubLineFetch();
    logs = [];
    events = [];
    signature = undefined;
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
  });

  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  Scenario('グループでのただの会話は記録も返事もない', ({ Given, When, Then, And }) => {
    Given('家族のグループで「今日の夕飯どうする？」と送られる', () => {
      events = [messageEvent('evt-chat-1', '今日の夕飯どうする？')];
    });
    When('Webhook が届く', send);
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('二度処理しない記録は書かれない', () => {
      expect(world.events.size).toBe(0);
    });
    And('返事は送られない', () => {
      expect(line.replies()).toHaveLength(0);
    });
    And('イベントは無視されたとログに残る', () => {
      expect(ignoredLogged()).toBe(true);
    });
  });

  Scenario('「登録」と送ると登録の操作として扱われる', ({ Given, When, Then, And }) => {
    Given('家族のグループで「 登録 」と送られる', () => {
      events = [messageEvent('evt-reg-1', ' 登録 ')];
    });
    When('Webhook が届く', send);
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('そのイベントは操作として処理済みの記録になる', () => {
      expect(world.events.get('evt-reg-1')?.status).toBe('done');
    });
  });

  Scenario('似た文字では登録の操作にならない', ({ Given, When, Then, And }) => {
    Given('家族のグループで「登録して」と送られる', () => {
      events = [messageEvent('evt-like-1', '登録して')];
    });
    When('Webhook が届く', send);
    Then('二度処理しない記録は書かれない', () => {
      expect(world.events.size).toBe(0);
    });
    And('イベントは無視されたとログに残る', () => {
      expect(ignoredLogged()).toBe(true);
    });
  });

  Scenario('「とうろく」でも登録の操作にならない', ({ Given, When, Then }) => {
    Given('家族のグループで「とうろく」と送られる', () => {
      events = [messageEvent('evt-like-2', 'とうろく')];
    });
    When('Webhook が届く', send);
    Then('二度処理しない記録は書かれない', () => {
      expect(world.events.size).toBe(0);
    });
  });

  Scenario(
    '知らない postback の data と 300 文字を超える data は何もしない',
    ({ Given, When, Then, And }) => {
      Given(
        '家族のグループで知らない data の postback と、300 文字を超える data の postback が届く',
        () => {
          events = [
            postbackEvent('evt-pb-1', 'action=group.unknown'),
            postbackEvent('evt-pb-2', `action=group.register&pad=${'a'.repeat(300)}`),
          ];
        },
      );
      When('Webhook が届く', send);
      Then('応答は 200 になる', () => {
        expect(response.statusCode).toBe(200);
      });
      And('二度処理しない記録は書かれない', () => {
        expect(world.events.size).toBe(0);
      });
      And('返事は送られない', () => {
        expect(line.replies()).toHaveLength(0);
      });
    },
  );

  Scenario('決まった data の postback は登録の操作として扱われる', ({ Given, When, Then }) => {
    Given('家族のグループでボタンの postback「action=group.register」が届く', () => {
      events = [postbackEvent('evt-pb-ok', 'action=group.register')];
    });
    When('Webhook が届く', send);
    Then('そのイベントは操作として処理済みの記録になる', () => {
      expect(world.events.get('evt-pb-ok')?.status).toBe('done');
    });
  });

  Scenario(
    '5000 文字を超える文字が届いても本文全体は 400 にならず、そのイベントだけ何もしない',
    ({ Given, When, Then, And }) => {
      Given('家族のグループで 5001 文字の文字と「登録」が同じ Webhook に入って届く', () => {
        events = [messageEvent('evt-long-1', '登'.repeat(5001)), messageEvent('evt-reg-2', '登録')];
      });
      When('Webhook が届く', send);
      Then('応答は 200 になる', () => {
        expect(response.statusCode).toBe(200);
      });
      And('処理済みの記録は「登録」のイベントの 1 件だけである', () => {
        expect([...world.events.keys()]).toEqual(['evt-reg-2']);
      });
    },
  );

  Scenario(
    '署名のない join・leave・postback は 401 で処理されない',
    ({ Given, When, Then, And }) => {
      Given(
        '家族のグループの join と leave と postback が入った Webhook を間違った署名で届ける',
        () => {
          events = [
            joinEvent('evt-join-1'),
            leaveEvent('evt-leave-1'),
            postbackEvent('evt-pb-3', 'action=group.register'),
          ];
          signature = 'bm90LXRoZS1yaWdodC1zaWduYXR1cmU=';
        },
      );
      When('Webhook が届く', send);
      Then('応答は 401 になる', () => {
        expect(response.statusCode).toBe(401);
      });
      And('二度処理しない記録は書かれない', () => {
        expect(world.events.size).toBe(0);
      });
    },
  );

  Scenario('follow と unfollow は U1 と同じに動く', ({ Given, When, Then, And }) => {
    Given('花子さんの友だち登録とブロックが続けて届く', () => {
      events = [followEvent('evt-f-1'), unfollowEvent('evt-u-1')];
    });
    When('Webhook が届く', send);
    Then('応答は 200 になる', () => {
      expect(response.statusCode).toBe(200);
    });
    And('花子さんはブロック中と記録される', () => {
      const hanako = [...world.users.values()].find((u) => u.lineUserId === HANAKO_LINE_ID) as
        User | undefined;
      expect(hanako?.friendStatus).toBe('blocked');
    });
    And('二度処理しない記録は 2 件とも処理済みになる', () => {
      expect(world.events.get('evt-f-1')?.status).toBe('done');
      expect(world.events.get('evt-u-1')?.status).toBe('done');
    });
  });

  Scenario(
    '1 対 1 のトークで「登録」と送ると操作として扱われ、room では扱われない',
    ({ Given, When, Then }) => {
      Given('1 対 1 のトークの「登録」と、複数人のトーク（room）の「登録」が届く', () => {
        events = [
          messageEvent('evt-one-1', '登録', { kind: 'user' }),
          messageEvent('evt-room-1', '登録', { kind: 'room' }),
        ];
      });
      When('Webhook が届く', send);
      Then('処理済みの記録は 1 対 1 のイベントの 1 件だけである', () => {
        expect([...world.events.keys()]).toEqual(['evt-one-1']);
      });
    },
  );
});
