import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

export type Item = Record<string, unknown>;
export type Table = Map<string, Item>;

export interface ReadLogEntry {
  operation: 'Get' | 'Query' | 'Scan';
  table: string;
  consistent: boolean;
}

export interface FakeDynamoHooks {
  /** 競合の再現: 次の TransactWriteItems を評価する直前に 1 回だけ呼ぶ（「読んだあとに別の書き込みが先に入った」状態を作る） */
  beforeNextTransaction?: () => void;
  /** 競合の再現: 次の UpdateItem を評価する直前に 1 回だけ呼ぶ */
  beforeNextUpdate?: () => void;
  queryPageSize?: number;
  /** 遅い読み取りの再現（U8）: Calendar・ChoreTypes の Get・Query をこのミリ秒だけ遅らせる */
  readDelayMs?: number;
  /** 遅い読み取りの再現（U9）: readDelayMs を、Calendar・ChoreTypes に加えてここに並べた表にも当てる */
  readDelayExtraTables?: string[];
  /** 読み取りの失敗の差し込み（U9）: 表と操作（Get／Query）を指定すると、その読み取りが投げる */
  failRead(table: string, operation: 'Get' | 'Query'): void;
  beforeTransaction(n: number, fn: () => void): void;
  failTransaction(n: number, code: string): void;
  transactionSizes: number[];
  readLog: ReadLogEntry[];
  /** 読み取りの対象の記録（U8）。`Get <表> <sk>`、`Query <表> <sk の前置き>`。申し出の項目 `SWAP#` を読んだ回数の確認用 */
  readTargets: string[];
  /**
   * 見張り（U8）: 使ってはいけない呼び出しの記録。
   * 申し出の項目（sk が `SWAP#` で始まる）への PutItem・DeleteItem、BatchGet、BatchWrite が呼ばれたら
   * 書き込まず、ここに残して失敗させる。空のままなら呼ばれていない。
   */
  forbiddenCalls: string[];
}

export const USERS_TABLE = 'Users-test';
export const EVENTS_TABLE = 'ProcessedLineEvents-test';
export const FAMILIES_TABLE = 'Families-test';
export const REQUEST_RECORDS_TABLE = 'RequestRecords-test';
export const INVITATIONS_TABLE = 'Invitations-test';
export const NOTIFICATION_GROUPS_TABLE = 'NotificationGroups-test';
export const CHORE_TYPES_TABLE = 'ChoreTypes-test';
export const CALENDAR_TABLE = 'Calendar-test';

/** 表ごとの主キーの名前（並び順どおりに「#」でつないでメモリ上の鍵にする）。 */
const KEY_NAMES: Record<string, string[]> = {
  [USERS_TABLE]: ['userId'],
  [EVENTS_TABLE]: ['webhookEventId'],
  [FAMILIES_TABLE]: ['familyId'],
  [REQUEST_RECORDS_TABLE]: ['userId', 'idempotencyKey'],
  [INVITATIONS_TABLE]: ['token'],
  [NOTIFICATION_GROUPS_TABLE]: ['groupId'],
  [CHORE_TYPES_TABLE]: ['familyId', 'sk'],
  [CALENDAR_TABLE]: ['familyId', 'sk'],
};

/** 条件式・Query を本当に評価する表（U4 の ChoreTypes、U5 の Calendar） */
const EVALUATED_TABLES: string[] = [CHORE_TYPES_TABLE, CALENDAR_TABLE];
const isEvaluated = (name: string | undefined): boolean =>
  name !== undefined && EVALUATED_TABLES.includes(name);

/** `familyId-index` の射影（INCLUDE: displayName、role、familyJoinedAt。キーの userId と familyId は常に入る） */
const FAMILY_INDEX_ATTRIBUTES = ['userId', 'familyId', 'displayName', 'role', 'familyJoinedAt'];

function conditionFailed(): ConditionalCheckFailedException {
  return new ConditionalCheckFailedException({
    message: 'The conditional request failed',
    $metadata: {},
  });
}

