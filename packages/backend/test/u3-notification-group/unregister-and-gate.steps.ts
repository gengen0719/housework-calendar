import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { MESSAGES } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/line';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import * as groupCommandGate from '../../src/services/groupCommandGate';
import { FAMILY_ID, PEOPLE, seedFamily, seedUser } from '../u2-invitation/helpers/seed';
import { setupWorld, stubLineFetch, webhookRequest } from '../u1-skeleton-family/helpers/world';
import { GROUP_ID, leaveEvent } from './helpers/events';

const feature = await loadFeature(
  'packages/backend/test/u3-notification-group/unregister-and-gate.feature',
);

const OLD_GROUP_ID = 'C_old';
const SATO_FAMILY_ID = 'fam-sato';
/** 登録した時刻（2026-11-02 00:00 UTC）と、それより前・後の leave の時刻 */
const REGISTERED_AT = '2026-11-02T00:00:00.000Z';
const BEFORE_REGISTERED = Date.parse('2026-11-01T12:00:00.000Z');
const AFTER_REGISTERED = Date.parse('2026-11-03T00:00:00.000Z');

type World = ReturnType<typeof setupWorld>;
type GateOutcome = Awaited<ReturnType<typeof groupCommandGate.runGroupOperation<string>>>;

let world: World;
let line: ReturnType<typeof stubLineFetch>;
let response: APIGatewayProxyStructuredResultV2;
let logs: string[];
let operationCalls: FamilyContext[];
let outcomes: GateOutcome[];

async function sendLeave(groupId: string, timestamp: number): Promise<void> {
  const event = { ...leaveEvent('evt-leave-1', { timestamp }) };
  event.source = { ...event.source, groupId } as typeof event.source;
  response = (await handler(
    webhookRequest({ events: [event] }),
  )) as APIGatewayProxyStructuredResultV2;
}

function yamada(): Record<string, unknown> | undefined {
  return world.families.get(FAMILY_ID);
}

function seedYamadaWithGroup(groupId: string, registeredAt: string): void {
  seedFamily(world.families, { notificationGroupId: groupId });
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
  world.notificationGroups.set(groupId, {
    groupId,
    familyId: FAMILY_ID,
    registeredByUserId: PEOPLE.mother.userId,
    registeredAt,
  });
}

/** テスト用の操作。U8 の操作の代わりに入口へ差し込む。 */
async function testOperation(ctx: FamilyContext): Promise<string> {
  operationCalls.push(ctx);
  return 'done';
}

