import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../src/models';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from './helpers/world';

const T0 = new Date('2026-11-01T00:00:00.000Z');
const T1 = new Date('2026-11-02T00:00:00.000Z');

const taro: User = {
  userId: 'user-taro',
  lineUserId: 'U_taro',
  displayName: '太郎',
  friendStatus: 'friend',
  familyId: 'fam-1',
  role: 'child',
  registeredAt: T0.toISOString(),
  friendStatusChangedAt: T0.toISOString(),
};

describe('familyMemberService', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('registerUser: 初めての人は友だちとして記録し、表示名もこのとき記録する', async () => {
    const user = await familyMemberService.registerUser('U_hanako', '花子', T0);
    expect(user.friendStatus).toBe('friend');
    expect(user.displayName).toBe('花子');
    expect(user.registeredAt).toBe(T0.toISOString());
    expect(user.familyId).toBeUndefined();
    expect(world.users.size).toBe(1);
  });

  it('registerUser: 何度呼んでも 1 人で、表示名は最初のまま', async () => {
    const first = await familyMemberService.registerUser('U_hanako', '花子', T0);
    const second = await familyMemberService.registerUser('U_hanako', 'はなこ', T1);
    expect(second.userId).toBe(first.userId);
    expect(second.displayName).toBe('花子');
    expect(world.users.size).toBe(1);
  });

  it('registerUser: ブロック中の人は友だちに戻り、家族と役割は前のまま', async () => {
    world.users.set(taro.userId, { ...taro, friendStatus: 'blocked' });
    const user = await familyMemberService.registerUser('U_taro', '次郎', T1);
    expect(user.friendStatus).toBe('friend');
    expect(user.friendStatusChangedAt).toBe(T1.toISOString());
    const stored = world.users.get(taro.userId);
    expect(stored?.friendStatus).toBe('friend');
    expect(stored?.familyId).toBe('fam-1');
    expect(stored?.role).toBe('child');
    expect(stored?.displayName).toBe('太郎');
  });

  it('markBlocked: ブロック中にし、家族と役割は消さない', async () => {
    world.users.set(taro.userId, { ...taro });
    await familyMemberService.markBlocked('U_taro', T1);
    const stored = world.users.get(taro.userId);
    expect(stored?.friendStatus).toBe('blocked');
    expect(stored?.familyId).toBe('fam-1');
    expect(stored?.role).toBe('child');
  });

  it('markBlocked: 記録がない人は何もしない', async () => {
    await familyMemberService.markBlocked('U_nobody', T1);
    expect(world.users.size).toBe(0);
  });

  it('markBlocked: すでにブロック中なら変更時刻も変えない', async () => {
    world.users.set(taro.userId, { ...taro, friendStatus: 'blocked' });
    await familyMemberService.markBlocked('U_taro', T1);
    expect(world.users.get(taro.userId)?.friendStatusChangedAt).toBe(T0.toISOString());
  });

  it('findUserByLineId: いれば ok、いなければ NOT_FOUND', async () => {
    world.users.set(taro.userId, { ...taro });
    const found = await familyMemberService.findUserByLineId('U_taro');
    expect(found.ok && found.value.userId).toBe('user-taro');
    expect(await familyMemberService.findUserByLineId('U_nobody')).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('getUserStatus: 友だちか・家族・役割を返し、家族のない人は家族の項目を持たない', async () => {
    world.users.set(taro.userId, { ...taro });
    world.users.set('user-hanako', {
      ...taro,
      userId: 'user-hanako',
      lineUserId: 'U_h',
      familyId: undefined,
      role: undefined,
    });
    expect(await familyMemberService.getUserStatus('user-taro')).toEqual({
      ok: true,
      value: { friendStatus: 'friend', familyId: 'fam-1', role: 'child' },
    });
    expect(await familyMemberService.getUserStatus('user-hanako')).toEqual({
      ok: true,
      value: { friendStatus: 'friend' },
    });
    expect(await familyMemberService.getUserStatus('nobody')).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});
