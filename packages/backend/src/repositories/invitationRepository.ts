import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { Invitation } from '../models';

/** 強い整合性で印の招待を読む。TTL で消えていればない（undefined）。 */
export async function findByToken(token: string): Promise<Invitation | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tables.invitations(), Key: { token }, ConsistentRead: true }),
  );
  return result.Item as Invitation | undefined;
}

/** 新しい招待を、取引（TransactWriteItems）の 1 項目として書くための Put。同じ印があれば条件で失敗する。 */
export function buildPutItem(invitation: Invitation) {
  return {
    Put: {
      TableName: tables.invitations(),
      Item: invitation,
      ConditionExpression: 'attribute_not_exists(#token)',
      ExpressionAttributeNames: { '#token': 'token' },
    },
  };
}

/**
 * 前の招待を replaced にする Update。項目がなければ（読んだあとに TTL で消えた）条件で失敗し、
 * 呼び出し側が項目なしとして組み立て直す（reliability-design.md の 3、4）。
 */
export function buildMarkReplacedItem(token: string) {
  return {
    Update: {
      TableName: tables.invitations(),
      Key: { token },
      UpdateExpression: 'SET #status = :replaced',
      ConditionExpression: 'attribute_exists(#token)',
      ExpressionAttributeNames: { '#token': 'token', '#status': 'status' },
      ExpressionAttributeValues: { ':replaced': 'replaced' },
    },
  };
}

/**
 * 参加の取引の 1 項目: 招待がいまも使える（status が active で、期限が今より後）ことの ConditionCheck。
 * 期限が今と同じなら使えない（BR3.2）。
 */
export function buildUsableCheckItem(token: string, now: Date) {
  return {
    ConditionCheck: {
      TableName: tables.invitations(),
      Key: { token },
      ConditionExpression: '#status = :active AND expiresAt > :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active', ':now': now.toISOString() },
    },
  };
}

/** 使える（active で、期限より前）か。期限と同じ時刻なら使えない（BR3.2）。 */
export function isUsable(invitation: Invitation, now: Date): boolean {
  return invitation.status === 'active' && now.getTime() < Date.parse(invitation.expiresAt);
}
