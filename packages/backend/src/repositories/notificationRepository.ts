import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { NotificationTrigger } from '@housework/shared';
import { jstDateOf } from '@housework/shared';
import type { NotificationDispatch, NotificationPayload } from '../models';
import { docClient } from '../lib/dynamoClient';
import { requireEnv } from '../lib/config';

export const dispatchTable = () => requireEnv('NOTIFICATION_DISPATCHES_TABLE');
export const payloadTable = () => requireEnv('NOTIFICATION_PAYLOADS_TABLE');
export const dispatchKey = (familyId: string, trigger: NotificationTrigger) => ({
  pk: `F#${familyId}`,
  sk: `${trigger.kind}#${trigger.targetDate}`,
});
export const runKey = (trigger: NotificationTrigger) => ({
  pk: `RUN#${trigger.kind}#${trigger.targetDate}`,
  sk: 'META',
});
export const terminal = (state: NotificationDispatch['state']) =>
  ['sent', 'skipped', 'failed', 'expired'].includes(state);
export function conditionalFailure(error: unknown): boolean {
  const e = error as { name?: string; CancellationReasons?: { Code?: string }[] };
  return (
    e?.name === 'ConditionalCheckFailedException' ||
    (e?.name === 'TransactionCanceledException' &&
      !!e.CancellationReasons?.some((r) => r.Code === 'ConditionalCheckFailed') &&
      e.CancellationReasons.every((r) => r.Code === 'None' || r.Code === 'ConditionalCheckFailed'))
  );
}
const timeout = () => ({ abortSignal: AbortSignal.timeout(2000) });
function item(record: NotificationDispatch) {
  return {
    ...record,
    ...dispatchKey(record.familyId, record),
    ttl: Math.floor(record.scheduledAt / 1000) + 35 * 86400,
  };
}
function expiryPointer(key: { pk: string; sk: string }, ttl: number) {
  return {
    Put: {
      TableName: dispatchTable(),
      Item: {
        pk: `EXPIRY#${jstDateOf(new Date(ttl * 1000))}`,
        sk: JSON.stringify([key.pk, key.sk]),
        targetPk: key.pk,
        targetSk: key.sk,
        ttl: ttl + 7 * 86400,
      },
    },
  };
}
export async function getDispatch(
  familyId: string,
  trigger: NotificationTrigger,
): Promise<NotificationDispatch | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: dispatchTable(),
      Key: dispatchKey(familyId, trigger),
      ConsistentRead: true,
    }),
    timeout(),
  );
  return result.Item as NotificationDispatch | undefined;
}
export async function createDispatch(
  record: NotificationDispatch,
  payload?: NotificationPayload,
): Promise<boolean> {
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    {
      Put: {
        TableName: dispatchTable(),
        Item: item(record),
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    },
  ];
  if (payload)
    items.push({
      Put: {
        TableName: payloadTable(),
        Item: payload,
        ConditionExpression: 'attribute_not_exists(scheduledDate)',
      },
    });
  items.push(
    expiryPointer(
      dispatchKey(record.familyId, record),
      Math.floor(record.scheduledAt / 1000) + 35 * 86400,
    ),
  );
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }), timeout());
    return true;
  } catch (e) {
    if (conditionalFailure(e)) return false;
    throw e;
  }
}
/** 版・状態・所有者をすべて照合し、終端と本文削除も原子的に行う。 */
export async function replaceDispatch(
  before: NotificationDispatch,
  after: NotificationDispatch,
): Promise<NotificationDispatch | undefined> {
  if (terminal(before.state)) return undefined;
  const next = { ...after, version: before.version + 1 };
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    {
      Put: {
        TableName: dispatchTable(),
        Item: item(next),
        ConditionExpression: `version = :version AND #state = :state AND ${before.leaseOwner ? 'leaseOwner = :owner' : 'attribute_not_exists(leaseOwner)'}`,
        ExpressionAttributeNames: { '#state': 'state' },
        ExpressionAttributeValues: {
          ':version': before.version,
          ':state': before.state,
          ...(before.leaseOwner ? { ':owner': before.leaseOwner } : {}),
        },
      },
    },
  ];
  if (terminal(next.state))
    items.push({
      Delete: {
        TableName: payloadTable(),
        Key: { scheduledDate: before.targetDate, dispatchKey: before.retryKey },
      },
    });
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }), timeout());
    return next;
  } catch (e) {
    if (conditionalFailure(e)) return undefined;
    throw e;
  }
}
export interface NotificationRun {
  expected: number;
  completed: number;
  enumerationDone: boolean;
  ttl: number;
}
export async function beginRun(trigger: NotificationTrigger, scheduledAt: number): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: dispatchTable(),
        Item: {
          ...runKey(trigger),
          expected: 0,
          completed: 0,
          enumerationDone: false,
          ttl: Math.floor(scheduledAt / 1000) + 35 * 86400,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
      timeout(),
    );
  } catch (e) {
    if (!conditionalFailure(e)) throw e;
  }
}
export async function getRun(trigger: NotificationTrigger): Promise<NotificationRun | undefined> {
  const r = await docClient.send(
    new GetCommand({ TableName: dispatchTable(), Key: runKey(trigger), ConsistentRead: true }),
    timeout(),
  );
  return r.Item as NotificationRun | undefined;
}
export async function registerRunFamily(
  trigger: NotificationTrigger,
  familyId: string,
  ttl: number,
): Promise<void> {
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: dispatchTable(),
              Item: { pk: runKey(trigger).pk, sk: `JOB#${familyId}`, terminal: false, ttl },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Update: {
              TableName: dispatchTable(),
              Key: runKey(trigger),
              UpdateExpression: 'ADD expected :one',
              ExpressionAttributeValues: { ':one': 1 },
            },
          },
        ],
      }),
      timeout(),
    );
  } catch (e) {
    if (!conditionalFailure(e)) throw e;
  }
}
export async function finishRunEnumeration(trigger: NotificationTrigger): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: dispatchTable(),
      Key: runKey(trigger),
      UpdateExpression: 'SET enumerationDone = :yes',
      ExpressionAttributeValues: { ':yes': true },
    }),
    timeout(),
  );
}
export async function completeRunFamily(
  trigger: NotificationTrigger,
  familyId: string,
): Promise<void> {
  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: dispatchTable(),
              Key: { pk: runKey(trigger).pk, sk: `JOB#${familyId}` },
              ConditionExpression: '#terminal = :no',
              UpdateExpression: 'SET #terminal = :yes',
              ExpressionAttributeNames: { '#terminal': 'terminal' },
              ExpressionAttributeValues: { ':no': false, ':yes': true },
            },
          },
          {
            Update: {
              TableName: dispatchTable(),
              Key: runKey(trigger),
              UpdateExpression: 'ADD completed :one',
              ExpressionAttributeValues: { ':one': 1 },
            },
          },
        ],
      }),
      timeout(),
    );
  } catch (e) {
    if (!conditionalFailure(e)) throw e;
  }
}
export async function listMetadataPartition(pk: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let last: Record<string, unknown> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: dispatchTable(),
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ExclusiveStartKey: last,
        ConsistentRead: true,
      }),
      timeout(),
    );
    items.push(...(r.Items ?? []));
    last = r.LastEvaluatedKey;
  } while (last);
  return items;
}
