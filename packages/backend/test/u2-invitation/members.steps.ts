import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  bodyOf,
  call,
  FAMILY_ID,
  NOW,
  PEOPLE,
  seedFamily,
  seedUser,
  type PersonKey,
} from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u2-invitation/members.feature');

let world: ReturnType<typeof setupWorld>;
let response: APIGatewayProxyStructuredResultV2;

const NOV_2 = '2026-11-02T09:00:00.000Z';
const NOV_3 = '2026-11-03T09:00:00.000Z';

function open(person: PersonKey) {
  return call('GET', '/v1/family/members', { person }).then((r) => {
    response = r;
  });
}

function names(): string[] {
  return bodyOf<{ displayName: string }[]>(response).map((m) => m.displayName);
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    world = setupWorld();
    process.env.ENTRY = 'api';
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    seedFamily(world.families);
  });
  AfterEachScenario(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  Scenario(
    '管理者が一覧を開くと、管理者が最初で、子供が入った順に並ぶ',
    ({ Given, And, When, Then }) => {
      Given('山田家にお母さん（管理者）、花子（11/03 に参加）、太郎（11/02 に参加）がいる', () => {
        seedUser(world.users, 'mother', {
          familyId: FAMILY_ID,
          role: 'admin',
          familyJoinedAt: '2026-11-01T00:00:00.000Z',
        });
        seedUser(world.users, 'hanako', {
          familyId: FAMILY_ID,
          role: 'child',
          familyJoinedAt: NOV_3,
        });
        seedUser(world.users, 'taro', {
          familyId: FAMILY_ID,
          role: 'child',
          familyJoinedAt: NOV_2,
        });
      });
      And('同じ時刻に参加した次郎と太郎がいる', () => {
        seedUser(world.users, 'jiro', {
          familyId: FAMILY_ID,
          role: 'child',
          familyJoinedAt: NOV_2,
        });
      });
      When('お母さんがメンバーの一覧を開く', () => open('mother'));
      Then('応答は 200 になる', () => expect(response.statusCode).toBe(200));
      And('一覧は お母さん、太郎、次郎、花子 の順になる', () => {
        expect(names()).toEqual(['お母さん', '太郎', '次郎', '花子']);
      });
    },
  );

  Scenario(
    '同じ時刻に参加した子供は、表示名、それも同じなら userId の順に並ぶ',
    ({ Given, And, When, Then }) => {
      Given('山田家にお母さん（管理者）がいる', () => {
        seedUser(world.users, 'mother', {
          familyId: FAMILY_ID,
          role: 'admin',
          familyJoinedAt: '2026-11-01T00:00:00.000Z',
        });
      });
      And('同じ時刻に同じ表示名で参加した子供が userId の逆順で記録されている', () => {
        for (const userId of ['user-z', 'user-a']) {
          world.users.set(userId, {
            userId,
            lineUserId: `U_${userId}`,
            displayName: 'ゆうた',
            friendStatus: 'friend',
            registeredAt: NOV_2,
            friendStatusChangedAt: NOV_2,
            familyId: FAMILY_ID,
            role: 'child',
            familyJoinedAt: NOV_2,
          });
        }
      });
      When('お母さんがメンバーの一覧を開く', () => open('mother'));
      Then('一覧の子供は userId の順になる', () => {
        const ids = bodyOf<{ userId: string }[]>(response).map((m) => m.userId);
        expect(ids).toEqual(['user-mother', 'user-a', 'user-z']);
      });
    },
  );

  Scenario('子供も一覧を開ける', ({ Given, When, Then, And }) => {
    Given('山田家にお母さん（管理者）と太郎（子供）がいる', () => {
      seedUser(world.users, 'mother', {
        familyId: FAMILY_ID,
        role: 'admin',
        familyJoinedAt: '2026-11-01T00:00:00.000Z',
      });
      seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', familyJoinedAt: NOV_2 });
    });
    When('太郎がメンバーの一覧を開く', () => open('taro'));
    Then('応答は 200 になる', () => expect(response.statusCode).toBe(200));
    And('一覧は お母さん、太郎 の順になる', () => {
      expect(names()).toEqual(['お母さん', '太郎']);
    });
  });

  Scenario('応答には userId・表示名・役割だけがある', ({ Given, When, Then, And }) => {
    Given('山田家にお母さん（管理者）と太郎（子供）がいる', () => {
      seedUser(world.users, 'mother', {
        familyId: FAMILY_ID,
        role: 'admin',
        familyJoinedAt: '2026-11-01T00:00:00.000Z',
      });
      seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', familyJoinedAt: NOV_2 });
    });
    When('お母さんがメンバーの一覧を開く', () => open('mother'));
    Then('一覧のどの行も userId、displayName、role だけを持つ', () => {
      const rows = bodyOf<Record<string, unknown>[]>(response);
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(['displayName', 'role', 'userId']);
      }
    });
    And('応答の本文に LINE のユーザー ID が含まれない', () => {
      expect(String(response.body)).not.toContain('U_mother');
      expect(String(response.body)).not.toContain('lineUserId');
    });
  });

  Scenario('家族のメンバーでない人は 403 NOT_FAMILY_MEMBER', ({ Given, And, When, Then }) => {
    Given('山田家にお母さん（管理者）がいる', () => {
      seedUser(world.users, 'mother', {
        familyId: FAMILY_ID,
        role: 'admin',
        familyJoinedAt: '2026-11-01T00:00:00.000Z',
      });
    });
    And('どの家族にも入っていない花子がいる', () => seedUser(world.users, 'hanako'));
    When('花子がメンバーの一覧を開く', () => open('hanako'));
    Then('応答は 403 で理由は NOT_FAMILY_MEMBER になる', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyOf<{ error: { reason: string } }>(response).error.reason).toBe(
        'NOT_FAMILY_MEMBER',
      );
    });
  });

  Scenario('索引にまだ本人が出ていなくても、本人が一覧に入る', ({ Given, And, When, Then }) => {
    Given('山田家にお母さん（管理者）と太郎（子供）がいる', () => {
      seedUser(world.users, 'mother', {
        familyId: FAMILY_ID,
        role: 'admin',
        familyJoinedAt: '2026-11-01T00:00:00.000Z',
      });
      seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', familyJoinedAt: NOV_2 });
    });
    And('索引にはまだ太郎が出ていない', () => {
      world.hiddenFromFamilyIndex.add(PEOPLE.taro.userId);
    });
    When('太郎がメンバーの一覧を開く', () => open('taro'));
    Then('一覧は お母さん、太郎 の順になる', () => {
      expect(names()).toEqual(['お母さん', '太郎']);
    });
  });

  Scenario(
    'familyJoinedAt がない管理者も、管理者として最初に並ぶ',
    ({ Given, And, When, Then }) => {
      Given('U2 より前に家族を作ったので familyJoinedAt がないお母さん（管理者）がいる', () => {
        seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
      });
      And('太郎が 11/02 に参加している', () => {
        seedUser(world.users, 'taro', {
          familyId: FAMILY_ID,
          role: 'child',
          familyJoinedAt: NOV_2,
        });
      });
      When('お母さんがメンバーの一覧を開く', () => open('mother'));
      Then('一覧は お母さん、太郎 の順になる', () => {
        expect(names()).toEqual(['お母さん', '太郎']);
      });
    },
  );
});
