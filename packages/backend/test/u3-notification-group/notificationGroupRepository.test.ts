import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import { docClient } from '../../src/lib/dynamoClient';
import type { NotificationGroup } from '../../src/models';
import * as notificationGroupRepository from '../../src/repositories/notificationGroupRepository';
import { NOTIFICATION_GROUPS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';

const group: NotificationGroup = {
  groupId: 'C_g1',
  familyId: 'fam-1',
  groupName: '山田家のグループ',
  registeredByUserId: 'user-mother',
  registeredAt: '2026-11-02T00:00:00.000Z',
};

describe('notificationGroupRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('findByGroupId: あれば返し、なければ undefined', async () => {
    world.notificationGroups.set(group.groupId, { ...group });
    expect(await notificationGroupRepository.findByGroupId('C_g1')).toEqual(group);
    expect(await notificationGroupRepository.findByGroupId('C_none')).toBeUndefined();
  });

  it('findByGroupId: 強い整合性で、NotificationGroups を groupId で読む', async () => {
    await notificationGroupRepository.findByGroupId('C_g1');
    const input = world.mock.commandCalls(GetCommand)[0]?.args[0].input;
    expect(input).toMatchObject({
      TableName: NOTIFICATION_GROUPS_TABLE,
      Key: { groupId: 'C_g1' },
      ConsistentRead: true,
    });
  });

  it('buildPutItem: 条件は「まだない、またはこの家族のもの」', () => {
    const { Put } = notificationGroupRepository.buildPutItem(group);
    expect(Put.TableName).toBe(NOTIFICATION_GROUPS_TABLE);
    expect(Put.Item).toEqual(group);
    expect(Put.ConditionExpression).toBe('attribute_not_exists(groupId) OR familyId = :myFamily');
    expect(Put.ExpressionAttributeValues).toEqual({ ':myFamily': 'fam-1' });
  });

  it('buildDeleteItem: 条件は「この家族のもの」', () => {
    const { Delete } = notificationGroupRepository.buildDeleteItem('C_old', 'fam-1');
    expect(Delete.Key).toEqual({ groupId: 'C_old' });
    expect(Delete.ConditionExpression).toBe('familyId = :myFamily');
    expect(Delete.ExpressionAttributeValues).toEqual({ ':myFamily': 'fam-1' });
  });

  it('Put の条件: 記録がなければ書ける', async () => {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [notificationGroupRepository.buildPutItem(group)],
      }),
    );
    expect(world.notificationGroups.get('C_g1')).toMatchObject({ familyId: 'fam-1' });
  });

  it('Put の条件: 同じ家族の記録があれば書き直せる', async () => {
    world.notificationGroups.set(group.groupId, { ...group, groupName: '古い名前' });
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [notificationGroupRepository.buildPutItem(group)],
      }),
    );
    expect(world.notificationGroups.get('C_g1')?.groupName).toBe('山田家のグループ');
  });

  it('Put の条件: 別の家族の記録があれば断られ、記録は変わらない', async () => {
    world.notificationGroups.set(group.groupId, { ...group, familyId: 'fam-2' });
    await expect(
      docClient.send(
        new TransactWriteCommand({
          TransactItems: [notificationGroupRepository.buildPutItem(group)],
        }),
      ),
    ).rejects.toThrow();
    expect(world.notificationGroups.get('C_g1')?.familyId).toBe('fam-2');
  });

  it('Delete の条件: 別の家族の記録は消せない', async () => {
    world.notificationGroups.set('C_old', { ...group, groupId: 'C_old', familyId: 'fam-2' });
    await expect(
      docClient.send(
        new TransactWriteCommand({
          TransactItems: [notificationGroupRepository.buildDeleteItem('C_old', 'fam-1')],
        }),
      ),
    ).rejects.toThrow();
    expect(world.notificationGroups.has('C_old')).toBe(true);
  });
});
