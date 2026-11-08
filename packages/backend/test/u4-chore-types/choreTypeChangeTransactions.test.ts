import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChoreTypeRecord } from '../../src/models';
import * as choreTypeRepository from '../../src/repositories/choreTypeRepository';
import * as calendarPort from '../../src/services/calendarPort';
import * as choreTypeService from '../../src/services/choreTypeService';
import { FAKE_CHORE_TYPE_ID_1 } from '../fixtures/fakeSecrets';
import { CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, NOW, PEOPLE } from '../u2-invitation/helpers/seed';
import { nameMarkers, seedChoreType, typeItems } from './helpers/seed';

const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' } as const;
const ID = FAKE_CHORE_TYPE_ID_1;

const record: ChoreTypeRecord = {
  familyId: FAMILY_ID,
  choreTypeId: ID,
  name: '皿洗い',
  unitPrice: 100,
  description: '夕食のあと',
  active: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function cancel(...codes: string[]): TransactionCanceledException {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('改名・消すの取引（choreTypeRepository）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('buildRenameItems: 新しい印の Put、古い印の Delete、種類の Update を決まった条件で作る', () => {
    const items = choreTypeRepository.buildRenameItems(
      record,
      { name: '食器洗い', unitPrice: 120 },
      NOW,
    );
    expect(items).toHaveLength(3);
    expect(items[0]?.Put).toMatchObject({
      TableName: CHORE_TYPES_TABLE,
      Item: { familyId: FAMILY_ID, sk: 'NAME#食器洗い', choreTypeId: ID },
      ConditionExpression: 'attribute_not_exists(sk)',
    });
    expect(items[1]?.Delete).toMatchObject({
      Key: { familyId: FAMILY_ID, sk: 'NAME#皿洗い' },
      ConditionExpression: 'choreTypeId = :id',
      ExpressionAttributeValues: { ':id': ID },
    });
    expect(items[2]?.Update).toMatchObject({
      Key: { familyId: FAMILY_ID, sk: `TYPE#${ID}` },
      ConditionExpression: 'attribute_exists(sk) AND #name = :oldName',
      ExpressionAttributeValues: { ':oldName': '皿洗い', ':name': '食器洗い', ':unitPrice': 120 },
    });
    // 説明を送らなければ description を消す
    expect(items[2]?.Update?.UpdateExpression).toContain('REMOVE #description');
  });

  it('buildDeleteItems: 種類は active = false のときだけ、名前の印は choreTypeId が合うときだけ消す', () => {
    const items = choreTypeRepository.buildDeleteItems(record);
    expect(items[0]?.Delete).toMatchObject({
      Key: { familyId: FAMILY_ID, sk: `TYPE#${ID}` },
      ConditionExpression: 'attribute_exists(sk) AND #active = :false',
      ExpressionAttributeValues: { ':false': false },
    });
    expect(items[1]?.Delete).toMatchObject({
      Key: { familyId: FAMILY_ID, sk: 'NAME#皿洗い' },
      ConditionExpression: 'choreTypeId = :id',
    });
  });

  it('classifyCancellation: 新しい印の条件は name-taken、競合は stale、ほかの Code と空は undefined', () => {
    const { classifyCancellation } = choreTypeRepository;
    expect(
      classifyCancellation('rename', [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }]),
    ).toBe('name-taken');
    expect(
      classifyCancellation('rename', [
        { Code: 'None' },
        { Code: 'TransactionConflict' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('stale');
    expect(classifyCancellation('delete', [{ Code: 'ConditionalCheckFailed' }])).toBe('stale');
    expect(classifyCancellation('rename', [{ Code: 'ValidationError' }, { Code: 'None' }])).toBe(
      undefined,
    );
    expect(classifyCancellation('rename', undefined)).toBeUndefined();
    expect(classifyCancellation('rename', [{ Code: 'None' }])).toBeUndefined();
  });

  it('renameWithName: 取引が通れば名前の印を付け替え、説明を消す', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い', description: '夕食' });
    const outcome = await choreTypeRepository.renameWithName(
      { ...record, active: true },
      { name: '食器洗い', unitPrice: 120 },
      NOW,
    );
    expect(outcome.status).toBe('updated');
    expect(typeItems(world.choreTypes)[0]).toMatchObject({ name: '食器洗い', unitPrice: 120 });
    expect(typeItems(world.choreTypes)[0]).not.toHaveProperty('description');
    expect(nameMarkers(world.choreTypes).map((m) => m.sk)).toEqual(['NAME#食器洗い']);
  });

  it('renameWithName: 思いがけない Code と読み取れない失敗は投げ直す', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('ValidationError', 'None', 'None'));
    await expect(
      choreTypeRepository.renameWithName(record, { name: '食器洗い', unitPrice: 1 }, NOW),
    ).rejects.toBeInstanceOf(TransactionCanceledException);
    world.mock.on(TransactWriteCommand).rejects(new Error('boom'));
    await expect(
      choreTypeRepository.renameWithName(record, { name: '食器洗い', unitPrice: 1 }, NOW),
    ).rejects.toThrow('boom');
  });

  it('deleteWithName: 条件が外れたら stale、思いがけない Code は投げ直す', async () => {
    // 種類がもうない（条件が外れる）
    expect(await choreTypeRepository.deleteWithName(record)).toBe('stale');
    world.mock.on(TransactWriteCommand).rejects(cancel('ProvisionedThroughputExceeded', 'None'));
    await expect(choreTypeRepository.deleteWithName(record)).rejects.toBeInstanceOf(
      TransactionCanceledException,
    );
    world.mock.on(TransactWriteCommand).rejects(new Error('boom'));
    await expect(choreTypeRepository.deleteWithName(record)).rejects.toThrow('boom');
  });

  it('updateKeepingName: 名前が変わっていれば stale、合っていれば更新して新しい値を返す', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '食器洗い' });
    const stale = await choreTypeRepository.updateKeepingName(
      { ...record, active: true },
      { name: '皿洗い', unitPrice: 1 },
      NOW,
    );
    expect(stale.status).toBe('stale');
    const updated = await choreTypeRepository.updateKeepingName(
      { ...record, name: '食器洗い', active: true },
      { name: '食器洗い', unitPrice: 130, description: 'あたらしい' },
      NOW,
    );
    expect(updated).toMatchObject({
      status: 'updated',
      record: { name: '食器洗い', unitPrice: 130, description: 'あたらしい' },
    });
  });

  it('updateKeepingName / setActive: 条件以外の失敗は投げ直す', async () => {
    world.mock.on(UpdateCommand).rejects(new Error('boom'));
    await expect(
      choreTypeRepository.updateKeepingName(record, { name: '皿洗い', unitPrice: 1 }, NOW),
    ).rejects.toThrow('boom');
    await expect(choreTypeRepository.setActive(FAMILY_ID, ID, true, NOW)).rejects.toThrow('boom');
  });
});