interface ExpressionContext {
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

/**
 * 条件式（AND、OR、括弧）を確かめる。使える部品:
 * attribute_exists(x) / attribute_not_exists(x) / `x = :v`・`<>`・`>`・`<`・`>=`・`<=`（x は #名前も可）。
 */
function conditionHolds(
  existing: Item | undefined,
  expression: string | undefined,
  context: ExpressionContext = {},
): boolean {
  if (!expression) return true;
  const names = context.names ?? {};
  const values = context.values ?? {};
  const attr = (raw: string): string => names[raw] ?? raw;
  const evaluate = (source: string): boolean => {
    const orParts = splitTopLevel(source, 'OR');
    if (orParts.length > 1) return orParts.some(evaluate);
    const andParts = splitTopLevel(source, 'AND');
    if (andParts.length > 1) return andParts.every(evaluate);
    const part = source.trim();
    if (part.startsWith('(') && part.endsWith(')') && isWrapped(part)) {
      return evaluate(part.slice(1, -1));
    }
    return evaluateLeaf(part);
  };
  const evaluateLeaf = (part: string): boolean => {
    const fn = /^(attribute_exists|attribute_not_exists)\(([#\w]+)\)$/.exec(part);
    if (fn) {
      const present = existing !== undefined && existing[attr(fn[2] as string)] !== undefined;
      return fn[1] === 'attribute_exists' ? present : !present;
    }
    const contains = /^contains\(([#\w]+),\s*(:\w+)\)$/.exec(part);
    if (contains) {
      const target = existing?.[attr(contains[1] as string)];
      const wanted = values[contains[2] as string];
      if (target instanceof Set) return target.has(wanted);
      if (Array.isArray(target)) return target.includes(wanted);
      if (typeof target === 'string') return target.includes(String(wanted));
      return false;
    }
    const beginsWith = /^begins_with\(([#\w]+),\s*(:\w+)\)$/.exec(part);
    if (beginsWith) {
      const target = existing?.[attr(beginsWith[1] as string)];
      return (
        typeof target === 'string' && target.startsWith(String(values[beginsWith[2] as string]))
      );
    }
    const cmp = /^([#\w]+)\s*(=|<>|>=|<=|>|<)\s*(:\w+)$/.exec(part);
    if (cmp) {
      const left = existing?.[attr(cmp[1] as string)];
      const right = values[cmp[3] as string];
      if (left === undefined) return false;
      // 数どうしは数として、そのほかは文字として比べる
      const order = (): number => {
        if (typeof left === 'number' && typeof right === 'number') return left - right;
        const a = String(left);
        const b = String(right);
        return a < b ? -1 : a > b ? 1 : 0;
      };
      switch (cmp[2]) {
        case '=':
          return left === right;
        case '<>':
          return left !== right;
        case '>':
          return order() > 0;
        case '<':
          return order() < 0;
        case '>=':
          return order() >= 0;
        default:
          return order() <= 0;
      }
    }
    throw new Error(`fakeDynamo が知らない条件: ${part}`);
  };
  return evaluate(expression);
}

/** 括弧の外にある AND / OR で式を分ける。 */
function splitTopLevel(source: string, word: 'AND' | 'OR'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const marker = ` ${word} `;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && source.startsWith(marker, i)) {
      parts.push(source.slice(start, i));
      start = i + marker.length;
      i += marker.length - 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}

/** 先頭の「(」と末尾の「)」が対になっているか。 */
function isWrapped(part: string): boolean {
  let depth = 0;
  for (let i = 0; i < part.length; i++) {
    if (part[i] === '(') depth++;
    else if (part[i] === ')') depth--;
    if (depth === 0 && i < part.length - 1) return false;
  }
  return depth === 0;
}

/** DynamoDB の文書クライアントを、メモリ上の表に差し替える（aws-sdk-client-mock）。 */
export function installFakeDynamo() {
  const mock = mockClient(DynamoDBDocumentClient);
  const tables: Record<string, Table> = {
    [USERS_TABLE]: new Map(),
    [EVENTS_TABLE]: new Map(),
    [FAMILIES_TABLE]: new Map(),
    [REQUEST_RECORDS_TABLE]: new Map(),
    [INVITATIONS_TABLE]: new Map(),
    [NOTIFICATION_GROUPS_TABLE]: new Map(),
    [CHORE_TYPES_TABLE]: new Map(),
    [CALENDAR_TABLE]: new Map(),
  };
  /** 結果整合の再現: 索引（familyId-index）の Query の結果から隠す利用者 */
  const hiddenFromFamilyIndex = new Set<string>();
  /** 競合の再現: 次の TransactWriteItems を評価する直前に 1 回だけ呼ぶ（「読んだあとに別の書き込みが先に入った」状態を作る） */
  const beforeTransactionByCount = new Map<number, () => void>();
  const failTransactionByCount = new Map<number, string>();
  const failingReads = new Set<string>();
  const hooks: FakeDynamoHooks = {
    queryPageSize: undefined,
    failRead(tableName: string, operation: 'Get' | 'Query'): void {
      failingReads.add(`${operation} ${tableName}`);
    },
    /** n 回目（1 から数える）のトランザクションを評価する直前に、別の書き込みを入れる（U5） */
    beforeTransaction(n: number, fn: () => void): void {
      beforeTransactionByCount.set(n, fn);
    },
    /** n 回目のトランザクションを、指定の Code（TransactionConflict、ThrottlingError など）で断る（U5） */
    failTransaction(n: number, code: string): void {
      failTransactionByCount.set(n, code);
    },
    /** これまでのトランザクションの回数と、各回の項目数 */
    transactionSizes: [],
    /** 読み取り（Get、Query、Scan）の記録。強い整合性で読んだかを残す（U5。NFR1.20〜NFR1.22） */
    readLog: [],
    readTargets: [],
    forbiddenCalls: [],
  };

  /** 遅い読み取りの再現（U8）。readDelayMs が無ければ、そのまま同期で返す（既存の動きを変えない） */
  const delayed = <T>(tableName: string | undefined, result: T): T | Promise<T> => {
    const ms = hooks.readDelayMs;
    const slow =
      ms !== undefined &&
      (tableName === CALENDAR_TABLE ||
        tableName === CHORE_TYPES_TABLE ||
        (tableName !== undefined && hooks.readDelayExtraTables?.includes(tableName) === true));
    return slow ? new Promise<T>((resolve) => setTimeout(() => resolve(result), ms)) : result;
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
    // 「SET a = :a, b = :b」「REMOVE c, d」「SET a = :a REMOVE c」の形を読む
    const [setPart = '', removePart] = String(input.UpdateExpression).split(/\s+REMOVE\s+/);
    const assignments = (/^\s*REMOVE\s/.test(setPart) ? '' : setPart.replace(/^\s*SET\s+/, ''))
      .split(',')
      .filter((part) => part.trim() !== '')
      .map((part) => part.trim().split(/\s*=\s*/) as [string, string]);
    for (const [rawName, valueRef] of assignments) {
      const attributeName = names[rawName] ?? rawName;
      // `SET #version = #version + :one` の形（足し算）
      const sum = /^([#\w]+)\s*\+\s*(:\w+)$/.exec(valueRef);
      if (sum) {
        const base = target[names[sum[1] as string] ?? (sum[1] as string)];
        target[attributeName] = Number(base ?? 0) + Number(values[sum[2] as string]);
      } else {
        target[attributeName] = values[valueRef];
      }
    }
    const removals = /^\s*REMOVE\s+/.test(setPart)
      ? setPart.replace(/^\s*REMOVE\s+/, '')
      : (removePart ?? '');
    for (const rawName of removals.split(',').map((part) => part.trim())) {
      if (rawName !== '') delete target[names[rawName] ?? rawName];
    }
    t.set(memoryKey, target);
  }

  mock.on(PutCommand).callsFake((input) => {
    if (String(input.Item?.sk ?? '').startsWith('SWAP#')) {
      hooks.forbiddenCalls.push(`PutItem ${String(input.TableName)} ${String(input.Item?.sk)}`);
      throw new Error('申し出の項目への PutItem は使えません');
    }
    const t = table(input.TableName);
    const key = keyOf(input.TableName, input.Item);
    const existing = t.get(key);
    const condition: string | undefined = input.ConditionExpression;
    if (input.TableName === CALENDAR_TABLE) {
      // Calendar（U5）は条件式を本当に評価する
      if (
        !conditionHolds(existing, condition, {
          names: input.ExpressionAttributeNames,
          values: input.ExpressionAttributeValues,
        })
      )
        throw conditionFailed();
    } else if (condition?.includes('attribute_not_exists(webhookEventId)')) {
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
    if (failingReads.has(`Get ${String(input.TableName)}`)) {
      throw new Error(`読み取りの失敗（差し込み）: Get ${String(input.TableName)}`);
    }
    hooks.readLog.push({
      operation: 'Get',
      table: String(input.TableName),
      consistent: input.ConsistentRead === true,
    });
    hooks.readTargets.push(`Get ${String(input.TableName)} ${String(input.Key?.sk)}`);
    const item = t.get(keyOf(input.TableName, input.Key));
    return delayed(input.TableName, { Item: item ? { ...item } : undefined });
  });

  mock.on(DeleteCommand).callsFake((input) => {
    if (String(input.Key?.sk ?? '').startsWith('SWAP#')) {
      hooks.forbiddenCalls.push(`DeleteItem ${String(input.TableName)} ${String(input.Key?.sk)}`);
      throw new Error('申し出の項目への DeleteItem は使えません');
    }
    if (isEvaluated(input.TableName)) {
      // ChoreTypes（U4）と Calendar（U5）は条件式を本当に評価する
      const existing = table(input.TableName).get(keyOf(input.TableName, input.Key));
      if (
        !conditionHolds(existing, input.ConditionExpression, {
          names: input.ExpressionAttributeNames,
          values: input.ExpressionAttributeValues,
        })
      )
        throw conditionFailed();
    }
    table(input.TableName).delete(keyOf(input.TableName, input.Key));
    return {};
  });

  mock.on(UpdateCommand).callsFake((input) => {
    const hook = hooks.beforeNextUpdate;
    if (hook) {
      hooks.beforeNextUpdate = undefined;
      hook();
    }
    const t = table(input.TableName);
    const existing = t.get(keyOf(input.TableName, input.Key));
    if (isEvaluated(input.TableName)) {
      // ChoreTypes（U4）と Calendar（U5）は条件式を本当に評価する（attribute_exists、name = :oldName、active = :false など）
      if (
        !conditionHolds(existing, input.ConditionExpression, {
          names: input.ExpressionAttributeNames,
          values: input.ExpressionAttributeValues,
        })
      )
        throw conditionFailed();
    } else if (input.ConditionExpression?.includes('attribute_exists(') && !existing) {
      throw conditionFailed();
    }
    applyUpdate(input.TableName, input.Key, input);
    if (input.ReturnValues === 'ALL_NEW') {
      return { Attributes: { ...t.get(keyOf(input.TableName, input.Key)) } };
    }
    return {};
  });

  interface TransactItem {
    Put?: {
      TableName: string;
      Item: Item;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    Update?: {
      TableName: string;
      Key: Item;
      ConditionExpression?: string;
      UpdateExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    Delete?: {
      TableName: string;
      Key: Item;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
    ConditionCheck?: {
      TableName: string;
      Key: Item;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
  }

  /** TransactWriteItems: すべての条件を先に確かめ、1 つでも外れたら何も書かない。 */
  mock.on(TransactWriteCommand).callsFake((input) => {
    const items: TransactItem[] = input.TransactItems ?? [];
    // 1 回の取引は 100 項目まで、同じ項目への操作は 1 つまで（本物の DynamoDB と同じ）
    if (items.length > 100) {
      throw Object.assign(new Error('Member must have length less than or equal to 100'), {
        name: 'ValidationException',
      });
    }
    const seen = new Set<string>();
    for (const entry of items) {
      const op = entry.Put ?? entry.Update ?? entry.Delete ?? entry.ConditionCheck;
      if (!op) continue;
      const source = entry.Put ? entry.Put.Item : (op as { Key: Item }).Key;
      const identity = `${op.TableName}/${keyOf(op.TableName, source)}`;
      if (seen.has(identity)) {
        throw Object.assign(
          new Error('Transaction request cannot include multiple operations on one item'),
          { name: 'ValidationException' },
        );
      }
      seen.add(identity);
    }
    hooks.transactionSizes.push(items.length);
    const count = hooks.transactionSizes.length;
    const hook = hooks.beforeNextTransaction;
    if (hook) {
      hooks.beforeNextTransaction = undefined;
      hook();
    }
    const nth = beforeTransactionByCount.get(count);
    if (nth) {
      beforeTransactionByCount.delete(count);
      nth();
    }
    const failCode = failTransactionByCount.get(count);
    if (failCode) {
      failTransactionByCount.delete(count);
      throw new TransactionCanceledException({
        message: 'Transaction cancelled, please refer cancellation reasons for specific reasons',
        $metadata: {},
        CancellationReasons: items.map((_, index) => ({
          Code: index === 0 ? failCode : 'None',
        })),
      });
    }
    const reasons = items.map((entry) => {
      const op = entry.Put ?? entry.Update ?? entry.Delete ?? entry.ConditionCheck;
      if (!op) throw new Error('fakeDynamo が知らない取引の項目');
      const source = entry.Put
        ? entry.Put.Item
        : ((entry.Update ?? entry.Delete ?? entry.ConditionCheck)?.Key as Item);
      const existing = table(op.TableName).get(keyOf(op.TableName, source));
      return conditionHolds(existing, op.ConditionExpression, {
        names: op.ExpressionAttributeNames,
        values: op.ExpressionAttributeValues,
      })
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
      } else if (entry.Delete) {
        table(entry.Delete.TableName).delete(keyOf(entry.Delete.TableName, entry.Delete.Key));
      }
    }
    return {};
  });

  mock.on(QueryCommand).callsFake((input) => {
    const t = table(input.TableName);
    const values: Record<string, unknown> = input.ExpressionAttributeValues ?? {};
    if (failingReads.has(`Query ${String(input.TableName)}`)) {
      throw new Error(`読み取りの失敗（差し込み）: Query ${String(input.TableName)}`);
    }
    hooks.readLog.push({
      operation: 'Query',
      table: String(input.TableName),
      consistent: input.ConsistentRead === true,
    });
    hooks.readTargets.push(`Query ${String(input.TableName)} ${String(values[':p'])}`);
    if (isEvaluated(input.TableName)) {
      // `familyId = :f AND begins_with(sk, :p)`。sk の昇順。hooks.queryPageSize（または Limit）があれば、その件数ごとに LastEvaluatedKey を返す。
      // FilterExpression は 1 ページを読んだあとに当てる（本物と同じ）。ProjectionExpression があれば、その属性だけ返す
      const sorted = [...t.values()]
        .filter(
          (item) =>
            item.familyId === values[':f'] && String(item.sk).startsWith(String(values[':p'])),
        )
        .sort((a, b) => (String(a.sk) < String(b.sk) ? -1 : String(a.sk) > String(b.sk) ? 1 : 0));
      const startKey = input.ExclusiveStartKey as { sk?: string } | undefined;
      const from = startKey ? sorted.findIndex((item) => item.sk === startKey.sk) + 1 : 0;
      const size = hooks.queryPageSize ?? input.Limit ?? sorted.length;
      const page = sorted.slice(from, from + Math.max(size, 1));
      const last = page[page.length - 1];
      const more = from + page.length < sorted.length && last !== undefined;
      const names: Record<string, string> = input.ExpressionAttributeNames ?? {};
      const projection: string[] | undefined = input.ProjectionExpression
        ? String(input.ProjectionExpression)
            .split(',')
            .map((part) => part.trim())
            .map((part) => names[part] ?? part)
        : undefined;
      const items = page
        .filter((item) => conditionHolds(item, input.FilterExpression, { names, values }))
        .map((item) =>
          projection
            ? Object.fromEntries(
                projection
                  .filter((name) => item[name] !== undefined)
                  .map((name) => [name, item[name]]),
              )
            : { ...item },
        );
      return delayed(input.TableName, {
        Items: items,
        ...(more ? { LastEvaluatedKey: { familyId: last.familyId, sk: last.sk } } : {}),
      });
    }
    if (input.IndexName === 'familyId-index') {
      const familyId = values[':familyId'];
      const items = [...t.values()]
        .filter((item) => item.familyId === familyId)
        .filter((item) => !hiddenFromFamilyIndex.has(String(item.userId)))
        .map((item) =>
          Object.fromEntries(
            FAMILY_INDEX_ATTRIBUTES.filter((name) => item[name] !== undefined).map((name) => [
              name,
              item[name],
            ]),
          ),
        );
      return delayed(input.TableName, { Items: items });
    }
    const lineUserId = values[':lineUserId'];
    const items = [...t.values()]
      .filter((item) => item.lineUserId === lineUserId)
      .map((item) => ({ ...item }));
    return { Items: items };
  });

  /** BatchGet・BatchWrite は使わない（U8 の見張り）。呼ばれたら記録して失敗させる */
  mock.on(BatchGetCommand).callsFake(() => {
    hooks.forbiddenCalls.push('BatchGetItem');
    throw new Error('BatchGetItem は使えません');
  });
  mock.on(BatchWriteCommand).callsFake(() => {
    hooks.forbiddenCalls.push('BatchWriteItem');
    throw new Error('BatchWriteItem は使えません');
  });

  /** Scan は使わない（NFR1.20、NFR1.22）。呼ばれたら記録して失敗させる */
  mock.on(ScanCommand).callsFake((input) => {
    hooks.readLog.push({
      operation: 'Scan',
      table: String(input.TableName),
      consistent: input.ConsistentRead === true,
    });
    throw new Error('Scan は使えません');
  });

  return {
    mock,
    users: tables[USERS_TABLE] as Table,
    events: tables[EVENTS_TABLE] as Table,
    families: tables[FAMILIES_TABLE] as Table,
    requestRecords: tables[REQUEST_RECORDS_TABLE] as Table,
    invitations: tables[INVITATIONS_TABLE] as Table,
    notificationGroups: tables[NOTIFICATION_GROUPS_TABLE] as Table,
    choreTypes: tables[CHORE_TYPES_TABLE] as Table,
    calendar: tables[CALENDAR_TABLE] as Table,
    hiddenFromFamilyIndex,
    hooks,
  };
}
