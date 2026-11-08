import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';

/** 「処理中」のまま、やり直してよいとするまでの時間（Lambda の時間切れ 30 秒より長い。BR2.7） */
export const STALE_AFTER_MS = 2 * 60_000;
/** 記録を残す期間（TTL。7 日） */
export const RETENTION_SECONDS = 7 * 24 * 60 * 60;

export type BeginResult = 'acquired' | 'duplicate';

const toEpochSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

/**
 * イベントを「処理中」として、まだ記録がないとき、または前の処理が止まったときだけ書く（BR2.7）。
 * すでに処理済み、または処理中で 2 分たっていなければ 'duplicate'。
 */
export async function begin(webhookEventId: string, now: Date = new Date()): Promise<BeginResult> {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  try {
    await docClient.send(
      new PutCommand({
        TableName: tables.processedLineEvents(),
        Item: {
          webhookEventId,
          status: 'processing',
          receivedAt: now.toISOString(),
          expiresAt: toEpochSeconds(now) + RETENTION_SECONDS,
        },
        ConditionExpression:
          'attribute_not_exists(webhookEventId) OR (#status = :processing AND receivedAt < :staleBefore)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':processing': 'processing', ':staleBefore': staleBefore },
      }),
    );
    return 'acquired';
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return 'duplicate';
    throw err;
  }
}

export async function markDone(webhookEventId: string, now: Date = new Date()): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tables.processedLineEvents(),
      Key: { webhookEventId },
      UpdateExpression: 'SET #status = :done, expiresAt = :expiresAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':done': 'done',
        ':expiresAt': toEpochSeconds(now) + RETENTION_SECONDS,
      },
    }),
  );
}

/** 思いがけない失敗のとき、LINE の送り直しで処理し直せるよう記録を消す。 */
export async function release(webhookEventId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({ TableName: tables.processedLineEvents(), Key: { webhookEventId } }),
  );
}
