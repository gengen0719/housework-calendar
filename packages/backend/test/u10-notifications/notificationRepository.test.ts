import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createDispatch,
  replaceDispatch,
  getDispatch,
  terminal,
  conditionalFailure,
} from '../../src/repositories/notificationRepository';
import { getPayload, listPayloads } from '../../src/repositories/notificationPayloadRepository';
import { dispatchFixture } from './helpers/fixtures';
import { FAKE_U10_GROUP_ID } from '../fixtures/fakeSecrets';
const db = mockClient(DynamoDBDocumentClient);
beforeEach(() => {
  db.reset();
  process.env.NOTIFICATION_DISPATCHES_TABLE = 'dispatches';
  process.env.NOTIFICATION_PAYLOADS_TABLE = 'payloads';
});
describe('通知メタデータ', () => {
  it('本文と宛先を別のテーブルへ原子的に固定', async () => {
    db.on(TransactWriteCommand).resolves({});
    const r = dispatchFixture();
    await createDispatch(r, {
      scheduledDate: r.targetDate,
      dispatchKey: r.retryKey,
      scheduledAt: r.scheduledAt,
      destination: FAKE_U10_GROUP_ID,
      text: '本文',
      ttl: r.scheduledAt / 1000 + 86400,
    });
    const tx = db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(tx).toHaveLength(3);
    expect(tx[0]!.Put!.Item).not.toHaveProperty('text');
    expect(tx[1]!.Put!.Item!.destination).toBe(FAKE_U10_GROUP_ID);
  });
  it('既存記録の競合はfalse', async () => {
    db.on(TransactWriteCommand).rejects(
      Object.assign(new Error('conflict'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
      }),
    );
    expect(await createDispatch(dispatchFixture())).toBe(false);
  });
  it('保存自体の失敗は投げる', async () => {
    db.on(TransactWriteCommand).rejects(new Error('offline'));
    await expect(createDispatch(dispatchFixture())).rejects.toThrow();
  });
  it('所有者を条件にして終端では本文を消す', async () => {
    db.on(TransactWriteCommand).resolves({});
    const r = dispatchFixture({ state: 'sending', leaseOwner: 'owner', version: 3 });
    const next = await replaceDispatch(r, { ...r, state: 'sent' });
    expect(next?.version).toBe(4);
    const tx = db.commandCalls(TransactWriteCommand)[0]!.args[0].input.TransactItems!;
    expect(tx[0]!.Put!.ExpressionAttributeValues?.[':owner']).toBe('owner');
    expect(tx[1]!.Delete!.TableName).toBe('payloads');
  });
  it('版違いは上書きしない', async () => {
    db.on(TransactWriteCommand).rejects(
      Object.assign(new Error('conflict'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
      }),
    );
    const r = dispatchFixture();
    expect(await replaceDispatch(r, { ...r, state: 'sending' })).toBeUndefined();
  });
  it.each(['sent', 'failed', 'skipped', 'expired'] as const)('終端%sは戻さない', async (state) => {
    const r = dispatchFixture({ state });
    expect(terminal(state)).toBe(true);
    expect(await replaceDispatch(r, { ...r, state: 'prepared' })).toBeUndefined();
    expect(db.calls()).toHaveLength(0);
  });
  it('強い整合性で家族のキーを読む', async () => {
    db.on(GetCommand).resolves({ Item: dispatchFixture() });
    const r = dispatchFixture();
    expect(await getDispatch(r.familyId, r)).toEqual(r);
    expect(db.commandCalls(GetCommand)[0]!.args[0].input.ConsistentRead).toBe(true);
  });
  it('未知の取引失敗を競合扱いしない', () => {
    expect(
      conditionalFailure({
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ValidationError' }],
      }),
    ).toBe(false);
  });
});
describe('一時本文', () => {
  it.each([0, 23 * 3600000, 24 * 3600000 - 1, 24 * 3600000])(
    '保存から%s後の読取期限',
    async (offset) => {
      const r = dispatchFixture();
      db.on(GetCommand).resolves({
        Item: {
          scheduledDate: r.targetDate,
          dispatchKey: r.retryKey,
          scheduledAt: r.scheduledAt,
          text: '本文',
        },
      });
      expect(Boolean(await getPayload(r.targetDate, r.retryKey, r.scheduledAt + offset))).toBe(
        offset < 24 * 3600000,
      );
    },
  );
  it('本文がなければundefined', async () => {
    db.on(GetCommand).resolves({});
    expect(await getPayload('2027-01-31', 'missing', 0)).toBeUndefined();
  });
  it('Queryの続きも最後まで読む', async () => {
    db.on(QueryCommand)
      .resolvesOnce({ Items: [{ text: 'a' }], LastEvaluatedKey: { scheduledDate: 'day' } })
      .resolves({ Items: [{ text: 'b' }] });
    expect(await listPayloads('2027-01-31')).toHaveLength(2);
    expect(db.commandCalls(QueryCommand)).toHaveLength(2);
  });
});
