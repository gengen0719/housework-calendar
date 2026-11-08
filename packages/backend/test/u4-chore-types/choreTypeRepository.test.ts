import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as choreTypeRepository from '../../src/repositories/choreTypeRepository';
import { CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { OTHER_FAMILY_ID, seedChoreType } from './helpers/seed';

describe('choreTypeRepository（読み取り）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('キーの作り方: 種類は TYPE#、名前の印は NAME#', () => {
    expect(choreTypeRepository.typeSortKey('abc')).toBe('TYPE#abc');
    expect(choreTypeRepository.nameSortKey('皿洗い')).toBe('NAME#皿洗い');
  });

  it('listByFamily: 自分の家族の種類だけを返し、名前の印は含めない', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 't1', name: '皿洗い', description: '夕食' });
    seedChoreType(world.choreTypes, {
      choreTypeId: 't2',
      name: '風呂掃除',
      familyId: OTHER_FAMILY_ID,
    });
    const records = await choreTypeRepository.listByFamily(FAMILY_ID);
    expect(records.map((r) => r.choreTypeId)).toEqual(['t1']);
    expect(records[0]).toEqual({
      familyId: FAMILY_ID,
      choreTypeId: 't1',
      name: '皿洗い',
      unitPrice: 100,
      description: '夕食',
      active: true,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    // テーブルの内部のキー（sk）は返さない
    expect(records[0]).not.toHaveProperty('sk');
  });

  it('listByFamily: 強い整合性の Query で、続きがあれば最後まで読む', async () => {
    for (let i = 1; i <= 5; i++) {
      seedChoreType(world.choreTypes, { choreTypeId: `t${i}`, name: `仕事${i}` });
    }
    world.hooks.queryPageSize = 2;
    const records = await choreTypeRepository.listByFamily(FAMILY_ID);
    expect(records).toHaveLength(5);
    const calls = world.mock.commandCalls(QueryCommand).map((c) => c.args[0].input);
    expect(calls).toHaveLength(3);
    for (const input of calls) {
      expect(input).toMatchObject({
        TableName: CHORE_TYPES_TABLE,
        KeyConditionExpression: 'familyId = :f AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':f': FAMILY_ID, ':p': 'TYPE#' },
        ConsistentRead: true,
      });
    }
    expect(calls[1]?.ExclusiveStartKey).toBeDefined();
    expect(calls[0]?.ExclusiveStartKey).toBeUndefined();
  });

  it('listByFamily: 種類がなければ空の配列', async () => {
    expect(await choreTypeRepository.listByFamily(FAMILY_ID)).toEqual([]);
  });

  it('findById: 強い整合性で、家族と種類の ID のキーで読む。説明がなければ description はない', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 't1', name: '皿洗い' });
    const record = await choreTypeRepository.findById(FAMILY_ID, 't1');
    expect(record?.name).toBe('皿洗い');
    expect(record).not.toHaveProperty('description');
    const input = world.mock.commandCalls(GetCommand)[0]?.args[0].input;
    expect(input).toMatchObject({
      TableName: CHORE_TYPES_TABLE,
      Key: { familyId: FAMILY_ID, sk: 'TYPE#t1' },
      ConsistentRead: true,
    });
  });

  it('findById: ほかの家族の種類と、ない種類は undefined（NFR4.36）', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 't1', name: '皿洗い' });
    expect(await choreTypeRepository.findById(OTHER_FAMILY_ID, 't1')).toBeUndefined();
    expect(await choreTypeRepository.findById(FAMILY_ID, 'missing')).toBeUndefined();
  });

  it('findNameMarker: 名前の印を強い整合性で読む。なければ undefined', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: 't1', name: '皿洗い' });
    expect(await choreTypeRepository.findNameMarker(FAMILY_ID, '皿洗い')).toEqual({
      familyId: FAMILY_ID,
      sk: 'NAME#皿洗い',
      choreTypeId: 't1',
    });
    expect(await choreTypeRepository.findNameMarker(FAMILY_ID, '洗濯')).toBeUndefined();
    expect(await choreTypeRepository.findNameMarker(OTHER_FAMILY_ID, '皿洗い')).toBeUndefined();
    const input = world.mock.commandCalls(GetCommand)[0]?.args[0].input;
    expect(input).toMatchObject({ Key: { familyId: FAMILY_ID, sk: 'NAME#皿洗い' } });
    expect(input).toMatchObject({ ConsistentRead: true });
  });
});
