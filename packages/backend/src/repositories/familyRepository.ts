import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { Family, RequestRecord } from '../models';
import * as requestRecordRepository from './requestRecordRepository';

export async function findById(familyId: string): Promise<Family | undefined> {
  const result = await docClient.send(
    new GetCommand({ TableName: tables.families(), Key: { familyId } }),
  );
  return result.Item as Family | undefined;
}

export type CreateWithAdminResult = 'created' | 'conflict';

/**
 * 家族を作り、作った人を管理者にし、送り直し用の結果も残す。3 つを 1 つの取引（TransactWriteItems）で書くので、
 * どれかが失敗すればどれも残らない（NFR2.3）。
 * - 家族: 同じ familyId がなければ書く
 * - 利用者: まだ家族に入っていないときだけ familyId と役割 admin を書く（同時の二重の作成を 1 つに絞る。BR1.8）
 * - 結果の記録: 同じ印の記録がなければ書く（BR2.8）
 * 条件が外れたときは 'conflict'。ほかの失敗は投げ直す（思いがけない失敗）。
 */
export async function createWithAdmin(
  family: Family,
  record: Pick<RequestRecord, 'userId' | 'idempotencyKey' | 'operation' | 'result'>,
  now: Date = new Date(),
): Promise<CreateWithAdminResult> {
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tables.families(),
              Item: family,
              ConditionExpression: 'attribute_not_exists(familyId)',
            },
          },
          {
            Update: {
              TableName: tables.users(),
              Key: { userId: family.adminUserId },
              UpdateExpression: 'SET familyId = :familyId, #role = :role',
              ConditionExpression: 'attribute_exists(userId) AND attribute_not_exists(familyId)',
              ExpressionAttributeNames: { '#role': 'role' },
              ExpressionAttributeValues: { ':familyId': family.familyId, ':role': 'admin' },
            },
          },
          requestRecordRepository.buildPutItem(record, now),
        ],
      }),
    );
    return 'created';
  } catch (err) {
    const conditionFailed =
      err instanceof TransactionCanceledException &&
      (err.CancellationReasons ?? []).some((reason) => reason.Code === 'ConditionalCheckFailed');
    if (conditionFailed) return 'conflict';
    throw err;
  }
}
