import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from './helpers/world';

const KEY = '3f1c1a52-8f0e-4a5e-9d38-0c1f4f6e7a01';
const NOW = new Date('2026-11-01T00:00:00.000Z');

/** 取引が条件で断られた（ほかの要求が先に書いた）ことにする。 */
function cancelByCondition(): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
}

describe('familyMemberService.createFamily（同時の要求）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    world.users.set('user-1', { userId: 'user-1', displayName: '花子', friendStatus: 'friend' });
  });

  it('同じ印の要求が先に成功していたら、前と同じ結果を返す', async () => {
    const winner = {
      familyId: 'fam-win',
      name: '田中家',
      role: 'admin' as const,
      notificationGroupRegistered: false,
    };
    world.mock.on(TransactWriteCommand).callsFake(() => {
      world.requestRecords.set(`user-1#${KEY}`, {
        userId: 'user-1',
        idempotencyKey: KEY,
        operation: 'createFamily',
        result: winner,
        expiresAt: NOW.getTime() / 1000 + 3600,
      });
      throw cancelByCondition();
    });
    const result = await familyMemberService.createFamily('user-1', '田中家', KEY, NOW);
    expect(result).toEqual({ ok: true, value: winner });
  });

  it('別の印の要求が先に家族を作っていたら ALREADY_IN_FAMILY', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancelByCondition());
    const result = await familyMemberService.createFamily('user-1', '田中家', KEY, NOW);
    expect(result).toMatchObject({ ok: false, reason: 'ALREADY_IN_FAMILY' });
  });

  it('利用者の記録がなければ NOT_FOUND', async () => {
    world.users.clear();
    const result = await familyMemberService.createFamily('user-1', '田中家', KEY, NOW);
    expect(result).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });
});
