import { beforeEach, describe, expect, it } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE, seedFamily, seedUser } from './helpers/seed';

const ctx = (person: keyof typeof PEOPLE, role: 'admin' | 'child') => ({
  familyId: FAMILY_ID,
  userId: PEOPLE[person].userId,
  role,
});

describe('listMembers: メンバーの一覧の並び順（BR3.11）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    seedFamily(world.families, { createdAt: '2026-11-01T00:00:00.000Z' });
  });

  it('管理者が最初、続けて子供が入った順に並ぶ', async () => {
    seedUser(world.users, 'hanako', {
      familyId: FAMILY_ID,
      role: 'child',
      familyJoinedAt: '2026-11-03T00:00:00.000Z',
    });
    seedUser(world.users, 'taro', {
      familyId: FAMILY_ID,
      role: 'child',
      familyJoinedAt: '2026-11-02T00:00:00.000Z',
    });
    seedUser(world.users, 'mother', {
      familyId: FAMILY_ID,
      role: 'admin',
      familyJoinedAt: '2026-11-05T00:00:00.000Z',
    });
    const members = await familyMemberService.listMembers(ctx('taro', 'child'));
    expect(members.map((m) => m.userId)).toEqual([
      PEOPLE.mother.userId,
      PEOPLE.taro.userId,
      PEOPLE.hanako.userId,
    ]);
  });

  it('管理者の入った時刻が子供より後でも、管理者が最初', async () => {
    seedUser(world.users, 'mother', {
      familyId: FAMILY_ID,
      role: 'admin',
      familyJoinedAt: '2026-12-01T00:00:00.000Z',
    });
    seedUser(world.users, 'taro', {
      familyId: FAMILY_ID,
      role: 'child',
      familyJoinedAt: '2026-11-02T00:00:00.000Z',
    });
    const members = await familyMemberService.listMembers(ctx('mother', 'admin'));
    expect(members[0]?.role).toBe('admin');
  });

  it('同じ時刻なら表示名の順、それも同じなら userId の順', async () => {
    const at = '2026-11-02T00:00:00.000Z';
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin', familyJoinedAt: at });
    seedUser(world.users, 'jiro', { familyId: FAMILY_ID, role: 'child', familyJoinedAt: at });
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', familyJoinedAt: at });
    const members = await familyMemberService.listMembers(ctx('mother', 'admin'));
    expect(members.map((m) => m.displayName)).toEqual(['お母さん', '太郎', '次郎']);
  });

  it('familyJoinedAt がない人は家族の作成時刻とみなして並べる', async () => {
    seedUser(world.users, 'taro', {
      familyId: FAMILY_ID,
      role: 'child',
      familyJoinedAt: '2026-11-02T00:00:00.000Z',
    });
    // 作成時刻（11/01）とみなされるので、11/02 の太郎より前に並ぶ
    seedUser(world.users, 'hanako', { familyId: FAMILY_ID, role: 'child' });
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const members = await familyMemberService.listMembers(ctx('mother', 'admin'));
    expect(members.map((m) => m.userId)).toEqual([
      PEOPLE.mother.userId,
      PEOPLE.hanako.userId,
      PEOPLE.taro.userId,
    ]);
  });

  it('索引に本人が出ていなければ、強い整合性で読んで足す', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    seedUser(world.users, 'taro', {
      familyId: FAMILY_ID,
      role: 'child',
      familyJoinedAt: '2026-11-02T00:00:00.000Z',
    });
    world.hiddenFromFamilyIndex.add(PEOPLE.taro.userId);
    const members = await familyMemberService.listMembers(ctx('taro', 'child'));
    expect(members.map((m) => m.userId)).toEqual([PEOPLE.mother.userId, PEOPLE.taro.userId]);
  });

  it('本人が重複しない（索引に出ているときは足さない）', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const members = await familyMemberService.listMembers(ctx('mother', 'admin'));
    expect(members).toHaveLength(1);
  });

  it('別の家族の人は含まれない', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    seedUser(world.users, 'taro', { familyId: 'fam-other', role: 'child' });
    const members = await familyMemberService.listMembers(ctx('mother', 'admin'));
    expect(members.map((m) => m.userId)).toEqual([PEOPLE.mother.userId]);
  });

  it('家族の記録がなければ思いがけない失敗として投げる', async () => {
    world.families.clear();
    await expect(familyMemberService.listMembers(ctx('mother', 'admin'))).rejects.toThrow();
  });
});
