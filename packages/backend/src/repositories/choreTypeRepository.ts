import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import { logger } from '../lib/logger';
import type { ChoreTypeRecord } from '../models';
import * as requestRecordRepository from './requestRecordRepository';

/**
 * ChoreTypes テーブル（U4）。1 つのテーブルに、種類（`sk = TYPE#<choreTypeId>`）と名前の印（`sk = NAME#<名前>`）を入れる。
 * パーティションキーは familyId なので、ほかの家族の項目は読めない（NFR4.36）。
 * 読み取りはすべて強い整合性（ConsistentRead）で行う（reliability-design.md）。
 */

const TYPE_PREFIX = 'TYPE#';
const NAME_PREFIX = 'NAME#';

export const typeSortKey = (choreTypeId: string): string => `${TYPE_PREFIX}${choreTypeId}`;
export const nameSortKey = (name: string): string => `${NAME_PREFIX}${name}`;

/** テーブルの種類の項目 */
interface ChoreTypeItem extends ChoreTypeRecord {
  sk: string;
}

/** 名前の印の項目 */
export interface NameMarkerItem {
  familyId: string;
  sk: string;
  choreTypeId: string;
}

function toItem(record: ChoreTypeRecord): ChoreTypeItem {
  return { ...record, sk: typeSortKey(record.choreTypeId) };
}

function toRecord(item: ChoreTypeItem): ChoreTypeRecord {
  return {
    familyId: item.familyId,
    choreTypeId: item.choreTypeId,
    name: item.name,
    unitPrice: item.unitPrice,
    ...(item.description !== undefined ? { description: item.description } : {}),
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** 家族の種類をすべて読む。続き（LastEvaluatedKey）があれば最後まで読む（NFR1.17）。並べ替えは呼び出し側。 */
export async function listByFamily(familyId: string): Promise<ChoreTypeRecord[]> {
  const records: ChoreTypeRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tables.choreTypes(),
        KeyConditionExpression: 'familyId = :f AND begins_with(sk, :p)',
        ExpressionAttributeValues: { ':f': familyId, ':p': TYPE_PREFIX },
        ConsistentRead: true,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const item of page.Items ?? []) records.push(toRecord(item as ChoreTypeItem));
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return records;
}

/** 種類を 1 つ読む。ほかの家族の種類は、キーに家族が入るので「ない」と同じ（undefined）。 */
export async function findById(
  familyId: string,
  choreTypeId: string,
): Promise<ChoreTypeRecord | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.choreTypes(),
      Key: { familyId, sk: typeSortKey(choreTypeId) },
      ConsistentRead: true,
    }),
  );
  return result.Item ? toRecord(result.Item as ChoreTypeItem) : undefined;
}

/** 名前の印を読む（名前は NFC・前後の空白を除いた形）。名前が重なったときの文言の出し分けに使う。 */
export async function findNameMarker(
  familyId: string,
  name: string,
): Promise<NameMarkerItem | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.choreTypes(),
      Key: { familyId, sk: nameSortKey(name) },
      ConsistentRead: true,
    }),
  );
  return result.Item as NameMarkerItem | undefined;
}

export interface CreateChoreTypeInput {
  record: ChoreTypeRecord;
  /** 送り直しの記録（U1）。種類と名前の印と同じ取引で書く */
  request: Parameters<typeof requestRecordRepository.buildPutItem>[0];
}

/** 登録の取引の各項目の役割。CancellationReasons の並びと同じ順。 */
export type CreateItemKind = 'type' | 'name' | 'request';
const CREATE_KINDS: CreateItemKind[] = ['type', 'name', 'request'];

/**
 * 登録の取引（TransactWriteItems）の項目を組み立てる（reliability-design.md の「登録」）。
 * 1. 種類の Put: 条件 attribute_not_exists(sk)
 * 2. 名前の印の Put: 条件 attribute_not_exists(sk)（同じ名前が同時に登録されても 1 つだけ。BR5.3）
 * 3. 送り直しの記録の Put（U1）
 */
