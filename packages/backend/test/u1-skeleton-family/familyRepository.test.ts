import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as familyRepository from '../../src/repositories/familyRepository';
import { setupWorld } from './helpers/world';

const NOW = new Date('2026-11-01T00:00:00.000Z');
const KEY = '3f1c1a52-8f0e-4a5e-9d38-0c1f4f6e7a01';

const family = {
  familyId: 'fam-1',
  name: '田中家',
  adminUserId: 'user-1',
  createdAt: NOW.toISOString(),
};
const record = {
  userId: 'user-1',
  idempotencyKey: KEY,
  operation: 'createFamily' as const,
  result: {
    familyId: 'fam-1',
    name: '田中家',
    role: 'admin' as const,
    notificationGroupRegistered: false,
  },
};

describe('familyRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    world.users.set('user-1', { userId: 'user-1', displayName: '花子', friendStatus: 'friend' });
  });

  it('家族を familyId で読める。いなければ undefined', async () => {
    world.families.set('fam-1', { ...family });
    expect(await familyRepository.findById('fam-1')).toEqual(family);
    expect(await familyRepository.findById('nobody')).toBeUndefined();
  });

  it('家族・利用者の更新・結果の記録を 1 つの取引で書く', async () => {
    expect(await familyRepository.createWithAdmin(family, record, NOW)).toBe('created');
    expect(world.families.get('fam-1')).toEqual(family);
    expect(world.users.get('user-1')).toMatchObject({ familyId: 'fam-1', role: 'admin' });
    expect(world.requestRecords.size).toBe(1);
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('利用者がすでに家族に入っていれば conflict で、何も書かない', async () => {
    world.users.set('user-1', { userId: 'user-1', familyId: 'fam-old', role: 'child' });
    expect(await familyRepository.createWithAdmin(family, record, NOW)).toBe('conflict');
    expect(world.families.size).toBe(0);
    expect(world.requestRecords.size).toBe(0);
    expect(world.users.get('user-1')).toMatchObject({ familyId: 'fam-old', role: 'child' });
  });

  it('同じ印の記録がすでにあれば conflict で、家族も増えない', async () => {
    world.requestRecords.set(`user-1#${KEY}`, { ...record, expiresAt: 9_999_999_999 });
    expect(await familyRepository.createWithAdmin(family, record, NOW)).toBe('conflict');
    expect(world.families.size).toBe(0);
    expect(world.users.get('user-1')?.familyId).toBeUndefined();
  });

  it('利用者の記録がなければ conflict で、利用者を勝手に作らない', async () => {
    world.users.clear();
    expect(await familyRepository.createWithAdmin(family, record, NOW)).toBe('conflict');
    expect(world.users.size).toBe(0);
    expect(world.families.size).toBe(0);
  });

  it('条件以外の失敗は投げ直し、何も残らない', async () => {
    world.mock.on(TransactWriteCommand).rejects(new Error('DynamoDB is down'));
    await expect(familyRepository.createWithAdmin(family, record, NOW)).rejects.toThrow(
      'DynamoDB is down',
    );
    expect(world.families.size).toBe(0);
    expect(world.requestRecords.size).toBe(0);
    expect(world.users.get('user-1')?.familyId).toBeUndefined();
  });
});
