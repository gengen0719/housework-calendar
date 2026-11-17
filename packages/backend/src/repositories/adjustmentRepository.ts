import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { AdjustmentRecord } from '../models';
import { buildPutItem } from './requestRecordRepository';

type Items = NonNullable<TransactWriteCommandInput['TransactItems']>;
export const adjustmentKey = (month: string, id: string) => `M#${month}#J#${id}`;
export function buildCreateItems(
  record: AdjustmentRecord,
  request: Parameters<typeof buildPutItem>[0],
  guards: Items,
  now: Date,
): Items {
  return [
    {
      Put: {
        TableName: tables.adjustments(),
        Item: { ...record, sk: adjustmentKey(record.month, record.adjustmentId) },
        ConditionExpression: 'attribute_not_exists(sk)',
      },
    },
    {
      Put: {
        TableName: tables.adjustments(),
        Item: {
          familyId: record.familyId,
          sk: `JID#${record.adjustmentId}`,
          month: record.month,
          adjustmentId: record.adjustmentId,
        },
        ConditionExpression: 'attribute_not_exists(sk)',
      },
    },
    buildPutItem(request, now),
    ...guards,
  ];
}
export async function transact(items: Items, timeoutMs = 2000): Promise<boolean> {
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }), {
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch (error) {
    if (
      error instanceof TransactionCanceledException &&
      error.CancellationReasons?.some(
        (r) => r.Code === 'ConditionalCheckFailed' || r.Code === 'TransactionConflict',
      ) &&
      error.CancellationReasons.every(
        (r) =>
          !r.Code || ['None', 'ConditionalCheckFailed', 'TransactionConflict'].includes(r.Code),
      )
    )
      return false;
    throw error;
  }
}
export async function listByMonth(familyId: string, month: string): Promise<AdjustmentRecord[]> {
  const records: AdjustmentRecord[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tables.adjustments(),
        KeyConditionExpression: 'familyId = :f AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':f': familyId, ':p': `M#${month}#J#` },
        ConsistentRead: true,
        ...(key ? { ExclusiveStartKey: key } : {}),
      }),
      { abortSignal: AbortSignal.timeout(2000) },
    );
    records.push(...((page.Items ?? []) as AdjustmentRecord[]));
    key = page.LastEvaluatedKey;
  } while (key);
  return records.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.adjustmentId.localeCompare(b.adjustmentId),
  );
}
export async function findById(
  familyId: string,
  id: string,
): Promise<AdjustmentRecord | undefined> {
  const index = await docClient.send(
    new GetCommand({
      TableName: tables.adjustments(),
      Key: { familyId, sk: `JID#${id}` },
      ConsistentRead: true,
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
  if (!index.Item) return undefined;
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.adjustments(),
      Key: { familyId, sk: adjustmentKey(String(index.Item.month), id) },
      ConsistentRead: true,
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
  return result.Item as AdjustmentRecord | undefined;
}

export function buildDeleteItems(record: AdjustmentRecord, guards: Items): Items {
  return [
    {
      Delete: {
        TableName: tables.adjustments(),
        Key: { familyId: record.familyId, sk: adjustmentKey(record.month, record.adjustmentId) },
        ConditionExpression: '#id = :id',
        ExpressionAttributeNames: { '#id': 'adjustmentId' },
        ExpressionAttributeValues: { ':id': record.adjustmentId },
      },
    },
    {
      Delete: {
        TableName: tables.adjustments(),
        Key: { familyId: record.familyId, sk: `JID#${record.adjustmentId}` },
        ConditionExpression: '#id = :id',
        ExpressionAttributeNames: { '#id': 'adjustmentId' },
        ExpressionAttributeValues: { ':id': record.adjustmentId },
      },
    },
    ...guards,
  ];
}
