import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Result } from '@housework/shared';
import { expect } from 'vitest';
import type { ReadContext, SystemContext } from '../../src/middleware/requireMembership';
import type { DutyRecord } from '../../src/models';
import * as calendarService from '../../src/services/calendarService';
import * as familyMemberService from '../../src/services/familyMemberService';
import { FAMILIES_TABLE, USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import {
  FAKE_U9_DEPARTED_USER_ID,
  FAKE_U9_OUTSIDER_USER_ID,
  fakeU9DutyId,
} from '../fixtures/fakeSecrets';
import {
  CHILDREN,
  CHORES,
  FAMILY_CREATED_AT,
  FAMILY_ID,
  PEOPLE,
  seedAllowanceHousehold,
  seedDepartedChild,
  seedDone,
  seedDuty,
  seedMonthState,
} from './helpers/seed';
import { totalWrites } from './helpers/writeGuard';

const feature = await loadFeature('packages/backend/test/u9-allowance/family-reads.feature');

type World = ReturnType<typeof setupWorld>;
type Loaded = Awaited<ReturnType<typeof familyMemberService.loadFamilyAndMembers>>;

const ctxOf = (userId: string, role: 'admin' | 'child'): ReadContext => ({
  familyId: FAMILY_ID,
  userId,
  role,
});
const SYSTEM_CTX: SystemContext = { familyId: FAMILY_ID, role: 'system' };

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let loaded: Loaded | undefined;
  let members: Awaited<ReturnType<typeof familyMemberService.listMembers>>;
  let displayName: Result<string, 'NOT_FOUND'> | undefined;
  let createdAt: string | undefined;
  let createdAtError: unknown;
  let childChecks: Result<unknown, 'NOT_FOUND'>[];
  let duties: DutyRecord[];
  let dutiesByMonth: Record<string, DutyRecord[]>;
  let confirmed: boolean[];
  let departedId: string;

  BeforeEachScenario(() => {
    world = setupWorld();
    loaded = undefined;
    displayName = undefined;
    createdAt = undefined;
    createdAtError = undefined;
    childChecks = [];
    duties = [];
    dutiesByMonth = {};
    confirmed = [];
    departedId = '';
  });
  AfterEachScenario(() => {
    world.mock.reset();
  });

  const givenHousehold = (): void => {
    seedAllowanceHousehold(world);
    const joined = {
      taro: '2026-11-02T00:00:00.000Z',
      hanako: '2026-11-03T00:00:00.000Z',
      jiro: '2026-11-04T00:00:00.000Z',
    } as const;
    for (const key of ['taro', 'hanako', 'jiro'] as const) {
      const item = world.users.get(CHILDREN[key].userId);
      if (item) world.users.set(CHILDREN[key].userId, { ...item, familyJoinedAt: joined[key] });
    }
  };
  const reads = (table: string, operation: 'Get' | 'Query', consistent?: boolean) =>
    world.hooks.readLog.filter(
      (entry) =>
        entry.table === table &&
        entry.operation === operation &&
        (consistent === undefined || entry.consistent === consistent),
    ).length;
  const names = (): string[] => (loaded?.members ?? []).map((m) => m.displayName);

  Scenario('家族とメンバーを、家族の記録を 1 回だけ読んで返す', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    When('太郎の文脈で家族とメンバーを読む', async () => {
      loaded = await familyMemberService.loadFamilyAndMembers(ctxOf(CHILDREN.taro.userId, 'child'));
    });
    Then('家族の記録の読み取りは 1 回である', () => {
      expect(reads(FAMILIES_TABLE, 'Get')).toBe(1);
    });
    And('家族の作成時刻が返る', () => {
      expect(loaded?.family.createdAt).toBe(FAMILY_CREATED_AT);
    });
    And('メンバーは母、太郎、花子、次郎の順である', () => {
      expect(names()).toEqual([
        PEOPLE.mother.displayName,
        CHILDREN.taro.displayName,
        CHILDREN.hanako.displayName,
        CHILDREN.jiro.displayName,
      ]);
    });
  });

  Scenario('メンバーの一覧の戻りは LINE のユーザー ID を含まない', ({ Given, When, Then }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    When('母の文脈でメンバーの一覧を読む', async () => {
      members = await familyMemberService.listMembers(ctxOf(PEOPLE.mother.userId, 'admin'));
    });
    Then('各メンバーの項目は userId、displayName、role だけである', () => {
      expect(members).toHaveLength(4);
      for (const member of members) {
        expect(Object.keys(member).sort()).toEqual(['displayName', 'role', 'userId']);
      }
    });
  });

  Scenario(
    '結果整合の索引に本人が出ないとき、強い整合性で読んで補う',
    ({ Given, When, Then, And }) => {
      Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
      And('太郎が家族の索引にまだ出ていない', () => {
        world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
      });
      When('太郎の文脈で家族とメンバーを読む', async () => {
        loaded = await familyMemberService.loadFamilyAndMembers(
          ctxOf(CHILDREN.taro.userId, 'child'),
        );
      });
      Then('メンバーに太郎が含まれる', () => {
        expect(names()).toContain(CHILDREN.taro.displayName);
      });
      And('利用者の記録を強い整合性で読んだのは 1 回である', () => {
        expect(reads(USERS_TABLE, 'Get', true)).toBe(1);
      });
    },
  );

  Scenario(
    'お知らせ用の裏側の文脈では本人の補いの読み取りをしない',
    ({ Given, When, Then, And }) => {
      Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
      And('太郎が家族の索引にまだ出ていない', () => {
        world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
      });
      When('お知らせ用の裏側の文脈で家族とメンバーを読む', async () => {
        loaded = await familyMemberService.loadFamilyAndMembers(SYSTEM_CTX);
      });
      Then('利用者の記録を直接読んだのは 0 回である', () => {
        expect(reads(USERS_TABLE, 'Get')).toBe(0);
      });
      And('家族の作成時刻が返る', () => {
        expect(loaded?.family.createdAt).toBe(FAMILY_CREATED_AT);
      });
    },
  );

  Scenario('表示名だけを返す', ({ Given, When, Then }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    When('太郎の表示名を求める', async () => {
      displayName = await familyMemberService.findDisplayName(
        { familyId: FAMILY_ID },
        CHILDREN.taro.userId,
      );
    });
    Then('返るのは表示名の文字列だけである', () => {
      expect(displayName).toEqual({ ok: true, value: CHILDREN.taro.displayName });
    });
  });

  Scenario(
    '家族を抜けた子供でも、記録が残っていれば表示名が読める',
    ({ Given, When, Then, And }) => {
      Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
      And('家族を抜けた子供がいる', () => {
        departedId = seedDepartedChild(world.users, { displayName: '抜けた子' });
      });
      When('抜けた子供の表示名を求める', async () => {
        displayName = await familyMemberService.findDisplayName(
          { familyId: FAMILY_ID },
          departedId,
        );
      });
      Then('抜けた子供の表示名が返る', () => {
        expect(displayName).toEqual({ ok: true, value: '抜けた子' });
      });
      And('抜けた子供を子供として確かめると NOT_FOUND である', async () => {
        const check = await familyMemberService.findFamilyChild(
          { familyId: FAMILY_ID },
          departedId,
        );
        expect(check).toEqual({ ok: false, reason: 'NOT_FOUND' });
      });
    },
  );

  Scenario('記録のない人の表示名は NOT_FOUND である', ({ Given, When, Then }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    When('記録のない人の表示名を求める', async () => {
      displayName = await familyMemberService.findDisplayName(
        { familyId: FAMILY_ID },
        FAKE_U9_OUTSIDER_USER_ID,
      );
    });
    Then('結果は NOT_FOUND である', () => {
      expect(displayName).toEqual({ ok: false, reason: 'NOT_FOUND' });
    });
  });

  Scenario(
    '管理者・ほかの家族の人・記録のない人は子供として確かめると同じ NOT_FOUND である',
    ({ Given, When, Then, And }) => {
      Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
      And('ほかの家族の子供がいる', () => {
        departedId = seedDepartedChild(world.users, { family: 'fam-other' });
      });
      When('母とほかの家族の子供と記録のない人を子供として確かめる', async () => {
        const scope = { familyId: FAMILY_ID };
        childChecks = [
          await familyMemberService.findFamilyChild(scope, PEOPLE.mother.userId),
          await familyMemberService.findFamilyChild(scope, departedId),
          await familyMemberService.findFamilyChild(scope, FAKE_U9_OUTSIDER_USER_ID),
        ];
      });
      Then('3 件とも NOT_FOUND である', () => {
        expect(childChecks).toEqual([
          { ok: false, reason: 'NOT_FOUND' },
          { ok: false, reason: 'NOT_FOUND' },
          { ok: false, reason: 'NOT_FOUND' },
        ]);
      });
    },
  );

  Scenario('家族の作成時刻だけを返す', ({ Given, When, Then }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    When('家族の作成時刻を求める', async () => {
      createdAt = await familyMemberService.getFamilyCreatedAt({ familyId: FAMILY_ID });
    });
    Then('作成時刻の文字列だけが返る', () => {
      expect(createdAt).toBe(FAMILY_CREATED_AT);
    });
  });

  Scenario('家族の記録がなければ作成時刻の取得は投げる', ({ Given, When, Then }) => {
    Given('家族の記録がない', () => {
      world.families.clear();
    });
    When('家族の作成時刻を求める', async () => {
      try {
        createdAt = await familyMemberService.getFamilyCreatedAt({ familyId: FAMILY_ID });
      } catch (error) {
        createdAtError = error;
      }
    });
    Then('取得は失敗する', () => {
      expect(createdAt).toBeUndefined();
      expect(createdAtError).toBeInstanceOf(Error);
    });
  });

  const scope = { familyId: FAMILY_ID };
  const doneIds = (list: DutyRecord[]): string[] => list.map((d) => d.dutyId);

  Scenario('「済」で単価を持つ担当だけを返す', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    And('1 月に「未」「×」「済」「単価のない済」の担当が 1 件ずつある', () => {
      const base = { childUserId: CHILDREN.taro.userId, choreTypeId: CHORES.dishes.choreTypeId };
      seedDuty(world.calendar, { ...base, dutyId: fakeU9DutyId(1), date: '2027-01-03' });
      seedDuty(world.calendar, {
        ...base,
        dutyId: fakeU9DutyId(2),
        date: '2027-01-04',
        status: 'skipped',
      });
      seedDone(world.calendar, { dutyId: fakeU9DutyId(3), date: '2027-01-05' });
      seedDone(world.calendar, { dutyId: fakeU9DutyId(4), date: '2027-01-06', unitPrice: null });
    });
    When('1 月の確定済みの担当を求める', async () => {
      duties = await calendarService.listDoneDuties(scope, '2027-01');
    });
    Then('返るのは単価のある「済」の 1 件だけである', () => {
      expect(doneIds(duties)).toEqual([fakeU9DutyId(3)]);
    });
  });

  Scenario('単価 0 円の「済」は返す', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    And('1 月に単価 0 円の「済」の担当がある', () => {
      seedDone(world.calendar, { dutyId: fakeU9DutyId(1), date: '2027-01-05', unitPrice: 0 });
    });
    When('1 月の確定済みの担当を求める', async () => {
      duties = await calendarService.listDoneDuties(scope, '2027-01');
    });
    Then('返るのは単価 0 円の 1 件である', () => {
      expect(duties).toHaveLength(1);
      expect(duties[0]?.unitPrice).toBe(0);
    });
  });

  Scenario('月は担当の日付の月で決まる', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    And('12 月 31 日の担当を 1 月 2 日に記録した「済」がある', () => {
      seedDone(world.calendar, {
        dutyId: fakeU9DutyId(1),
        date: '2026-12-31',
        recordedAt: '2027-01-02T01:00:00.000Z',
      });
    });
    When('12 月と 1 月の確定済みの担当を求める', async () => {
      dutiesByMonth['2026-12'] = await calendarService.listDoneDuties(scope, '2026-12');
      dutiesByMonth['2027-01'] = await calendarService.listDoneDuties(scope, '2027-01');
    });
    Then('12 月に 1 件、1 月に 0 件が返る', () => {
      expect(dutiesByMonth['2026-12']).toHaveLength(1);
      expect(dutiesByMonth['2027-01']).toHaveLength(0);
    });
  });

  const givenFiveDonePaged = (): void => {
    for (let i = 1; i <= 5; i++) {
      seedDone(world.calendar, {
        dutyId: fakeU9DutyId(i),
        date: `2027-01-${String(i + 2).padStart(2, '0')}`,
      });
    }
    world.hooks.queryPageSize = 2;
  };

  Scenario('続きのページがあっても最後まで読む', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    And('1 月に「済」の担当が 5 件あり、1 ページに 2 件ずつしか返らない', givenFiveDonePaged);
    When('1 月の確定済みの担当を求める', async () => {
      duties = await calendarService.listDoneDuties(scope, '2027-01');
    });
    Then('5 件すべてが返る', () => {
      expect(duties).toHaveLength(5);
    });
  });

  Scenario(
    '月の確定は月の状態の行で決まり、行がなければ確定していない',
    ({ Given, When, Then, And }) => {
      Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
      And('1 月は確定していて、2 月は確定しておらず、3 月は月の状態の行がない', () => {
        seedMonthState(world.calendar, { month: '2027-01', confirmed: true });
        seedMonthState(world.calendar, { month: '2027-02', confirmed: false });
      });
      When('1 月、2 月、3 月の確定を求める', async () => {
        for (const month of ['2027-01', '2027-02', '2027-03']) {
          confirmed.push(await calendarService.isMonthConfirmed(scope, month));
        }
      });
      Then('答えは真、偽、偽である', () => {
        expect(confirmed).toEqual([true, false, false]);
      });
    },
  );

  Scenario('どの読み取りも書き込みの命令を呼ばない', ({ Given, When, Then, And }) => {
    Given('山田家に管理者の母と、太郎・花子・次郎が順に入っている', givenHousehold);
    And('1 月に「済」の担当が 5 件あり、1 ページに 2 件ずつしか返らない', givenFiveDonePaged);
    When('すべての読み取りの窓口を呼ぶ', async () => {
      await familyMemberService.loadFamilyAndMembers(SYSTEM_CTX);
      await familyMemberService.listMembers(ctxOf(CHILDREN.taro.userId, 'child'));
      await familyMemberService.findDisplayName(scope, FAKE_U9_DEPARTED_USER_ID);
      await familyMemberService.findFamilyChild(scope, CHILDREN.taro.userId);
      await familyMemberService.getFamilyCreatedAt(scope);
      await calendarService.listDoneDuties(scope, '2027-01');
      await calendarService.isMonthConfirmed(scope, '2027-01');
    });
    Then('書き込みの命令は 0 回である', () => {
      expect(totalWrites(world)).toBe(0);
    });
  });
});