export function buildCreateItems(input: CreateChoreTypeInput, now: Date) {
  const { record } = input;
  return [
    {
      Put: {
        TableName: tables.choreTypes(),
        Item: toItem(record),
        ConditionExpression: 'attribute_not_exists(sk)',
      },
    },
    {
      Put: {
        TableName: tables.choreTypes(),
        Item: {
          familyId: record.familyId,
          sk: nameSortKey(record.name),
          choreTypeId: record.choreTypeId,
        } satisfies NameMarkerItem,
        ConditionExpression: 'attribute_not_exists(sk)',
      },
    },
    requestRecordRepository.buildPutItem(input.request, now),
  ];
}

/** 取り消しの理由の Code（None を除く）。ログ用。 */
function cancellationCodes(reasons: { Code?: string }[] | undefined): string[] {
  return (reasons ?? []).flatMap((r) => (r.Code && r.Code !== 'None' ? [r.Code] : []));
}

/**
 * 登録の取引が断られた理由を読み分ける。送り直しの記録の条件が外れたら 'request'（同じ印の要求が先に通った）、
 * 名前の印の条件が外れたら 'name'、ほかが ConditionalCheckFailed と TransactionConflict だけなら 'stale'（1 回だけやり直す）。
 * ほかの Code や読み取れない失敗は undefined（投げ直す）。
 */
export function classifyCreateCancellation(
  reasons: { Code?: string }[] | undefined,
): 'request' | 'name' | 'stale' | undefined {
  const codes = cancellationCodes(reasons);
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'CHORE_TYPE_TRANSACTION_CANCELED', operation: 'create', codes });
  const failed = (kind: CreateItemKind) =>
    reasons?.[CREATE_KINDS.indexOf(kind)]?.Code === 'ConditionalCheckFailed';
  if (failed('request')) return 'request';
  if (failed('name')) return 'name';
  return codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')
    ? 'stale'
    : undefined;
}

/** 変更で書く値（名前・単価・説明）。説明がなければ description を消す。 */
export interface ChoreTypeChange {
  name: string;
  unitPrice: number;
  description?: string;
}

export type UpdateOutcome =
  { status: 'updated'; record: ChoreTypeRecord } | { status: 'name-taken' } | { status: 'stale' };

/**
 * 値を入れ替える SET / REMOVE の式の部品。`name`・`description` などは予約語に当たりうるので、すべて # の別名で書く。
 * 名前を書くか（改名）は withName で決める。
 */
function buildChangeExpression(change: ChoreTypeChange, now: Date, withName: boolean) {
  const sets = [
    ...(withName ? ['#name = :name'] : []),
    '#unitPrice = :unitPrice',
    '#updatedAt = :updatedAt',
    ...(change.description !== undefined ? ['#description = :description'] : []),
  ];
  const names: Record<string, string> = {
    ...(withName ? { '#name': 'name' } : {}),
    '#unitPrice': 'unitPrice',
    '#updatedAt': 'updatedAt',
    '#description': 'description',
  };
  const values: Record<string, unknown> = {
    ...(withName ? { ':name': change.name } : {}),
    ':unitPrice': change.unitPrice,
    ':updatedAt': now.toISOString(),
    ...(change.description !== undefined ? { ':description': change.description } : {}),
  };
  return {
    UpdateExpression: `SET ${sets.join(', ')}${change.description === undefined ? ' REMOVE #description' : ''}`,
    names,
    values,
  };
}

function changed(record: ChoreTypeRecord, change: ChoreTypeChange, now: Date): ChoreTypeRecord {
  return {
    familyId: record.familyId,
    choreTypeId: record.choreTypeId,
    active: record.active,
    createdAt: record.createdAt,
    name: change.name,
    unitPrice: change.unitPrice,
    ...(change.description !== undefined ? { description: change.description } : {}),
    updatedAt: now.toISOString(),
  };
}