describe('変更・消すのやり直し（choreTypeService）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い' });
  });
  const current = { ...record, active: true, description: undefined };

  it('update: 競合は読み直して 1 回だけやり直し、続けて断られたら INTERNAL（取引は 2 回まで）', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('None', 'TransactionConflict', 'None'));
    const result = await choreTypeService.update(
      ctx,
      current,
      { name: '食器洗い', unitPrice: 100 },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('update: 名前を変えない変更が続けて断られても、書き込みは 2 回までで INTERNAL', async () => {
    world.mock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'failed', $metadata: {} }));
    const result = await choreTypeService.update(
      ctx,
      current,
      { name: '皿洗い', unitPrice: 120 },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(world.mock.commandCalls(UpdateCommand)).toHaveLength(2);
  });

  it('update: 断られたあとに種類がなくなっていれば NOT_FOUND', async () => {
    world.choreTypes.clear();
    const result = await choreTypeService.update(
      ctx,
      current,
      { name: '皿洗い', unitPrice: 120 },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('update: 入力が正しくなければ、書き込まずに失敗の理由を返す', async () => {
    const result = await choreTypeService.update(
      ctx,
      current,
      { name: '皿洗い', unitPrice: 1.5 },
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'INVALID_UNIT_PRICE' });
    expect(world.mock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('remove: 競合は 1 回だけやり直し、2 回目で通れば消える', async () => {
    world.mock
      .on(TransactWriteCommand)
      .rejectsOnce(cancel('TransactionConflict', 'None'))
      .resolves({});
    const result = await choreTypeService.remove(ctx, ID, NOW);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('remove: 割り当てに使われていて 409 でも、「使わない」に変えた操作を CHORE_TYPE_ACTIVE_CHANGED（via: delete）で残す', async () => {
    calendarPort.setCalendarPort({ isChoreTypeAssigned: async () => true });
    try {
      const result = await choreTypeService.remove(ctx, ID, NOW);
      expect(result).toEqual({ ok: false, reason: 'CHORE_TYPE_IN_USE' });
      const lines = vi
        .mocked(console.log)
        .mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
      const changed = lines.filter((line) => line.event === 'CHORE_TYPE_ACTIVE_CHANGED');
      expect(changed).toHaveLength(1);
      expect(changed[0]).toMatchObject({
        familyId: FAMILY_ID,
        userId: PEOPLE.mother.userId,
        choreTypeId: ID,
        active: false,
        via: 'delete',
      });
      // 拒否のログは別に残る
      expect(lines.some((line) => line.event === 'CHORE_TYPE_REJECTED')).toBe(true);
    } finally {
      calendarPort.resetCalendarPort();
    }
  });

  it('remove: 続けて競合すれば INTERNAL', async () => {
    world.mock.on(TransactWriteCommand).rejects(cancel('TransactionConflict', 'None'));
    const result = await choreTypeService.remove(ctx, ID, NOW);
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('remove: 取引が断られたあとに種類がなければ NOT_FOUND、種類がもともとなければ書かずに NOT_FOUND', async () => {
    world.mock.on(TransactWriteCommand).callsFake(() => {
      world.choreTypes.clear();
      throw cancel('ConditionalCheckFailed', 'None');
    });
    expect(await choreTypeService.remove(ctx, ID, NOW)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(await choreTypeService.remove(ctx, ID, NOW)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});