async function sendOperation(lineUserIds: (string | undefined)[], groupId = GROUP_ID) {
  for (const lineUserId of lineUserIds) {
    outcomes.push(await groupCommandGate.runGroupOperation(groupId, lineUserId, testOperation));
  }
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    line = stubLineFetch();
    logs = [];
    operationCalls = [];
    outcomes = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
  });

  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const expect200 = () => expect(response.statusCode).toBe(200);

  Scenario(
    'お知らせ先のグループから公式アカウントが外されるとお知らせ先がなくなる',
    ({ Given, When, Then, And }) => {
      Given('山田家はグループ「C_group_1」をお知らせ先にしている', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      When('公式アカウントがそのグループから外される', () => sendLeave(GROUP_ID, AFTER_REGISTERED));
      Then('応答は 200 になる', expect200);
      And('そのグループの記録はなくなり、山田家の記録はお知らせ先を指していない', () => {
        expect(world.notificationGroups.has(GROUP_ID)).toBe(false);
        expect(yamada()).toBeDefined();
        expect(yamada()?.notificationGroupId).toBeUndefined();
        expect(yamada()?.name).toBe('山田家');
      });
      And('返事は送られない', () => {
        expect(line.calls).toHaveLength(0);
      });
      And('お知らせ先がなくなったことがログに残る', () => {
        const row = logs.find((l) => l.includes('NOTIFICATION_GROUP_UNREGISTERED'));
        expect(row).toBeDefined();
        expect(row).toContain(FAMILY_ID);
      });
    },
  );

  Scenario('お知らせ先でないグループから外されても何も変わらない', ({ Given, When, Then, And }) => {
    Given('山田家は別のグループ「C_old」をお知らせ先にしている', () =>
      seedYamadaWithGroup(OLD_GROUP_ID, REGISTERED_AT),
    );
    When('公式アカウントがお知らせ先ではないグループ「C_group_1」から外される', () =>
      sendLeave(GROUP_ID, AFTER_REGISTERED),
    );
    Then('応答は 200 になる', expect200);
    And('山田家のお知らせ先は「C_old」のままである', () => {
      expect(yamada()?.notificationGroupId).toBe(OLD_GROUP_ID);
      expect(world.notificationGroups.has(OLD_GROUP_ID)).toBe(true);
    });
  });

  Scenario(
    '登録し直しのあとに古い leave が届いても新しいお知らせ先は消えない',
    ({ Given, When, Then, And }) => {
      Given('山田家はグループ「C_group_1」を2026年11月2日に登録し直したところである', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      When('登録より前の時刻の leave が届く', () => sendLeave(GROUP_ID, BEFORE_REGISTERED));
      Then('応答は 200 になる', expect200);
      And('山田家のお知らせ先は「C_group_1」のままである', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
        expect(world.notificationGroups.has(GROUP_ID)).toBe(true);
      });
    },
  );

  Scenario(
    '解除の取引が思いがけない Code で断られると 500 になる',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループ「C_group_1」をお知らせ先にしている', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      And('解除の取引は思いがけない Code で断られる', () => {
        world.mock.on(TransactWriteCommand).rejects(
          new TransactionCanceledException({
            message: 'cancelled',
            $metadata: {},
            CancellationReasons: [{ Code: 'ValidationError' }, { Code: 'None' }],
          }),
        );
      });
      When('公式アカウントがそのグループから外される', () => sendLeave(GROUP_ID, AFTER_REGISTERED));
      Then('応答は 500 になる', () => {
        expect(response.statusCode).toBe(500);
      });
      And('山田家のお知らせ先は「C_group_1」のままである', () => {
        expect(yamada()?.notificationGroupId).toBe(GROUP_ID);
        expect(world.notificationGroups.has(GROUP_ID)).toBe(true);
      });
    },
  );

  Scenario(
    '同じ leave が同時に処理されて先に解除されていても、やり直して何も壊さない',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループ「C_group_1」をお知らせ先にしている', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      And('読んだあとで、別の処理が先にそのグループを解除する', () => {
        world.hooks.beforeNextTransaction = () => {
          world.notificationGroups.delete(GROUP_ID);
          delete yamada()?.notificationGroupId;
        };
      });
      When('公式アカウントがそのグループから外される', () => sendLeave(GROUP_ID, AFTER_REGISTERED));
      Then('応答は 200 になる', expect200);
      And('そのグループの記録はなくなり、山田家の記録はお知らせ先を指していない', () => {
        expect(world.notificationGroups.has(GROUP_ID)).toBe(false);
        expect(yamada()?.notificationGroupId).toBeUndefined();
      });
    },
  );

  Scenario(
    '登録されていないグループの操作は断られ、操作は呼ばれない',
    ({ Given, When, Then, And }) => {
      Given('山田家にはお母さんが管理者としている', () => {
        seedFamily(world.families);
        seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
      });
      When('お母さんが登録されていないグループでテスト用の操作を送る', () =>
        sendOperation(['U_mother']),
      );
      Then('「このグループは家族のお知らせ先として登録されていません」が返る', () => {
        expect(outcomes).toHaveLength(1);
        expect(outcomes[0]).toMatchObject({
          status: 'rejected',
          reason: 'GROUP_NOT_REGISTERED',
          message: MESSAGES.GROUP_NOT_REGISTERED,
        });
      });
      And('テスト用の操作は呼ばれない', () => {
        expect(operationCalls).toHaveLength(0);
      });
      And('断ったことがログに残る', () => {
        expect(
          logs.some(
            (l) => l.includes('GROUP_COMMAND_REJECTED') && l.includes('GROUP_NOT_REGISTERED'),
          ),
        ).toBe(true);
      });
    },
  );

  Scenario(
    '別の家族の人・家族に入っていない人・ブロック中の人の操作は家族の情報なしで断られる',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループ「C_group_1」をお知らせ先にしている', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      And('佐藤家の管理者の花子さんがいる', () => {
        seedFamily(world.families, {
          familyId: SATO_FAMILY_ID,
          name: '佐藤家',
          adminUserId: PEOPLE.hanako.userId,
        });
        seedUser(world.users, 'hanako', { familyId: SATO_FAMILY_ID, role: 'admin' });
      });
      And('家族に入っていない次郎さんがいる', () => {
        seedUser(world.users, 'jiro');
      });
      And('山田家のブロック中の太郎さんがいる', () => {
        seedUser(world.users, 'taro', {
          familyId: FAMILY_ID,
          role: 'child',
          friendStatus: 'blocked',
        });
      });
      When('花子さん、次郎さん、太郎さん、記録のない人が、そのグループでテスト用の操作を送る', () =>
        sendOperation(['U_hanako', 'U_jiro', 'U_taro', 'U_nobody', undefined]),
      );
      Then('どれも「このアプリは家族のメンバーだけが使えます」が返る', () => {
        expect(outcomes).toHaveLength(5);
        for (const outcome of outcomes) {
          expect(outcome).toMatchObject({
            status: 'rejected',
            reason: 'NOT_FAMILY_MEMBER',
            message: MESSAGES.NOT_FAMILY_MEMBER,
          });
        }
      });
      And('返事に家族の名前もメンバーの名前も入っていない', () => {
        const all = JSON.stringify(outcomes);
        expect(all).not.toContain('山田家');
        expect(all).not.toContain('佐藤家');
        expect(all).not.toContain(FAMILY_ID);
        expect(all).not.toContain(PEOPLE.mother.displayName);
      });
      And('テスト用の操作は呼ばれない', () => {
        expect(operationCalls).toHaveLength(0);
      });
    },
  );

  Scenario(
    'そのグループの家族のメンバーなら、操作が家族・利用者・役割つきで呼ばれる',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループ「C_group_1」をお知らせ先にしている', () =>
        seedYamadaWithGroup(GROUP_ID, REGISTERED_AT),
      );
      And('山田家には子供の太郎さんがいる', () => {
        seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
      });
      When('お母さんと太郎さんが、そのグループでテスト用の操作を送る', () =>
        sendOperation(['U_mother', 'U_taro']),
      );
      Then('テスト用の操作は山田家と、それぞれの利用者と役割で 2 回呼ばれる', () => {
        expect(operationCalls).toEqual([
          { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' },
          { familyId: FAMILY_ID, userId: PEOPLE.taro.userId, role: 'child' },
        ]);
        expect(outcomes.map((o) => o.status)).toEqual(['done', 'done']);
      });
    },
  );
});
