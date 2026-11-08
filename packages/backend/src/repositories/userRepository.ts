import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { FriendStatus } from '@housework/shared';
import { docClient, tables } from '../lib/dynamoClient';
import type { User } from '../models';

export const LINE_USER_ID_INDEX = 'lineUserId-index';

export const FAMILY_ID_INDEX = 'familyId-index';

/** 利用者を読む。索引に出る前など、最新の値が要るときは consistent: true（強い整合性）。 */
export async function findById(
  userId: string,
  options: { consistent?: boolean } = {},
): Promise<User | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.users(),
      Key: { userId },
      ...(options.consistent ? { ConsistentRead: true } : {}),
    }),
  );
  return result.Item as User | undefined;
}

/** 索引から読める、家族のメンバー 1 人分（射影: displayName、role、familyJoinedAt。lineUserId は含まれない） */
export type FamilyMemberRow = Pick<User, 'userId' | 'displayName' | 'role' | 'familyJoinedAt'>;

/**
 * 家族のメンバーを `familyId-index` から読む（結果整合。参加や作成の直後は本人がまだ出ないことがある）。
 * 家族は数人なので、ページがあれば最後まで読む。
 */
export async function listByFamily(familyId: string): Promise<FamilyMemberRow[]> {
  const rows: FamilyMemberRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tables.users(),
        IndexName: FAMILY_ID_INDEX,
        KeyConditionExpression: 'familyId = :familyId',
        ExpressionAttributeValues: { ':familyId': familyId },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const item of result.Items ?? []) {
      const { userId, displayName, role, familyJoinedAt } = item as FamilyMemberRow;
      rows.push({ userId, displayName, role, familyJoinedAt });
    }
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return rows;
}

/**
 * 参加の取引の 1 項目: 利用者を招待の家族の子供にする Update（BR3.8）。
 * 条件は「記録がある」「まだ家族に入っていない」「友だちである」。同時の二重の参加を 1 つに絞る。
 */
export function buildJoinAsChildItem(userId: string, familyId: string, joinedAt: string) {
  return {
    Update: {
      TableName: tables.users(),
      Key: { userId },
      UpdateExpression: 'SET familyId = :familyId, #role = :role, familyJoinedAt = :joinedAt',
      ConditionExpression:
        'attribute_exists(userId) AND attribute_not_exists(familyId) AND friendStatus = :friend',
      ExpressionAttributeNames: { '#role': 'role' },
      ExpressionAttributeValues: {
        ':familyId': familyId,
        ':role': 'child',
        ':joinedAt': joinedAt,
        ':friend': 'friend',
      },
    },
  };
}

export async function findByLineUserId(lineUserId: string): Promise<User | undefined> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tables.users(),
      IndexName: LINE_USER_ID_INDEX,
      KeyConditionExpression: 'lineUserId = :lineUserId',
      ExpressionAttributeValues: { ':lineUserId': lineUserId },
      Limit: 1,
    }),
  );
  return result.Items?.[0] as User | undefined;
}

/** 同じ userId がすでにあれば失敗する（条件付きの書き込み）。 */
export async function create(user: User): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tables.users(),
      Item: user,
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );
}

export async function setFriendStatus(
  userId: string,
  friendStatus: FriendStatus,
  at: string,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tables.users(),
      Key: { userId },
      UpdateExpression: 'SET friendStatus = :friendStatus, friendStatusChangedAt = :at',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: { ':friendStatus': friendStatus, ':at': at },
    }),
  );
}
