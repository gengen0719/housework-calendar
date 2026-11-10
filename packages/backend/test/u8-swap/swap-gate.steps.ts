import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { MESSAGES } from '@housework/shared';
import { expect, vi } from 'vitest';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import * as groupCommandGate from '../../src/services/groupCommandGate';
import { USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld, stubLineFetch } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE, seedFamily, seedUser } from '../u2-invitation/helpers/seed';
import { FAKE_U8_MARKER_DISPLAY_NAME } from '../fixtures/fakeSecrets';
import { FAKE_U8_GROUP_ID, FAKE_U8_UNREGISTERED_GROUP_ID } from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u8-swap/swap-gate.feature');

type Outcome = Awaited<ReturnType<typeof groupCommandGate.runGroupOperation<string>>>;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof setupWorld>;
  let logs: string[];
  let calls: { ctx: FamilyContext; displayName?: string }[];
  let outcomes: Outcome[];

  const operation = async (ctx: FamilyContext, displayName: string): Promise<string> => {
    calls.push({ ctx, displayName });
    return 'done';
  };
  const send = async (lineUserIds: (string | undefined)[], groupId = FAKE_U8_GROUP_ID) => {
    for (const lineUserId of lineUserIds) {
      outcomes.push(await groupCommandGate.runGroupOperation(groupId, lineUserId, operation));
    }
  };
  const parsedLogs = () => logs.map((l) => JSON.parse(l) as Record<string, unknown>);
  const rejectedLogs = () => parsedLogs().filter((l) => l.event === 'GROUP_COMMAND_REJECTED');

  const seedRegisteredGroup = (): void => {
    seedFamily(world.families, { notificationGroupId: FAKE_U8_GROUP_ID });
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    world.notificationGroups.set(FAKE_U8_GROUP_ID, {
      groupId: FAKE_U8_GROUP_ID,
      familyId: FAMILY_ID,
      registeredByUserId: PEOPLE.mother.userId,
      registeredAt: '2026-11-02T00:00:00.000Z',
    });
  };
  const seedOutsiders = (): void => {
    seedUser(world.users, 'jiro');
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', friendStatus: 'blocked' });
  };

  BeforeEachScenario(() => {
    world = setupWorld();
    stubLineFetch();
    logs = [];
    calls = [];
    outcomes = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  Scenario(
    '登録されていないグループの操作は断られ、操作は呼ばれない',
    ({ Given, When, Then, And }) => {
      Given('山田家には管理者のお母さんがいる', () => {
        seedFamily(world.families);
        seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
      });
      When('お母さんが登録されていないグループで操作を送る', () =>
        send(['U_mother'], FAKE_U8_UNREGISTERED_GROUP_ID),
      );
      Then('「このグループは家族のお知らせ先として登録されていません」が返る', () => {
        expect(outcomes[0]).toMatchObject({
          status: 'rejected',
          reason: 'GROUP_NOT_REGISTERED',
          message: MESSAGES.GROUP_NOT_REGISTERED,
        });
      });
      And('操作は呼ばれない', () => {
        expect(calls).toHaveLength(0);
      });
    },
  );

  Scenario(
    '家族でない人・友だちでない人・送り主が分からない人は断られ、操作は呼ばれない',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
      And('家族に入っていない次郎さんとブロック中の太郎さんがいる', seedOutsiders);
      When('次郎さんと太郎さんと記録のない人と送り主が分からない人が操作を送る', () =>
        send(['U_jiro', 'U_taro', 'U_nobody', undefined]),
      );
      Then('どれも「このアプリは家族のメンバーだけが使えます」が返る', () => {
        expect(outcomes).toHaveLength(4);
        for (const outcome of outcomes) {
          expect(outcome).toMatchObject({
            status: 'rejected',
            reason: 'NOT_FAMILY_MEMBER',
            message: MESSAGES.NOT_FAMILY_MEMBER,
          });
        }
      });
      And('操作は呼ばれない', () => {
        expect(calls).toHaveLength(0);
      });
    },
  );

  Scenario(
    '家族のメンバーなら、家族・利用者・役割と表示名つきで操作が呼ばれる',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
      And('山田家には子供の太郎さんがいる', () =>
        seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' }),
      );
      When('お母さんと太郎さんが操作を送る', () => send(['U_mother', 'U_taro']));
      Then('操作は家族・利用者・役割と表示名つきで 2 回呼ばれる', () => {
        expect(calls).toEqual([
          {
            ctx: { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' },
            displayName: PEOPLE.mother.displayName,
          },
          {
            ctx: { familyId: FAMILY_ID, userId: PEOPLE.taro.userId, role: 'child' },
            displayName: PEOPLE.taro.displayName,
          },
        ]);
      });
    },
  );

  Scenario('表示名を渡すために追加の読み取りはしない', ({ Given, When, Then }) => {
    Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
    When('お母さんが操作を送る', () => {
      world.hooks.readLog.length = 0;
      return send(['U_mother']);
    });
    Then('利用者の記録の読み取りは 1 回だけである', () => {
      const reads = world.hooks.readLog.filter((r) => r.table === USERS_TABLE);
      expect(reads).toHaveLength(1);
    });
  });

  Scenario('引数が 1 つだけの操作も、これまでどおり動く', ({ Given, When, Then }) => {
    Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
    When('引数が ctx だけの操作を送る', async () => {
      const single = async (ctx: FamilyContext): Promise<string> => {
        calls.push({ ctx });
        return 'done';
      };
      outcomes.push(await groupCommandGate.runGroupOperation(FAKE_U8_GROUP_ID, 'U_mother', single));
    });
    Then('操作は家族・利用者・役割で呼ばれた', () => {
      expect(calls[0]?.ctx).toEqual({
        familyId: FAMILY_ID,
        userId: PEOPLE.mother.userId,
        role: 'admin',
      });
      expect(outcomes[0]?.status).toBe('done');
    });
  });

  Scenario(
    '断ったとき GROUP_COMMAND_REJECTED にはグループ ID がない',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
      And('家族に入っていない次郎さんとブロック中の太郎さんがいる', seedOutsiders);
      When('次郎さんが操作を送り、登録されていないグループでも操作を送る', async () => {
        await send(['U_jiro']);
        await send(['U_mother'], FAKE_U8_UNREGISTERED_GROUP_ID);
      });
      Then(
        'GROUP_COMMAND_REJECTED が 2 件残り、理由は NOT_FAMILY_MEMBER と GROUP_NOT_REGISTERED である',
        () => {
          expect(rejectedLogs().map((l) => l.reason)).toEqual([
            'NOT_FAMILY_MEMBER',
            'GROUP_NOT_REGISTERED',
          ]);
        },
      );
      And('どのログにもグループ ID の項目も値もない', () => {
        for (const row of rejectedLogs()) expect(row).not.toHaveProperty('groupId');
        const all = logs.join('\n');
        expect(all).not.toContain(FAKE_U8_GROUP_ID);
        expect(all).not.toContain(FAKE_U8_UNREGISTERED_GROUP_ID);
      });
    },
  );

  Scenario('家族のメンバーのアプリの利用者 ID だけがログに残る', ({ Given, And, When, Then }) => {
    Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
    And('山田家のブロック中の太郎さんがいる', seedOutsiders);
    When('太郎さんが操作を送る', () => send(['U_taro']));
    Then(
      'GROUP_COMMAND_REJECTED には理由とアプリの利用者 ID があり、LINE のユーザー ID はない',
      () => {
        const row = rejectedLogs()[0];
        expect(row).toMatchObject({ reason: 'NOT_FAMILY_MEMBER', userId: PEOPLE.taro.userId });
        expect(JSON.stringify(row)).not.toContain('U_taro');
      },
    );
  });

  Scenario(
    '目印をつけた表示名と LINE の ID はログのどの行にも出ない',
    ({ Given, And, When, Then }) => {
      Given('山田家はグループをお知らせ先にしている', seedRegisteredGroup);
      And('表示名に目印がついた子供がいる', () => {
        seedUser(world.users, 'jiro');
        seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
        const taro = world.users.get(PEOPLE.taro.userId);
        if (taro) taro.displayName = FAKE_U8_MARKER_DISPLAY_NAME;
      });
      When('目印のついた子供が操作を送り、家族でない人も操作を送る', () =>
        send(['U_taro', 'U_jiro']),
      );
      Then('ログの全行に目印も LINE のグループ ID も LINE のユーザー ID も含まれない', () => {
        const all = logs.join('\n');
        expect(all).not.toContain('目印の表示名');
        expect(all).not.toContain(FAKE_U8_GROUP_ID);
        expect(all).not.toContain('U_taro');
        expect(all).not.toContain('U_jiro');
        expect(calls[0]?.displayName).toBe(FAKE_U8_MARKER_DISPLAY_NAME);
      });
    },
  );
});
