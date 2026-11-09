import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import { logger } from '../lib/logger';
import type {
  AssignmentRecord,
  AssignmentRuleRecord,
  DutyRecord,
  DutyRefRecord,
  MonthStateRecord,
} from '../models';
import { typeSortKey } from './choreTypeRepository';

/**
 * Calendar テーブル（U5）。1 つのテーブルに、割り当て・日ごとの担当・月の状態・担当の引き当てを入れる。
 * パーティションキーは familyId、ソートキー sk は次のとおり。ほかの家族の項目は読めない（NFR4.43）。
 * - 割り当て      `M#<month>#A`
 * - 日ごとの担当  `M#<month>#D#<date>#<choreTypeId>`
 * - 月の状態      `M#<month>#S`
 * - 担当の引き当て `DID#<dutyId>`
 * 読み取りはすべて強い整合性（ConsistentRead）。索引はない。条件式・更新式の属性名は、すべて # の別名で書く（NFR4.50）。
 */

export const assignmentSortKey = (month: string): string => `M#${month}#A`;
export const monthStateSortKey = (month: string): string => `M#${month}#S`;
export const dutySortKey = (month: string, date: string, choreTypeId: string): string =>
  `M#${month}#D#${date}#${choreTypeId}`;
export const dutyRefSortKey = (dutyId: string): string => `DID#${dutyId}`;
const monthPrefix = (month: string): string => `M#${month}#`;

type WithSortKey<T> = T & { sk: string };

function stripSortKey<T>(item: WithSortKey<T>): T {
  const { sk: _sk, ...rest } = item;
  void _sk;
  return rest as T;
}

/** 月の Query で読めるもの（割り当て・月の状態・日ごとの担当） */
export interface MonthItems {
  assignment?: AssignmentRecord;
  state?: MonthStateRecord;
  /** sk の順（日付、種類の ID の順） */
  duties: DutyRecord[];
}

/**
 * 月の項目を 1 回の Query で読む（強い整合性）。続き（LastEvaluatedKey）があれば最後まで読む（NFR1.17、NFR1.21）。
 * 担当の数で読み取りの回数は増えない（1 ページ 1 MB まで 1 回）。
 */
export async function loadMonth(familyId: string, month: string): Promise<MonthItems> {
  const prefix = monthPrefix(month);
  const result: MonthItems = { duties: [] };
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tables.calendar(),
        KeyConditionExpression: '#familyId = :f AND begins_with(#sk, :p)',
        ExpressionAttributeNames: { '#familyId': 'familyId', '#sk': 'sk' },
        ExpressionAttributeValues: { ':f': familyId, ':p': prefix },
        ConsistentRead: true,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of page.Items ?? []) {
      const sk = String((raw as { sk: unknown }).sk);
      const rest = sk.slice(prefix.length);
      if (rest === 'A') result.assignment = stripSortKey(raw as WithSortKey<AssignmentRecord>);
      else if (rest === 'S') result.state = stripSortKey(raw as WithSortKey<MonthStateRecord>);
      else if (rest.startsWith('D#')) {
        result.duties.push(stripSortKey(raw as WithSortKey<DutyRecord>));
      }
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return result;
}

/**
 * ある日の担当だけを読む（U6。`familyId = :f AND begins_with(sk, 'M#<month>#D#<date>#')`。強い整合性）。
 * 続き（LastEvaluatedKey）があれば最後まで読む。担当の数で読み取りの回数が大きく増えない（NFR1.20、NFR1.21）。
 */
export async function listDutiesOn(familyId: string, date: string): Promise<DutyRecord[]> {
  const month = date.slice(0, 7);
  const prefix = `M#${month}#D#${date}#`;
  const duties: DutyRecord[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tables.calendar(),
        KeyConditionExpression: '#familyId = :f AND begins_with(#sk, :p)',
        ExpressionAttributeNames: { '#familyId': 'familyId', '#sk': 'sk' },
        ExpressionAttributeValues: { ':f': familyId, ':p': prefix },
        ConsistentRead: true,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const raw of page.Items ?? []) {
      duties.push(stripSortKey(raw as WithSortKey<DutyRecord>));
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return duties;
}

/** 月の状態を 1 つ読む（U6。`M#<month>#S`。強い整合性）。なければ undefined（記録のない月は確定していない扱い）。 */
export async function getMonthState(
  familyId: string,
  month: string,
): Promise<MonthStateRecord | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.calendar(),
      Key: { familyId, sk: monthStateSortKey(month) },
      ConsistentRead: true,
    }),
  );
  return result.Item ? stripSortKey(result.Item as WithSortKey<MonthStateRecord>) : undefined;
}

