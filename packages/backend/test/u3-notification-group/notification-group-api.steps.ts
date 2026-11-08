import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { NotificationGroupView } from '@housework/shared';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  PEOPLE,
  seedFamily,
  seedUser,
  type PersonKey,
} from '../u2-invitation/helpers/seed';

const feature = await loadFeature(
  'packages/backend/test/u3-notification-group/notification-group-api.feature',
);

const GROUP_ID = 'C_yamada_group';
const GROUP_NAME = '山田家のグループ';
const REGISTERED_AT = '2026-11-02T00:00:00.000Z';
const PATH = '/v1/family/notification-group';

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;

function seedYamada(group?: { groupName?: string; groupId?: string; record?: boolean }): void {
  const groupId = group?.groupId ?? GROUP_ID;
  seedFamily(world.families, group ? { notificationGroupId: groupId } : {});
  seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
  if (group && group.record !== false) {
    world.notificationGroups.set(groupId, {
      groupId,
      familyId: FAMILY_ID,
      ...(group.groupName ? { groupName: group.groupName } : {}),
      registeredByUserId: PEOPLE.mother.userId,
      registeredAt: REGISTERED_AT,
    });
  }
}

const get = async (person?: PersonKey) => {
  response = await call('GET', PATH, person ? { person } : {});
};

function expectViewOnly(name: string | null): void {
  expect(response.statusCode).toBe(200);
  expect(bodyOf<NotificationGroupView>(response)).toEqual({
    groupName: name,
    registeredAt: REGISTERED_AT,
  });
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });

  const expectNull = () => {
    expect(response.statusCode).toBe(200);
    expect(bodyOf(response)).toBeNull();
  };

  Scenario(
    'お知らせ先があれば、グループの名前と登録した時刻が返りグループ ID は返らない',
    ({ Given, When, Then, And }) => {
      Given('山田家はグループ「山田家のグループ」をお知らせ先にしている', () =>
        seedYamada({ groupName: GROUP_NAME }),
      );
      When('管理者のお母さんが GET /v1/family/notification-group を呼ぶ', () => get('mother'));
      Then('200 で、グループの名前と登録した時刻だけが返る', () => expectViewOnly(GROUP_NAME));
      And('グループ ID は応答のどこにもない', () => {
        expect(String(response.body)).not.toContain(GROUP_ID);
        expect(String(response.body)).not.toContain('groupId');
      });
    },
  );

  Scenario('子供も同じ内容を見られる', ({ Given, And, When, Then }) => {
    Given('山田家はグループ「山田家のグループ」をお知らせ先にしている', () =>
      seedYamada({ groupName: GROUP_NAME }),
    );
    And('山田家には子供の太郎さんがいる', () => {
      seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    });
    When('子供の太郎さんが GET /v1/family/notification-group を呼ぶ', () => get('taro'));
    Then('200 で、グループの名前と登録した時刻だけが返る', () => expectViewOnly(GROUP_NAME));
  });

  Scenario('グループの名前を受け取れていなければ名前は null で返る', ({ Given, When, Then }) => {
    Given('山田家は名前のないグループをお知らせ先にしている', () => seedYamada({}));
    When('管理者のお母さんが GET /v1/family/notification-group を呼ぶ', () => get('mother'));
    Then('200 で、名前は null で登録した時刻が返る', () => expectViewOnly(null));
  });

  Scenario('お知らせ先がなければ null が返る', ({ Given, When, Then }) => {
    Given('山田家にはお知らせ先がない', () => seedYamada());
    When('管理者のお母さんが GET /v1/family/notification-group を呼ぶ', () => get('mother'));
    Then('200 で本文は null になる', expectNull);
  });

  Scenario('家族のお知らせ先の記録がテーブルにないときも null が返る', ({ Given, When, Then }) => {
    Given('山田家は記録のないグループ「C_old」を指している', () =>
      seedYamada({ groupId: 'C_old', record: false }),
    );
    When('管理者のお母さんが GET /v1/family/notification-group を呼ぶ', () => get('mother'));
    Then('200 で本文は null になる', expectNull);
  });

  Scenario('家族に入っていない人は 403', ({ Given, And, When, Then }) => {
    Given('山田家はグループ「山田家のグループ」をお知らせ先にしている', () =>
      seedYamada({ groupName: GROUP_NAME }),
    );
    And('家族に入っていない花子さんがいる', () => {
      seedUser(world.users, 'hanako');
    });
    When('花子さんが GET /v1/family/notification-group を呼ぶ', () => get('hanako'));
    Then('403 で理由は NOT_FAMILY_MEMBER になり、グループの情報は返らない', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toEqual({ error: { reason: 'NOT_FAMILY_MEMBER' } });
      expect(String(response.body)).not.toContain(GROUP_NAME);
    });
  });

  Scenario('セッションがなければ 401', ({ Given, When, Then }) => {
    Given('山田家はグループ「山田家のグループ」をお知らせ先にしている', () =>
      seedYamada({ groupName: GROUP_NAME }),
    );
    When('セッションなしで GET /v1/family/notification-group を呼ぶ', () => get());
    Then('401 になる', () => {
      expect(response.statusCode).toBe(401);
    });
  });

  Scenario('ほかの家族のお知らせ先は見えない', ({ Given, And, When, Then }) => {
    Given('山田家にはお知らせ先がない', () => seedYamada());
    And('佐藤家はグループ「佐藤家のグループ」をお知らせ先にしている', () => {
      seedFamily(world.families, {
        familyId: 'fam-sato',
        name: '佐藤家',
        adminUserId: 'user-sato',
        notificationGroupId: 'C_sato',
      });
      world.notificationGroups.set('C_sato', {
        groupId: 'C_sato',
        familyId: 'fam-sato',
        groupName: '佐藤家のグループ',
        registeredByUserId: 'user-sato',
        registeredAt: REGISTERED_AT,
      });
    });
    When('管理者のお母さんが GET /v1/family/notification-group を呼ぶ', () => get('mother'));
    Then('200 で本文は null になる', expectNull);
  });

  Scenario(
    'getNotificationGroup は U10 のためにグループ ID を返す',
    ({ Given, When, Then, And }) => {
      let found: Awaited<ReturnType<typeof familyMemberService.getNotificationGroup>>;
      const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' as const };
      Given('山田家はグループ「山田家のグループ」をお知らせ先にしている', () =>
        seedYamada({ groupName: GROUP_NAME }),
      );
      When('山田家の文脈で getNotificationGroup を呼ぶ', async () => {
        found = await familyMemberService.getNotificationGroup(ctx);
      });
      Then('グループ ID が返る', () => {
        expect(found).toEqual({ ok: true, value: GROUP_ID });
      });
      And('お知らせ先がない家族では NOTIFICATION_GROUP_NOT_REGISTERED が返る', async () => {
        delete world.families.get(FAMILY_ID)?.notificationGroupId;
        const none = await familyMemberService.getNotificationGroup(ctx);
        expect(none).toMatchObject({ ok: false, reason: 'NOTIFICATION_GROUP_NOT_REGISTERED' });
      });
    },
  );
});
