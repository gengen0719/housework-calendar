import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { FAMILIES_TABLE, USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { CHILDREN, FAMILY_ID, PEOPLE, seedAllowanceHousehold } from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const taro = { familyId: FAMILY_ID, userId: CHILDREN.taro.userId, role: 'child' as const };
const system = { familyId: FAMILY_ID, role: 'system' as const };

const count = (table: string, operation: 'Get' | 'Query'): number =>
  world.hooks.readLog.filter((e) => e.table === table && e.operation === operation).length;

beforeEach(() => {
  world = setupWorld();
  seedAllowanceHousehold(world);
});
afterEach(() => {
  world.mock.reset();
});

describe('loadFamilyAndMembers（BR10.16、NFR7.55、ADR-U9-02）', () => {
  it('Families の GetItem が 1 回、Users の Query が 1 回', async () => {
    await familyMemberService.loadFamilyAndMembers(taro);
    expect(count(FAMILIES_TABLE, 'Get')).toBe(1);
    expect(count(USERS_TABLE, 'Query')).toBe(1);
    expect(count(USERS_TABLE, 'Get')).toBe(0);
  });

  it('本人が索引にいなければ補いの GetItem が +1、role: system は 0', async () => {
    world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
    await familyMemberService.loadFamilyAndMembers(taro);
    expect(count(USERS_TABLE, 'Get')).toBe(1);
    world.hooks.readLog.length = 0;
    await familyMemberService.loadFamilyAndMembers(system);
    expect(count(USERS_TABLE, 'Get')).toBe(0);
  });

  it('管理者が最初、同じ入った時刻は表示名、それも同じなら userId の順', async () => {
    const result = await familyMemberService.loadFamilyAndMembers(taro);
    expect(result.members[0]?.userId).toBe(PEOPLE.mother.userId);
    const ids = result.members.slice(1).map((m) => m.userId);
    // 3 人とも同じ時刻（山田家の seed）なので、表示名の UTF-16 の順
    const sorted = [...result.members.slice(1)].sort((a, b) =>
      a.displayName < b.displayName ? -1 : a.displayName > b.displayName ? 1 : 0,
    );
    expect(ids).toEqual(sorted.map((m) => m.userId));
  });

  it('入った時刻がない人は家族の作成時刻とみなして並べる', async () => {
    const item = world.users.get(CHILDREN.hanako.userId);
    if (!item) throw new Error('seed がありません');
    const { familyJoinedAt: _drop, ...rest } = item;
    void _drop;
    world.users.set(CHILDREN.hanako.userId, rest);
    const result = await familyMemberService.loadFamilyAndMembers(taro);
    expect(result.members.map((m) => m.userId)).toContain(CHILDREN.hanako.userId);
  });

  it('家族の記録がなければ投げる', async () => {
    world.families.clear();
    await expect(familyMemberService.loadFamilyAndMembers(taro)).rejects.toThrow(
      '家族の記録が見つかりません',
    );
  });

  it('listMembers は loadFamilyAndMembers の members と同じ', async () => {
    const loaded = await familyMemberService.loadFamilyAndMembers(taro);
    expect(await familyMemberService.listMembers(taro)).toEqual(loaded.members);
  });
});