/** 割り当てを 1 つ読む（強い整合性）。 */
export async function getAssignment(
  familyId: string,
  month: string,
): Promise<AssignmentRecord | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.calendar(),
      Key: { familyId, sk: assignmentSortKey(month) },
      ConsistentRead: true,
    }),
  );
  return result.Item ? stripSortKey(result.Item as WithSortKey<AssignmentRecord>) : undefined;
}

/** 担当と、その月が確定しているか（担当の変更が読む） */
export interface DutyWithState {
  duty: DutyRecord;
  confirmed: boolean;
}

/**
 * 担当の ID から担当を探す（`DID#<dutyId>` → 担当 → 月の状態。強い整合性の GetItem 3 回。Scan は使わない。NFR1.22）。
 * キーはいつも呼び出した家族の ID なので、ほかの家族の担当は「ない」と同じ。
 * 引き当てか担当がない、または担当の dutyId が呼ばれた ID と違う（消されて作り直された）ときは undefined。
 */
export async function findDuty(
  familyId: string,
  dutyId: string,
): Promise<DutyWithState | undefined> {
  const ref = await docClient.send(
    new GetCommand({
      TableName: tables.calendar(),
      Key: { familyId, sk: dutyRefSortKey(dutyId) },
      ConsistentRead: true,
    }),
  );
  if (!ref.Item) return undefined;
  const { month, date, choreTypeId } = ref.Item as DutyRefRecord;
  const [duty, state] = await Promise.all([
    docClient.send(
      new GetCommand({
        TableName: tables.calendar(),
        Key: { familyId, sk: dutySortKey(month, date, choreTypeId) },
        ConsistentRead: true,
      }),
    ),
    docClient.send(
      new GetCommand({
        TableName: tables.calendar(),
        Key: { familyId, sk: monthStateSortKey(month) },
        ConsistentRead: true,
      }),
    ),
  ]);
  if (!duty.Item || (duty.Item as DutyRecord).dutyId !== dutyId) return undefined;
  return {
    duty: stripSortKey(duty.Item as WithSortKey<DutyRecord>),
    confirmed: (state.Item as MonthStateRecord | undefined)?.confirmed === true,
  };
}

/**
 * 種類が割り当てか担当に一度でも使われたか（C8 isChoreTypeAssigned、BR6.10）。
 * `M#` から始まる項目のうち、割り当て（choreTypeIds に含む）か担当（choreTypeId が同じ）を探す。
 * 1 件当たったら続きを読まない。強い整合性。
 */
