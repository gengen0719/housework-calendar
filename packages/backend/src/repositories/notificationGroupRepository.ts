import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { NotificationGroup } from '../models';

/** 強い整合性でグループの記録を読む（登録・解除の前の確かめ。reliability-design.md）。なければ undefined。 */
export async function findByGroupId(groupId: string): Promise<NotificationGroup | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.notificationGroups(),
      Key: { groupId },
      ConsistentRead: true,
    }),
  );
  return result.Item as NotificationGroup | undefined;
}

/**
 * 新しいグループを、取引（TransactWriteItems）の 1 項目として書くための Put。
 * 条件は「まだない、またはこの家族のもの」（別の家族のものなら断られる。BR4.5）。
 */
export function buildPutItem(group: NotificationGroup) {
  return {
    Put: {
      TableName: tables.notificationGroups(),
      Item: group,
      ConditionExpression: 'attribute_not_exists(groupId) OR familyId = :myFamily',
      ExpressionAttributeValues: { ':myFamily': group.familyId },
    },
  };
}

/** 前のグループを消す Delete。条件は「この家族のもの」（BR4.6）。 */
export function buildDeleteItem(groupId: string, familyId: string) {
  return {
    Delete: {
      TableName: tables.notificationGroups(),
      Key: { groupId },
      ConditionExpression: 'familyId = :myFamily',
      ExpressionAttributeValues: { ':myFamily': familyId },
    },
  };
}

/** グループの記録だけを消す（家族の側がもうこのグループを指していないとき。条件は「この家族のもの」）。 */
export async function deleteRecord(groupId: string, familyId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: tables.notificationGroups(),
      Key: { groupId },
      ConditionExpression: 'familyId = :myFamily',
      ExpressionAttributeValues: { ':myFamily': familyId },
    }),
  );
}
