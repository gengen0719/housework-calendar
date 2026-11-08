import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

export type Item = Record<string, unknown>;
export type Table = Map<string, Item>;

export const USERS_TABLE = 'Users-test';
export const EVENTS_TABLE = 'ProcessedLineEvents-test';
export const FAMILIES_TABLE = 'Families-test';
export const REQUEST_RECORDS_TABLE = 'RequestRecords-test';

/** 表ごとの主キーの名前（並び順どおりに「#」でつないでメモリ上の鍵にする）。 */
const KEY_NAMES: Record<string, string[]> = {
  [USERS_TABLE]: ['userId'],
  [EVENTS_TABLE]: ['webhookEventId'],
  [FAMILIES_TABLE]: ['familyId'],
  [REQUEST_RECORDS_TABLE]: ['userId', 'idempotencyKey'],
};

function conditionFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
  });
}

/** attribute_exists(x) / attribute_not_exists(x) を AND でつないだ条件だけを確かめる。 */
function conditionHolds(existing: Item | undefined, expression: string | undefined): boolean {
  if (!expression) return true;
  return expression.split(/\s+AND\s+/).every((part) => {
    const match = /^(attribute_exists|attribute_not_exists)\((\w+)\)$/.exec(part.trim());
    if (!match) throw new Error(`fakeDynamo が知らない条件: ${part}`);
    const present = existing !== undefined && existing[match[2] as string] !== undefined;
    return match[1] === 'attribute_exists' ? present : !present;
  });
}

/** DynamoDB の文書クライアントを、メモリ上の表に差し替える（aws-sdk-client-mock）。 */
export function installFakeDynamo() {
  const mock = mockClient(DynamoDBDocumentClient);
  const tables: Record<string, Table> = {
    [USERS_TABLE]: new Map(),
    [EVENTS_TABLE]: new Map(),
    [FAMILIES_TABLE]: new Map(),
    [REQUEST_RECORDS_TABLE]: new Map(),
  };
  const table = (name: string | undefined): Table => {
    const found = name ? tables[name] : undefined;
    if (!found) throw new Error(`知らないテーブル: ${name}`);
    return found;
  };
  /** 項目または Key から、メモリ上の鍵を作る。 */
  const keyOf = (name: string | undefined, source: Record<string, unknown>): string =>
    (KEY_NAMES[name ?? ''] ?? []).map((k) => String(source[k])).join('#');

  function applyUpdate(
    name: string | undefined,
    key: Record<string, unknown>,
    input: {
      UpdateExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    },
  ): void {
    const t = table(name);
    const memoryKey = keyOf(name, key);
    const target: Item = t.get(memoryKey) ?? { ...key };
    const names = input.ExpressionAttributeNames ?? {};
    const values = input.ExpressionAttributeValues ?? {};
    const assignments = String(input.UpdateExpression)
      .replace(/^SET\s+/, '')
      .split(',')
      .map((part) => part.trim().split(/\s*=\s*/) as [string, string]);
    for (const [rawName, valueRef] of assignments) {
      target[names[rawName] ?? rawName] = values[valueRef];
    }
    t.set(memoryKey, target);
  }

  mock.on(PutCommand).callsFake((input) => {
    const t = table(input.TableName);
    const key = keyOf(input.TableName, input.Item);
    const existing = t.get(key);
    const condition: string | undefined = input.ConditionExpression;
    if (condition?.includes('attribute_not_exists(webhookEventId)')) {
      const values = input.ExpressionAttributeValues ?? {};
      const retryable =
        existing !== undefined &&
        existing.status === values[':processing'] &&
        String(existing.receivedAt) < String(values[':staleBefore']);
      if (existing && !retryable) throw conditionFailed();
    } else if (condition?.includes('attribute_not_exists(')) {
      if (existing) throw conditionFailed();
    }
    t.set(key, { ...input.Item });
    return {};
  });

  mock.on(GetCommand).callsFake((input) => {
    const t = table(input.TableName);
    const item = t.get(keyOf(input.TableName, input.Key));
    return { Item: item ? { ...item } : undefined };
  });

  mock.on(DeleteCommand).callsFake((input) => {
    table(input.TableName).delete(keyOf(input.TableName, input.Key));
    return {};
  });

  mock.on(UpdateCommand).callsFake((input) => {
    const t = table(input.TableName);
    const existing = t.get(keyOf(input.TableName, input.Key));
    if (input.ConditionExpression?.includes('attribute_exists(') && !existing)
      throw conditionFailed();
    applyUpdate(input.TableName, input.Key, input);
    return {};
  });

  /** TransactWriteItems: すべての条件を先に確かめ、1 つでも外れたら何も書かない。 */
  mock.on(TransactWriteCommand).callsFake((input) => {
    const items: Array<{
      Put?: { TableName: string; Item: Item; ConditionExpression?: string };
      Update?: {
        TableName: string;
        Key: Item;
        ConditionExpression?: string;
        UpdateExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
    }> = input.TransactItems ?? [];
    const reasons = items.map((entry) => {
      const op = entry.Put ?? entry.Update;
      if (!op) throw new Error('fakeDynamo が知らない取引の項目');
      const source = entry.Put ? entry.Put.Item : (entry.Update?.Key as Item);
      const existing = table(op.TableName).get(keyOf(op.TableName, source));
      return conditionHolds(existing, op.ConditionExpression)
        ? { Code: 'None' }
        : { Code: 'ConditionalCheckFailed' };
    });
    if (reasons.some((r) => r.Code !== 'None')) {
      throw new TransactionCanceledException({
        message: 'Transaction cancelled, please refer cancellation reasons for specific reasons',
        $metadata: {},
        CancellationReasons: reasons,
      });
    }
    for (const entry of items) {
      if (entry.Put) {
        table(entry.Put.TableName).set(keyOf(entry.Put.TableName, entry.Put.Item), {
          ...entry.Put.Item,
        });
      } else if (entry.Update) {
        applyUpdate(entry.Update.TableName, entry.Update.Key, entry.Update);
      }
    }
    return {};
  });

  mock.on(QueryCommand).callsFake((input) => {
    const t = table(input.TableName);
    const values: Record<string, unknown> = input.ExpressionAttributeValues ?? {};
    const lineUserId = values[':lineUserId'];
    const items = [...t.values()]
      .filter((item) => item.lineUserId === lineUserId)
      .map((item) => ({ ...item }));
    return { Items: items };
  });

  return {
    mock,
    users: tables[USERS_TABLE] as Table,
    events: tables[EVENTS_TABLE] as Table,
    families: tables[FAMILIES_TABLE] as Table,
    requestRecords: tables[REQUEST_RECORDS_TABLE] as Table,
  };
}