const isConditionFailure = (error: unknown): boolean =>
  error instanceof ConditionalCheckFailedException;

/**
 * 名前を変えない変更（reliability-design.md の「変更」2）。種類の Update だけ。
 * 条件 `attribute_exists(sk) AND name = :oldName`: 読んだあとに別の要求が名前を変えていたら断られ（'stale'）、
 * 名前の印とずれた書き込みにならない。
 */
export async function updateKeepingName(
  current: ChoreTypeRecord,
  change: ChoreTypeChange,
  now: Date = new Date(),
): Promise<UpdateOutcome> {
  const expression = buildChangeExpression(change, now, false);
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: tables.choreTypes(),
        Key: { familyId: current.familyId, sk: typeSortKey(current.choreTypeId) },
        UpdateExpression: expression.UpdateExpression,
        ConditionExpression: 'attribute_exists(sk) AND #name = :oldName',
        ExpressionAttributeNames: { ...expression.names, '#name': 'name' },
        ExpressionAttributeValues: { ...expression.values, ':oldName': current.name },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return { status: 'updated', record: toRecord(result.Attributes as ChoreTypeItem) };
  } catch (error) {
    if (isConditionFailure(error)) return { status: 'stale' };
    throw error;
  }
}

/** 改名の取引の各項目の役割。CancellationReasons の並びと同じ順。 */
const RENAME_KINDS = ['new-name', 'old-name', 'type'] as const;

/**
 * 改名の取引の項目を組み立てる（reliability-design.md の「変更」3）。
 * 1. 新しい名前の印の Put: 条件 attribute_not_exists(sk)
 * 2. 古い名前の印の Delete: 条件 choreTypeId = :id
 * 3. 種類の Update: 条件 attribute_exists(sk) AND name = :oldName
 */
export function buildRenameItems(current: ChoreTypeRecord, change: ChoreTypeChange, now: Date) {
  const expression = buildChangeExpression(change, now, true);
  return [
    {
      Put: {
        TableName: tables.choreTypes(),
        Item: {
          familyId: current.familyId,
          sk: nameSortKey(change.name),
          choreTypeId: current.choreTypeId,
        } satisfies NameMarkerItem,
        ConditionExpression: 'attribute_not_exists(sk)',
      },
    },
    {
      Delete: {
        TableName: tables.choreTypes(),
        Key: { familyId: current.familyId, sk: nameSortKey(current.name) },
        ConditionExpression: 'choreTypeId = :id',
        ExpressionAttributeValues: { ':id': current.choreTypeId },
      },
    },
    {
      Update: {
        TableName: tables.choreTypes(),
        Key: { familyId: current.familyId, sk: typeSortKey(current.choreTypeId) },
        UpdateExpression: expression.UpdateExpression,
        ConditionExpression: 'attribute_exists(sk) AND #name = :oldName',
        ExpressionAttributeNames: expression.names,
        ExpressionAttributeValues: { ...expression.values, ':oldName': current.name },
      },
    },
  ];
}

/**
 * 改名や消すの取引が断られた理由を読み分ける。
 * 新しい名前の印の条件が外れたら 'name-taken'（改名だけ）、ほかが ConditionalCheckFailed と TransactionConflict だけなら 'stale'
 * （読み直して 1 回だけやり直す）。ほかの Code や読み取れない失敗は undefined（投げ直す）。
 */
export function classifyCancellation(
  operation: 'rename' | 'delete',
  reasons: { Code?: string }[] | undefined,
): 'name-taken' | 'stale' | undefined {
  const codes = cancellationCodes(reasons);
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'CHORE_TYPE_TRANSACTION_CANCELED', operation, codes });
  if (
    operation === 'rename' &&
    reasons?.[RENAME_KINDS.indexOf('new-name')]?.Code === 'ConditionalCheckFailed'
  ) {
    return 'name-taken';
  }
  return codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')
    ? 'stale'
    : undefined;
}

