import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../src/models';
import * as userRepository from '../../src/repositories/userRepository';
import { setupWorld } from './helpers/world';

const user: User = {
  userId: 'user-1',
  lineUserId: 'U_taro',
  displayName: '太郎',
  friendStatus: 'friend',
  registeredAt: '2026-11-01T00:00:00.000Z',
  friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
};

describe('userRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('作った利用者を userId で読める', async () => {
    await userRepository.create(user);
    expect(await userRepository.findById('user-1')).toEqual(user);
  });

  it('LINE のユーザー ID で（GSI lineUserId-index を使って）利用者を探せる', async () => {
    await userRepository.create(user);
    const found = await userRepository.findByLineUserId('U_taro');
    expect(found?.userId).toBe('user-1');
    const query = world.mock.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(query?.IndexName).toBe('lineUserId-index');
  });

  it('いない利用者は undefined を返す', async () => {
    expect(await userRepository.findById('nobody')).toBeUndefined();
    expect(await userRepository.findByLineUserId('U_nobody')).toBeUndefined();
  });

  it('同じ userId の作り直しは条件付きの書き込みで失敗する', async () => {
    await userRepository.create(user);
    await expect(userRepository.create(user)).rejects.toBeInstanceOf(
      ConditionalCheckFailedException,
    );
  });

  it('友だちの状態と変えた時刻を更新できる', async () => {
    await userRepository.create(user);
    await userRepository.setFriendStatus('user-1', 'blocked', '2026-11-02T00:00:00.000Z');
    const found = await userRepository.findById('user-1');
    expect(found?.friendStatus).toBe('blocked');
    expect(found?.friendStatusChangedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(found?.displayName).toBe('太郎');
  });

  it('いない利用者の状態の更新は失敗する（勝手に作らない）', async () => {
    await expect(
      userRepository.setFriendStatus('nobody', 'blocked', '2026-11-02T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(ConditionalCheckFailedException);
    expect(world.users.size).toBe(0);
  });
});
