import { DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/dynamoClient';
import type { NotificationPayload } from '../models';
import { payloadTable } from './notificationRepository';
export async function getPayload(
  scheduledDate: string,
  dispatchKey: string,
  now: number,
): Promise<NotificationPayload | undefined> {
  const r = await docClient.send(
    new GetCommand({
      TableName: payloadTable(),
      Key: { scheduledDate, dispatchKey },
      ConsistentRead: true,
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
  const p = r.Item as NotificationPayload | undefined;
  return p && now < p.scheduledAt + 24 * 3600000 ? p : undefined;
}
export async function listPayloads(scheduledDate: string): Promise<NotificationPayload[]> {
  const items: NotificationPayload[] = [];
  let last: Record<string, unknown> | undefined;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: payloadTable(),
        KeyConditionExpression: 'scheduledDate = :date',
        ExpressionAttributeValues: { ':date': scheduledDate },
        ExclusiveStartKey: last,
        ConsistentRead: true,
      }),
      { abortSignal: AbortSignal.timeout(2000) },
    );
    items.push(...((r.Items ?? []) as NotificationPayload[]));
    last = r.LastEvaluatedKey;
  } while (last);
  return items;
}
export async function deletePayload(scheduledDate: string, dispatchKey: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: payloadTable(), Key: { scheduledDate, dispatchKey } }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
}
