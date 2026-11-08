import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { ChoreType } from '@housework/shared';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChoreTypeRecord } from '../../src/models';
import * as choreTypeRepository from '../../src/repositories/choreTypeRepository';
import * as choreTypeService from '../../src/services/choreTypeService';
import { FAKE_IDEMPOTENCY_KEY_1 } from '../fixtures/fakeSecrets';
import { CHORE_TYPES_TABLE, REQUEST_RECORDS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, NOW, PEOPLE } from '../u2-invitation/helpers/seed';
import { nameMarkers, seedChoreType, typeItems } from './helpers/seed';

const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' } as const;
const KEY = FAKE_IDEMPOTENCY_KEY_1;

const record: ChoreTypeRecord = {
  familyId: FAMILY_ID,
  choreTypeId: 'type-new',
  name: '皿洗い',
  unitPrice: 100,
  active: true,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

const request = {
  userId: PEOPLE.mother.userId,
  idempotencyKey: KEY,
  operation: 'createChoreType' as const,
  target: 'target-hash',
  result: { ...record } as unknown as ChoreType,
};

function cancel(...codes: string[]): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('登録のトランザクション（choreTypeRepository.createWithName）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('buildCreateItems: 種類・名前の印・送り直しの記録の 3 件を、決まった条件で書く', () => {
    const items = choreTypeRepository.buildCreateItems({ record, request }, NOW);
    expect(items).toHaveLength(3);
    expect(items[0]?.Put).toMatchObject({
      TableName: CHORE_TYPES_TABLE,
      Item: { familyId: FAMILY_ID, sk: 'TYPE#type-new', name: '皿洗い', active: true },
      ConditionExpression: 'attribute_not_exists(sk)',
    });
    expect(items[1]?.Put).toMatchObject({
      TableName: CHORE_TYPES_TABLE,
      Item: { familyId: FAMILY_ID, sk: 'NAME#皿洗い', choreTypeId: 'type-new' },
      ConditionExpression: 'attribute_not_exists(sk)',
    });
    expect(items[2]?.Put).toMatchObject({
      TableName: REQUEST_RECORDS_TABLE,
      ConditionExpression: 'attribute_not_exists(idempotencyKey) OR expiresAt <= :now',
    });
  });

  it('created: 3 件がそろって書かれる', async () => {
    expect(await choreTypeRepository.createWithName({ record, request }, NOW)).toBe('created');
    expect(typeItems(world.choreTypes)).toHaveLength(1);
    expect(nameMarkers(world.choreTypes)).toHaveLength(1);
    expect(world.requestRecords.size).toBe(1);
  });

  it('name-taken: 名前の印の条件で断られると、何も書かれない', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 'type-old', name: '皿洗い' });
    expect(await choreTypeRepository.createWithName({ record, request }, NOW)).toBe('name-taken');
    expect(typeItems(world.choreTypes).map((i) => i.choreTypeId)).toEqual(['type-old']);
    expect(world.requestRecords.size).toBe(0);
  });

  it('request-conflict: 同じ印の記録があると、名前の印も重なっていても送り直しとして読み分ける', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 'type-old', name: '皿洗い' });
    world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY}`, {
      userId: PEOPLE.mother.userId,
      idempotencyKey: KEY,
    });
    expect(await choreTypeRepository.createWithName({ record, request }, NOW)).toBe(
      'request-conflict',
    );
  });

  it('stale: 種類の条件で断られたら読み直してやり直す', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('ConditionalCheckFailed', 'None', 'None'));
    expect(await choreTypeRepository.createWithName({ record, request }, NOW)).toBe('stale');
  });

  it('stale: 競合（TransactionConflict）でもやり直す', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('None', 'TransactionConflict', 'None'));
    expect(await choreTypeRepository.createWithName({ record, request }, NOW)).toBe('stale');
  });

  it('思いがけない Code（ValidationError）は投げ直す', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('ValidationError', 'None', 'None'));
    await expect(choreTypeRepository.createWithName({ record, request }, NOW)).rejects.toThrow();
  });

  it('理由が読み取れない取り消しと、ほかの失敗は投げ直す', async () => {
    world.mock
      .on(TransactWriteCommand)
      .rejects(new TransactionCanceledException({ message: 'cancelled', $metadata: {} }));
    await expect(choreTypeRepository.createWithName({ record, request }, NOW)).rejects.toThrow();
    world.mock.on(TransactWriteCommand).rejects(new Error('boom'));
    await expect(choreTypeRepository.createWithName({ record, request }, NOW)).rejects.toThrow(
      'boom',
    );
  });

  it('classifyCreateCancellation: 送り直し → 名前 → その他の順に読み分ける', () => {
    const classify = choreTypeRepository.classifyCreateCancellation;
    expect(classify([{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }])).toBe(
      'name',
    );
    expect(
      classify([
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('request');
    expect(classify([{ Code: 'TransactionConflict' }, { Code: 'None' }, { Code: 'None' }])).toBe(
      'stale',
    );
    expect(classify([{ Code: 'None' }, { Code: 'None' }, { Code: 'None' }])).toBeUndefined();
    expect(classify(undefined)).toBeUndefined();
  });
});

describe('登録の流れ（choreTypeService.create）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  const input = { name: '  皿洗い　', unitPrice: 100, description: ' 夕食のあと ' };

  it('入力を正規化して保存し、送り直しの記録の target は正規化した本文の SHA-256', async () => {
    const result = await choreTypeService.create(ctx, input, KEY, NOW);
    expect(result.ok).toBe(true);
    expect(typeItems(world.choreTypes)[0]).toMatchObject({
      name: '皿洗い',
      description: '夕食のあと',
      unitPrice: 100,
      createdAt: NOW.toISOString(),
    });
    const expected = createHash('sha256')
      .update(JSON.stringify(['皿洗い', 100, '夕食のあと']))
      .digest('hex');
    const stored = [...world.requestRecords.values()][0];
    expect(stored).toMatchObject({ operation: 'createChoreType', target: expected });
  });

  it('入力の確かめは名前 → 単価 → 説明の順で、何も書かない', async () => {
    const bad = { name: '', unitPrice: -1, description: 'あ'.repeat(101) };
    expect(await choreTypeService.create(ctx, bad, KEY, NOW)).toEqual({
      ok: false,
      reason: 'INVALID_CHORE_TYPE_NAME',
    });
    expect(await choreTypeService.create(ctx, { ...bad, name: 'a' }, KEY, NOW)).toEqual({
      ok: false,
      reason: 'INVALID_UNIT_PRICE',
    });
    expect(
      await choreTypeService.create(ctx, { ...bad, name: 'a', unitPrice: 0 }, KEY, NOW),
    ).toEqual({ ok: false, reason: 'INVALID_DESCRIPTION' });
    expect(world.choreTypes.size).toBe(0);
  });

  it('競合（stale）は 1 回だけやり直し、2 回続けて断られたら INTERNAL', async () => {
    world.mock.on(TransactWriteCommand).rejectsOnce(cancel('TransactionConflict', 'None', 'None'));
    const retried = await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW);
    expect(retried.ok).toBe(true);
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('2 回続けて競合で断られたら INTERNAL（やり直しは 1 回だけ）', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('TransactionConflict', 'None', 'None'));
    const failed = await choreTypeService.create(ctx, { name: '洗濯', unitPrice: 1 }, KEY, NOW);
    expect(failed).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
    expect(world.choreTypes.size).toBe(0);
  });

  it('同じ印の送り直しは前の結果。本文が違えば IDEMPOTENCY_KEY_REUSED', async () => {
    const first = await choreTypeService.create(ctx, input, KEY, NOW);
    const second = await choreTypeService.create(ctx, input, KEY, NOW);
    expect(second).toEqual(first);
    const other = await choreTypeService.create(ctx, { ...input, unitPrice: 101 }, KEY, NOW);
    expect(other).toEqual({ ok: false, reason: 'IDEMPOTENCY_KEY_REUSED' });
    expect(typeItems(world.choreTypes)).toHaveLength(1);
  });

  it('同じ印の要求が同時に先に通ったとき（送り直しの条件）は、その結果を返す。見つからなければ INTERNAL', async () => {
    // 読んだあとに、同じ印で同じ本文の要求が先に通った状態を作る
    world.hooks.beforeNextTransaction = () => {
      const winner: ChoreType = {
        choreTypeId: 'type-winner',
        name: '皿洗い',
        unitPrice: 1,
        active: true,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      const target = createHash('sha256')
        .update(JSON.stringify(['皿洗い', 1, null]))
        .digest('hex');
      world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY}`, {
        userId: PEOPLE.mother.userId,
        idempotencyKey: KEY,
        operation: 'createChoreType',
        target,
        result: winner,
        expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
      });
    };
    const replayed = await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW);
    expect(replayed).toMatchObject({ ok: true, value: { choreTypeId: 'type-winner' } });
  });

  it('送り直しの条件で断られたのに記録が見つからなければ INTERNAL', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('None', 'None', 'ConditionalCheckFailed'));
    expect(await choreTypeService.create(ctx, { name: '洗濯', unitPrice: 1 }, KEY, NOW)).toEqual({
      ok: false,
      reason: 'INTERNAL',
    });
  });

  it('期限が過ぎたのに TTL がまだ消していない送り直しの記録は、500 にならず上書きして登録できる', async () => {
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY}`, {
      userId: PEOPLE.mother.userId,
      idempotencyKey: KEY,
      operation: 'createChoreType',
      target: 'old-target',
      result: { choreTypeId: 'type-expired' } as unknown as ChoreType,
      expiresAt: nowSeconds - 1,
    });
    const created = await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW);
    expect(created.ok).toBe(true);
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1);
    expect(world.requestRecords.get(`${PEOPLE.mother.userId}#${KEY}`)).toMatchObject({
      expiresAt: nowSeconds + 24 * 60 * 60,
    });
  });

  it('期限が過ぎていない記録は上書きされない（取引の条件で断られ、勝った側の結果を返す）', async () => {
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    const target = createHash('sha256')
      .update(JSON.stringify(['皿洗い', 1, null]))
      .digest('hex');
    // find が「ない」と見て、取引の時点で別の要求が入っていた状態: 最初の find のあとに記録を置く
    world.hooks.beforeNextTransaction = () => {
      world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY}`, {
        userId: PEOPLE.mother.userId,
        idempotencyKey: KEY,
        operation: 'createChoreType',
        target,
        result: { choreTypeId: 'type-winner' } as unknown as ChoreType,
        expiresAt: nowSeconds + 60,
      });
    };
    const replayed = await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW);
    expect(replayed).toMatchObject({ ok: true, value: { choreTypeId: 'type-winner' } });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('名前が重なったとき、相手の状態を conflictActive で返す。相手が見つからなければ true', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 't-off', name: '皿洗い', active: false });
    expect(await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW)).toEqual({
      ok: false,
      reason: 'CHORE_TYPE_NAME_TAKEN',
      conflictActive: false,
    });
    // 印だけ残って種類がない（直後に消された）
    world.choreTypes.delete(`${FAMILY_ID}#TYPE#t-off`);
    expect(await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW)).toEqual({
      ok: false,
      reason: 'CHORE_TYPE_NAME_TAKEN',
      conflictActive: true,
    });
    // 印も消えた
    world.choreTypes.delete(`${FAMILY_ID}#NAME#皿洗い`);
    const created = await choreTypeService.create(ctx, { name: '皿洗い', unitPrice: 1 }, KEY, NOW);
    expect(created.ok).toBe(true);
  });
});
