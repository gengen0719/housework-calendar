import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as requestRecordRepository from '../../src/repositories/requestRecordRepository';
import { REQUEST_RECORD_PUT_CONDITION } from '../../src/repositories/requestRecordRepository';
import { REQUEST_RECORDS_TABLE } from './helpers/fakeDynamo';
import { setupWorld } from './helpers/world';
import { FAKE_IDEMPOTENCY_KEY_1 } from '../fixtures/fakeSecrets';

const NOW = new Date('2026-11-01T00:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const KEY = FAKE_IDEMPOTENCY_KEY_1;

const result = {
  familyId: 'fam-1',
  name: '田中家',
  role: 'admin' as const,
  notificationGroupRegistered: false,
};

function seed(world: ReturnType<typeof setupWorld>, userId: string, expiresAt: number): void {
  world.requestRecords.set(`${userId}#${KEY}`, {
    userId,
    idempotencyKey: KEY,
    operation: 'createFamily',
    result,
    expiresAt,
  });
}

describe('requestRecordRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('同じ利用者の同じ印の記録を読める', async () => {
    seed(world, 'user-1', NOW_SECONDS + 3600);
    const found = await requestRecordRepository.find('user-1', KEY, NOW);
    expect(found?.result).toEqual(result);
  });

  it('記録がなければ undefined を返す', async () => {
    expect(await requestRecordRepository.find('user-1', KEY, NOW)).toBeUndefined();
  });

  it('別の利用者の同じ印の記録は見えない', async () => {
    seed(world, 'user-2', NOW_SECONDS + 3600);
    expect(await requestRecordRepository.find('user-1', KEY, NOW)).toBeUndefined();
  });

  it('期限が過ぎた記録は（TTL の削除が遅れていても）ないものとして扱う', async () => {
    seed(world, 'user-1', NOW_SECONDS - 1);
    expect(await requestRecordRepository.find('user-1', KEY, NOW)).toBeUndefined();
  });

  it('読み取りは強い整合性（同時の要求で負けた側が、勝った側の記録をすぐ読めるように）', async () => {
    await requestRecordRepository.find('user-1', KEY, NOW);
    const call = world.mock.commandCalls(GetCommand)[0];
    expect(call?.args[0].input).toMatchObject({
      TableName: REQUEST_RECORDS_TABLE,
      Key: { userId: 'user-1', idempotencyKey: KEY },
      ConsistentRead: true,
    });
  });

  it('書き込みの項目は 24 時間後を期限にし、同じ組があれば失敗する条件を付ける（期限切れの記録は上書きできる）', () => {
    const put = requestRecordRepository.buildPutItem(
      { userId: 'user-1', idempotencyKey: KEY, operation: 'createFamily', result },
      NOW,
    ).Put;
    expect(put.TableName).toBe(REQUEST_RECORDS_TABLE);
    expect(put.Item.expiresAt).toBe(NOW_SECONDS + 24 * 60 * 60);
    expect(put.ConditionExpression).toBe(REQUEST_RECORD_PUT_CONDITION);
    expect(put.ConditionExpression).toBe(
      'attribute_not_exists(idempotencyKey) OR expiresAt <= :now',
    );
    expect(put.ExpressionAttributeValues).toEqual({ ':now': NOW_SECONDS });
    expect(put.Item).toMatchObject({ userId: 'user-1', idempotencyKey: KEY, result });
  });
});