/** 名前を変える変更（新しい名前の印を取り、古い印を消し、種類を書く。1 つの取引）。 */
export async function renameWithName(
  current: ChoreTypeRecord,
  change: ChoreTypeChange,
  now: Date = new Date(),
): Promise<UpdateOutcome> {
  try {
    await docClient.send(
      new TransactWriteCommand({ TransactItems: buildRenameItems(current, change, now) }),
    );
    return { status: 'updated', record: changed(current, change, now) };
  } catch (error) {
    if (error instanceof TransactionCanceledException) {
      const outcome = classifyCancellation('rename', error.CancellationReasons);
      if (outcome === 'name-taken') return { status: 'name-taken' };
      if (outcome === 'stale') return { status: 'stale' };
    }
    throw error;
  }
}

/**
 * 「使わない」「使う」を書く（BR5.8）。条件 attribute_exists(sk)。種類がなければ undefined。
 * 消す手順の 1（active = false）にも使う。
 */
export async function setActive(
  familyId: string,
  choreTypeId: string,
  active: boolean,
  now: Date = new Date(),
): Promise<ChoreTypeRecord | undefined> {
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: tables.choreTypes(),
        Key: { familyId, sk: typeSortKey(choreTypeId) },
        UpdateExpression: 'SET #active = :active, #updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(sk)',
        ExpressionAttributeNames: { '#active': 'active', '#updatedAt': 'updatedAt' },
        ExpressionAttributeValues: { ':active': active, ':updatedAt': now.toISOString() },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toRecord(result.Attributes as ChoreTypeItem);
  } catch (error) {
    if (isConditionFailure(error)) return undefined;
    throw error;
  }
}

/**
 * 消す取引の項目を組み立てる（reliability-design.md の「消す」4）。
 * 1. 種類の Delete: 条件 attribute_exists(sk) AND active = false
 * 2. 名前の印の Delete: 条件 choreTypeId = :id
 */
export function buildDeleteItems(record: ChoreTypeRecord) {
  return [
    {
      Delete: {
        TableName: tables.choreTypes(),
        Key: { familyId: record.familyId, sk: typeSortKey(record.choreTypeId) },
        ConditionExpression: 'attribute_exists(sk) AND #active = :false',
        ExpressionAttributeNames: { '#active': 'active' },
        ExpressionAttributeValues: { ':false': false },
      },
    },
    {
      Delete: {
        TableName: tables.choreTypes(),
        Key: { familyId: record.familyId, sk: nameSortKey(record.name) },
        ConditionExpression: 'choreTypeId = :id',
        ExpressionAttributeValues: { ':id': record.choreTypeId },
      },
    },
  ];
}

/** 種類と名前の印を 1 つの取引で消す。断られたら 'stale'（呼び出し側が読み直して分ける）。読み取れない失敗は投げ直す。 */
export async function deleteWithName(record: ChoreTypeRecord): Promise<'deleted' | 'stale'> {
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: buildDeleteItems(record) }));
    return 'deleted';
  } catch (error) {
    if (
      error instanceof TransactionCanceledException &&
      classifyCancellation('delete', error.CancellationReasons) === 'stale'
    ) {
      return 'stale';
    }
    throw error;
  }
}

export type CreateChoreTypeResult = 'created' | 'request-conflict' | 'name-taken' | 'stale';

/**
 * 種類・名前の印・送り直しの記録を 1 つの取引で書く。どれかの条件が外れれば何も書かれない（NFR2.24）。
 * 断られたら理由を読み分けて返す。読み取れない失敗は投げ直す。
 */
export async function createWithName(
  input: CreateChoreTypeInput,
  now: Date = new Date(),
): Promise<CreateChoreTypeResult> {
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: buildCreateItems(input, now) }));
    return 'created';
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const outcome = classifyCreateCancellation(err.CancellationReasons);
      if (outcome === 'request') return 'request-conflict';
      if (outcome === 'name') return 'name-taken';
      if (outcome === 'stale') return 'stale';
    }
    throw err;
  }
}
