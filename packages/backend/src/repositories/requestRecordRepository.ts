import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { RequestRecord } from '../models';

/** 結果を残す期間（TTL。24 時間。BR2.8） */
export const RETENTION_SECONDS = 24 * 60 * 60;

const toEpochSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

/** 送り直しの記録を書く条件: まだない、または期限が過ぎている（上書きしてよい）。 */
export const REQUEST_RECORD_PUT_CONDITION =
  'attribute_not_exists(idempotencyKey) OR expiresAt <= :now';

/**
 * 同じ利用者の同じ印の記録を探す。TTL の削除は遅れることがあるので、期限が過ぎたものは「ない」ものとして扱う。
 */
export async function find(
  userId: string,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<RequestRecord | undefined> {
  // 強い整合性で読む。同時の要求で負けた側が、勝った側の記録をすぐ読めるようにする
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.requestRecords(),
      Key: { userId, idempotencyKey },
      ConsistentRead: true,
    }),
  );
  const record = result.Item as RequestRecord | undefined;
  if (!record || record.expiresAt <= toEpochSeconds(now)) return undefined;
  return record;
}

/**
 * 前の記録と同じ操作・対象か（BR3.5）。違えば、前の結果を返さず 422 IDEMPOTENCY_KEY_REUSED にする。
 * target のない操作（createFamily）は、target なし同士を同じとみなす。
 */
export function isSameRequest(
  record: RequestRecord,
  operation: RequestRecord['operation'],
  target?: string,
): boolean {
  return record.operation === operation && (record.target ?? '') === (target ?? '');
}

/**
 * 結果の記録を、取引（TransactWriteItems）の 1 項目として書くための Put。
 * 同じ組がすでにあれば条件で失敗するので、同じ印の同時の要求は 1 つだけが通る（BR2.8）。
 */
export function buildPutItem(
  input: Pick<RequestRecord, 'userId' | 'idempotencyKey' | 'operation' | 'result'> &
    Partial<Pick<RequestRecord, 'target'>>,
  now: Date = new Date(),
) {
  const record: RequestRecord = {
    ...input,
    expiresAt: toEpochSeconds(now) + RETENTION_SECONDS,
  };
  return {
    Put: {
      TableName: tables.requestRecords(),
      Item: record,
      // 期限が過ぎたのに TTL がまだ消していない記録は、find が「ない」と扱うので、ここでも上書きできるようにする
      ConditionExpression: REQUEST_RECORD_PUT_CONDITION,
      ExpressionAttributeValues: { ':now': toEpochSeconds(now) },
    },
  };
}