export async function isChoreTypeUsed(familyId: string, choreTypeId: string): Promise<boolean> {
  let startKey: Record<string, unknown> | undefined;
  do {
    const page = await docClient.send(
      new QueryCommand({
        TableName: tables.calendar(),
        KeyConditionExpression: '#familyId = :f AND begins_with(#sk, :p)',
        FilterExpression: 'contains(#choreTypeIds, :c) OR #choreTypeId = :c',
        ProjectionExpression: '#sk',
        ExpressionAttributeNames: {
          '#familyId': 'familyId',
          '#sk': 'sk',
          '#choreTypeIds': 'choreTypeIds',
          '#choreTypeId': 'choreTypeId',
        },
        ExpressionAttributeValues: { ':f': familyId, ':p': 'M#', ':c': choreTypeId },
        ConsistentRead: true,
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    if ((page.Items ?? []).length > 0) return true;
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return false;
}

// --- 取引の項目の組み立て（reliability-design.md の「チャンクに分ける」「最後に割り当てを書く」） ---

const CHECK_MONTH_NOT_CONFIRMED = 'attribute_not_exists(#confirmed) OR #confirmed = :false';

/** 月の状態の ConditionCheck: 確定していない（記録がない月も確定していない。BR6.2、NFR4.50） */
export function buildMonthGuard(familyId: string, month: string) {
  return {
    ConditionCheck: {
      TableName: tables.calendar(),
      Key: { familyId, sk: monthStateSortKey(month) },
      ConditionExpression: CHECK_MONTH_NOT_CONFIRMED,
      ExpressionAttributeNames: { '#confirmed': 'confirmed' },
      ExpressionAttributeValues: { ':false': false },
    },
  };
}

/** C7 の ChoreTypes の ConditionCheck: 種類が「使う」（BR6.8、NFR4.50） */
export function buildChoreTypeGuard(familyId: string, choreTypeId: string) {
  return {
    ConditionCheck: {
      TableName: tables.choreTypes(),
      Key: { familyId, sk: typeSortKey(choreTypeId) },
      ConditionExpression: '#active = :true',
      ExpressionAttributeNames: { '#active': 'active' },
      ExpressionAttributeValues: { ':true': true },
    },
  };
}

/** 担当を作る（担当の Put と引き当ての Put。条件 attribute_not_exists。項目数 2） */
export function buildCreateDutyItems(duty: DutyRecord) {
  const ref: DutyRefRecord = {
    familyId: duty.familyId,
    dutyId: duty.dutyId,
    month: duty.month,
    date: duty.date,
    choreTypeId: duty.choreTypeId,
  };
  return [
    {
      Put: {
        TableName: tables.calendar(),
        Item: { ...duty, sk: dutySortKey(duty.month, duty.date, duty.choreTypeId) },
        ConditionExpression: 'attribute_not_exists(#sk)',
        ExpressionAttributeNames: { '#sk': 'sk' },
      },
    },
    {
      Put: {
        TableName: tables.calendar(),
        Item: { ...ref, sk: dutyRefSortKey(duty.dutyId) },
        ConditionExpression: 'attribute_not_exists(#sk)',
        ExpressionAttributeNames: { '#sk': 'sk' },
      },
    },
  ];
}

/** 「未」で、読んだときから変わっていない（version）、同じ担当（dutyId）であること */
const CHECK_DUTY_UNCHANGED = '#status = :todo AND #version = :v AND #dutyId = :id';

function dutyUnchangedValues(duty: DutyRecord): Record<string, unknown> {
  return { ':todo': 'todo', ':v': duty.version, ':id': duty.dutyId };
}

const DUTY_UNCHANGED_NAMES = { '#status': 'status', '#version': 'version', '#dutyId': 'dutyId' };

/** 担当を消す（担当の Delete と引き当ての Delete。項目数 2） */
export function buildDeleteDutyItems(duty: DutyRecord) {
  return [
    {
      Delete: {
        TableName: tables.calendar(),
        Key: {
          familyId: duty.familyId,
          sk: dutySortKey(duty.month, duty.date, duty.choreTypeId),
        },
        ConditionExpression: CHECK_DUTY_UNCHANGED,
        ExpressionAttributeNames: DUTY_UNCHANGED_NAMES,
        ExpressionAttributeValues: dutyUnchangedValues(duty),
      },
    },
    {
      Delete: {
        TableName: tables.calendar(),
        Key: { familyId: duty.familyId, sk: dutyRefSortKey(duty.dutyId) },
        ConditionExpression: 'attribute_exists(#sk)',
        ExpressionAttributeNames: { '#sk': 'sk' },
      },
    },
  ];
}

/** 担当の子供を変える（担当の Update。項目数 1）。origin と version を書く */
export function buildChangeChildItem(
  duty: DutyRecord,
  childUserId: string,
  origin: 'rule' | 'manual',
  now: Date,
) {
  return {
    Update: {
      TableName: tables.calendar(),
      Key: {
        familyId: duty.familyId,
        sk: dutySortKey(duty.month, duty.date, duty.choreTypeId),
      },
      UpdateExpression:
        'SET #childUserId = :child, #origin = :origin, #version = #version + :one, #updatedAt = :now',
      ConditionExpression: CHECK_DUTY_UNCHANGED,
      ExpressionAttributeNames: {
        ...DUTY_UNCHANGED_NAMES,
        '#childUserId': 'childUserId',
        '#origin': 'origin',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ...dutyUnchangedValues(duty),
        ':child': childUserId,
        ':origin': origin,
        ':one': 1,
        ':now': now.toISOString(),
      },
    },
  };
}

/** C7 の ChoreTypes の ConditionCheck: 単価が読んだ値のまま（U6。BR7.7、NFR4.50） */
export function buildUnitPriceGuard(familyId: string, choreTypeId: string, unitPrice: number) {
  return {
    ConditionCheck: {
      TableName: tables.choreTypes(),
      Key: { familyId, sk: typeSortKey(choreTypeId) },
      ConditionExpression: '#unitPrice = :price',
      ExpressionAttributeNames: { '#unitPrice': 'unitPrice' },
      ExpressionAttributeValues: { ':price': unitPrice },
    },
  };
}

/**
 * 記録の取引の 3 項目（U6。BR7.6、BR7.7、reliability-design.md の「取引の形」）。
 * - 項目 0: 担当の Update（status=done、recordedAt/recordedBy/unitPrice/updatedAt を書き、version+1）。
 *   条件は status=todo・version・dutyId・childUserId。書く 6 項目だけ（origin・childUserId・date・choreTypeId は変えない）。
 * - 項目 1: 月の状態の ConditionCheck（確定していない。buildMonthGuard）。月は担当の month（今日の月ではない）
 * - 項目 2: 種類の ConditionCheck（単価が読んだ値のまま。buildUnitPriceGuard）
 * 条件式・更新式に出る属性名は、予約語かどうかにかかわらず、すべて # の別名で置き換える（NFR4.50）。
 * 項目がなければ status=todo の条件が成り立たず断られる（担当を作らない。NFR4.64）。
 */
export function buildRecordItems(
  duty: DutyRecord,
  unitPrice: number,
  ctx: { userId: string },
  now: Date,
): TransactItems {
  const at = now.toISOString();
  return [
    {
      Update: {
        TableName: tables.calendar(),
        Key: {
          familyId: duty.familyId,
          sk: dutySortKey(duty.month, duty.date, duty.choreTypeId),
        },
        UpdateExpression:
          'SET #status = :done, #recordedAt = :now, #recordedBy = :by, ' +
          '#unitPrice = :price, #updatedAt = :now, #version = #version + :one',
        ConditionExpression:
          '#status = :todo AND #version = :v AND #dutyId = :id AND #childUserId = :by',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#recordedAt': 'recordedAt',
          '#recordedBy': 'recordedBy',
          '#unitPrice': 'unitPrice',
          '#updatedAt': 'updatedAt',
          '#version': 'version',
          '#dutyId': 'dutyId',
          '#childUserId': 'childUserId',
        },
        ExpressionAttributeValues: {
          ':done': 'done',
          ':todo': 'todo',
          ':now': at,
          ':by': ctx.userId,
          ':price': unitPrice,
          ':one': 1,
          ':v': duty.version,
          ':id': duty.dutyId,
        },
      },
    },
    buildMonthGuard(duty.familyId, duty.month),
    buildUnitPriceGuard(duty.familyId, duty.choreTypeId, unitPrice),
  ];
}

/** 割り当ての Put。行が 0 行のときは choreTypeIds を置かない（空の集合は書けない） */
export function buildAssignmentPut(record: AssignmentRecord) {
  const { choreTypeIds, ...rest } = record;
  return {
    Put: {
      TableName: tables.calendar(),
      Item: {
        ...rest,
        ...(choreTypeIds && choreTypeIds.size > 0 ? { choreTypeIds } : {}),
        sk: assignmentSortKey(record.month),
      },
    },
  };
}

/** 割り当ての行から、使う種類の集合を作る（行が 0 行なら undefined） */
export function choreTypeIdsOf(rules: readonly AssignmentRuleRecord[]): Set<string> | undefined {
  return rules.length > 0 ? new Set(rules.map((rule) => rule.choreTypeId)) : undefined;
}

export type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

/**
 * 取り消しの理由を読み分ける。ConditionalCheckFailed と TransactionConflict だけなら 'conflict'（読み直してやり直す）、
 * それ以外の Code（ThrottlingError など）が 1 つでもある、または読み取れないときは undefined（投げ直す。NFR2.31）。
 */
export function classifyCancellation(
  reasons: readonly { Code?: string }[] | undefined,
): 'conflict' | undefined {
  const codes = (reasons ?? []).flatMap((r) => (r.Code && r.Code !== 'None' ? [r.Code] : []));
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'CALENDAR_TRANSACTION_CANCELED', codes });
  return codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')
    ? 'conflict'
    : undefined;
}

/**
 * 取引を 1 回書く。書けたら 'written'、競合で断られたら 'conflict'。
 * 思いがけない Code や、取り消し以外の失敗は投げ直す。
 */
export async function writeTransaction(items: TransactItems): Promise<'written' | 'conflict'> {
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
    return 'written';
  } catch (error) {
    if (
      error instanceof TransactionCanceledException &&
      classifyCancellation(error.CancellationReasons) === 'conflict'
    ) {
      return 'conflict';
    }
    throw error;
  }
}
