import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { FriendStatus } from '@housework/shared';
import { docClient, tables } from '../lib/dynamoClient';
import type { User } from '../models';

export const LINE_USER_ID_INDEX = 'lineUserId-index';

export async function findById(userId: string): Promise<User | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tables.users(), Key: { userId } }),
  );
  return result.Item as User | undefined;
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
