import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import { logger } from '../lib/logger';
import type { Family, Invitation, NotificationGroup, RequestRecord } from '../models';
import * as invitationRepository from './invitationRepository';
import * as notificationGroupRepository from './notificationGroupRepository';
import * as requestRecordRepository from './requestRecordRepository';
import * as userRepository from './userRepository';

/** 家族を読む。作り直しの前など、最新の値が要るときは consistent: true（強い整合性）。 */
export async function findById(
  familyId: string,
  options: { consistent?: boolean } = {},
): Promise<Family | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.families(),
      Key: { familyId },
      ...(options.consistent ? { ConsistentRead: true } : {}),
    }),
  );
  return result.Item as Family | undefined;
}

export type CreateWithAdminResult = 'created' | 'conflict';

/**
 * 家族を作り、作った人を管理者にし、送り直し用の結果も残す。3 つを 1 つの取引（TransactWriteItems）で書くので、
 * どれかが失敗すればどれも残らない（NFR2.3）。
 * - 家族: 同じ familyId がなければ書く
 * - 利用者: まだ家族に入っていないときだけ familyId と役割 admin と familyJoinedAt を書く（同時の二重の作成を 1 つに絞る。BR1.8）
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
              UpdateExpression:
                'SET familyId = :familyId, #role = :role, familyJoinedAt = :familyJoinedAt',
              ConditionExpression: 'attribute_exists(userId) AND attribute_not_exists(familyId)',
              ExpressionAttributeNames: { '#role': 'role' },
              ExpressionAttributeValues: {
                ':familyId': family.familyId,
                ':role': 'admin',
                ':familyJoinedAt': family.createdAt,
              },
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

export interface RotateInvitationInput {
  familyId: string;
  /** 読んだときの、家族のいまの招待の印（なければ空） */
  previousToken?: string;
  /** 前の招待の項目が（強い整合性の読み取りで）あったときだけ true。TTL で消えていれば false（R-02） */
  previousInvitationExists: boolean;
  invitation: Invitation;
  /** 送り直しの記録。operation は createInvitation、target は familyId で組み立てる */
  record: Pick<RequestRecord, 'userId' | 'idempotencyKey' | 'result'>;
}

/** 作り直しの取引の各項目の役割。CancellationReasons の並びと同じ順。 */
export type RotateItemKind = 'family' | 'newInvitation' | 'previousInvitation' | 'requestRecord';

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

export interface RotateInvitationItems {
  items: TransactItems;
  kinds: RotateItemKind[];
}

/**
 * 招待の作り直しの取引（TransactWriteItems）を組み立てる（reliability-design.md の 4）。前の招待があれば 4 件、なければ 3 件。
 * 1. Families: 印と ID を新しくする。条件は「いまの印が読んだ値と同じ（なければ属性がない）」
 * 2. Invitations: 新しい招待を Put（同じ印がなければ）
 * 3. Invitations: 前の招待を replaced にする（前の招待の項目が読めたときだけ）
 * 4. RequestRecords: 送り直しの記録を Put（operation: createInvitation、target: familyId）
 */
export function buildRotateInvitationItems(
  input: RotateInvitationInput,
  now: Date = new Date(),
): RotateInvitationItems {
  const items: TransactItems = [];
  const kinds: RotateItemKind[] = [];
  const { previousToken } = input;
  items.push({
    Update: {
      TableName: tables.families(),
      Key: { familyId: input.familyId },
      UpdateExpression: 'SET currentInvitationToken = :token, currentInvitationId = :invitationId',
      ConditionExpression: previousToken
        ? 'attribute_exists(familyId) AND currentInvitationToken = :previousToken'
        : 'attribute_exists(familyId) AND attribute_not_exists(currentInvitationToken)',
      ExpressionAttributeValues: {
        ':token': input.invitation.token,
        ':invitationId': input.invitation.invitationId,
        ...(previousToken ? { ':previousToken': previousToken } : {}),
      },
    },
  });
  kinds.push('family');
  items.push(invitationRepository.buildPutItem(input.invitation));
  kinds.push('newInvitation');
  if (previousToken && input.previousInvitationExists) {
    items.push(invitationRepository.buildMarkReplacedItem(previousToken));
    kinds.push('previousInvitation');
  }
  items.push(
    requestRecordRepository.buildPutItem(
      { ...input.record, operation: 'createInvitation', target: input.familyId },
      now,
    ),
  );
  kinds.push('requestRecord');
  return { items, kinds };
}

/**
 * 取り消しの理由の並びから、どの項目の条件で断られたかを読み分ける（reliability-design.md の 5）。
 * 送り直しの記録の条件 → 'requestRecord'。ほかの項目の条件・競合 → 'stale'（やり直す）。
 */
export function classifyCancellation(
  reasons: { Code?: string }[] | undefined,
  kinds: RotateItemKind[],
): 'requestRecord' | 'stale' | undefined {
  if (!reasons) return undefined;
  const recordIndex = kinds.indexOf('requestRecord');
  if (reasons[recordIndex]?.Code === 'ConditionalCheckFailed') return 'requestRecord';
  const codes = cancellationCodes(reasons);
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'ROTATE_TRANSACTION_CANCELED', codes });
  // 競合・条件の外れだけを「やり直す」とみなす。作りの誤りなどは投げ直す（R-02）
  if (codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')) {
    return 'stale';
  }
  return undefined;
}

export interface AcceptInvitationInput {
  userId: string;
  familyId: string;
  token: string;
  /** 送り直しの記録。operation は acceptInvitation、target は印の SHA-256 で組み立てる */
  record: Pick<RequestRecord, 'userId' | 'idempotencyKey' | 'result'>;
  /** 印の SHA-256（RequestRecords の target） */
  tokenHash: string;
}

/** 参加の取引の各項目の役割。CancellationReasons の並びと同じ順。 */
export type AcceptItemKind = 'user' | 'invitation' | 'family' | 'requestRecord';

export interface AcceptInvitationItems {
  items: TransactItems;
  kinds: AcceptItemKind[];
}

/**
 * 参加の取引（TransactWriteItems）を組み立てる（reliability-design.md の「参加」3）。4 件:
 * 1. Users: 子供にする Update（家族に入っていない、かつ友だち）
 * 2. Invitations: ConditionCheck（active、かつ期限が今より後）
 * 3. Families: ConditionCheck（currentInvitationToken がこの印）
 * 4. RequestRecords: Put（operation: acceptInvitation、target: 印の SHA-256）
 */
export function buildAcceptInvitationItems(
  input: AcceptInvitationInput,
  now: Date = new Date(),
): AcceptInvitationItems {
  const items: TransactItems = [
    userRepository.buildJoinAsChildItem(input.userId, input.familyId, now.toISOString()),
    invitationRepository.buildUsableCheckItem(input.token, now),
    {
      ConditionCheck: {
        TableName: tables.families(),
        Key: { familyId: input.familyId },
        ConditionExpression: 'currentInvitationToken = :token',
        ExpressionAttributeValues: { ':token': input.token },
      },
    },
    requestRecordRepository.buildPutItem(
      { ...input.record, operation: 'acceptInvitation', target: input.tokenHash },
      now,
    ),
  ];
  return { items, kinds: ['user', 'invitation', 'family', 'requestRecord'] };
}

export type AcceptCancellation = 'requestRecord' | 'user' | 'invitation';

/**
 * 参加の取引が断られた理由の並びから、どの条件で断られたかを読み分ける（reliability-design.md の「参加」4）。
 * 優先は 送り直しの記録 → 利用者 → 招待・家族。条件の外れが読み取れなければ undefined。
 */
export function classifyAcceptCancellation(
  reasons: { Code?: string }[] | undefined,
  kinds: AcceptItemKind[] = ['user', 'invitation', 'family', 'requestRecord'],
): AcceptCancellation | undefined {
  if (!reasons) return undefined;
  const failed = (kind: AcceptItemKind) =>
    reasons[kinds.indexOf(kind)]?.Code === 'ConditionalCheckFailed';
  if (failed('requestRecord')) return 'requestRecord';
  if (failed('user')) return 'user';
  if (failed('invitation') || failed('family')) return 'invitation';
  return undefined;
}

export type AcceptInvitationResult = 'joined' | AcceptCancellation;

/**
 * 招待に参加する。4 件を 1 つの取引で書くので、どれかの条件が外れれば何も書かれない（NFR2.11）。
 * 断られたら理由の並びで 'requestRecord' / 'user' / 'invitation' を返す。読み取れない失敗は投げ直す。
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
  now: Date = new Date(),
): Promise<AcceptInvitationResult> {
  const { items, kinds } = buildAcceptInvitationItems(input, now);
  // 取引同士の競合（TransactionConflict）だけのときは 1 回だけやり直す（R-01）
  for (let attempt = 0; ; attempt++) {
    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: items }));
      return 'joined';
    } catch (err) {
      if (!(err instanceof TransactionCanceledException)) throw err;
      const outcome = classifyAcceptCancellation(err.CancellationReasons, kinds);
      if (outcome) return outcome;
      const codes = cancellationCodes(err.CancellationReasons);
      logger.warn({
        event: 'ACCEPT_TRANSACTION_CANCELED',
        familyId: input.familyId,
        tokenPrefix: input.token.slice(0, 4),
        codes,
        attempt,
      });
      if (attempt === 0 && codes.length > 0 && codes.every((c) => c === 'TransactionConflict')) {
        continue;
      }
      throw err;
    }
  }
}

/** 取り消しの理由の Code（None を除く）。ログ用。 */
function cancellationCodes(reasons: { Code?: string }[] | undefined): string[] {
  return (reasons ?? []).flatMap((r) => (r.Code && r.Code !== 'None' ? [r.Code] : []));
}

export interface RegisterNotificationGroupInput {
  familyId: string;
  /** 登録するグループの記録（familyId は上の familyId と同じ） */
  group: NotificationGroup;
  /** 読んだときの、家族のいまのお知らせ先（なければ空）。家族の条件に使う */
  currentGroupId?: string;
  /** 前のグループの記録が（強い整合性の読み取りで）この家族のものとして実在したときだけ true */
  deletePreviousGroup: boolean;
}

/** 登録の取引の各項目の役割。CancellationReasons の並びと同じ順。 */
export type RegisterItemKind = 'newGroup' | 'family' | 'previousGroup';

export interface RegisterNotificationGroupItems {
  items: TransactItems;
  kinds: RegisterItemKind[];
}

/**
 * 登録・登録し直しの取引（TransactWriteItems）を組み立てる（reliability-design.md の「登録・登録し直し」4）。
 * 前のお知らせ先があれば 3 件、なければ 2 件。
 * 1. NotificationGroups: 新しいグループを Put（まだない、またはこの家族のもの）
 * 2. Families: notificationGroupId を新しいグループにする。条件は「家族がある」かつ「いまの値が読んだ値と同じ（なければ属性がない）」
 * 3. NotificationGroups: 前のグループを Delete（この家族のもの。実在したときだけ）
 */
export function buildRegisterNotificationGroupItems(
  input: RegisterNotificationGroupInput,
): RegisterNotificationGroupItems {
  const { currentGroupId } = input;
  const items: TransactItems = [
    notificationGroupRepository.buildPutItem(input.group),
    {
      Update: {
        TableName: tables.families(),
        Key: { familyId: input.familyId },
        UpdateExpression: 'SET notificationGroupId = :groupId',
        ConditionExpression: currentGroupId
          ? 'attribute_exists(familyId) AND notificationGroupId = :currentGroupId'
          : 'attribute_exists(familyId) AND attribute_not_exists(notificationGroupId)',
        ExpressionAttributeValues: {
          ':groupId': input.group.groupId,
          ...(currentGroupId ? { ':currentGroupId': currentGroupId } : {}),
        },
      },
    },
  ];
  const kinds: RegisterItemKind[] = ['newGroup', 'family'];
  if (currentGroupId && input.deletePreviousGroup) {
    items.push(notificationGroupRepository.buildDeleteItem(currentGroupId, input.familyId));
    kinds.push('previousGroup');
  }
  return { items, kinds };
}

/**
 * 登録の取引が断られた理由の並びを読み分ける（reliability-design.md の「登録・登録し直し」5）。
 * 新しいグループの条件 → 'newGroup'（読み直す。別の家族のものかもしれない）。
 * 家族・前のグループの条件、競合だけ → 'stale'（1 回だけやり直す）。ほかの Code は undefined（投げ直す）。
 */
export function classifyRegisterCancellation(
  reasons: { Code?: string }[] | undefined,
  kinds: RegisterItemKind[],
): 'newGroup' | 'stale' | undefined {
  if (!reasons) return undefined;
  const codes = cancellationCodes(reasons);
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'NOTIFICATION_GROUP_TRANSACTION_CANCELED', codes });
  if (reasons[kinds.indexOf('newGroup')]?.Code === 'ConditionalCheckFailed') return 'newGroup';
  if (codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')) {
    return 'stale';
  }
  return undefined;
}

export type RegisterNotificationGroupResult = 'registered' | 'group-taken' | 'stale';

/**
 * お知らせ先を登録する（置き換えを含む）。2〜3 件を 1 つの取引で書くので、どれかの条件が外れれば何も書かれない（NFR2.16）。
 * 断られたら 'group-taken'（新しいグループの条件）か 'stale'（読み直してやり直す）を返す。読み取れない失敗は投げ直す。
 */
export async function registerNotificationGroup(
  input: RegisterNotificationGroupInput,
): Promise<RegisterNotificationGroupResult> {
  const { items, kinds } = buildRegisterNotificationGroupItems(input);
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
    return 'registered';
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const outcome = classifyRegisterCancellation(err.CancellationReasons, kinds);
      if (outcome === 'newGroup') return 'group-taken';
      if (outcome === 'stale') return 'stale';
    }
    throw err;
  }
}

export interface UnregisterNotificationGroupInput {
  groupId: string;
  /** グループの記録が示す家族（読んだ値）。Delete の条件に使う */
  familyId: string;
}

/**
 * 解除の取引（TransactWriteItems）を組み立てる（reliability-design.md の「解除」2）。
 * 1. NotificationGroups: グループを Delete（条件は familyId = :thatFamily）
 * 2. Families: notificationGroupId を消す（条件は notificationGroupId = :groupId）
 */
export function buildUnregisterNotificationGroupItems(
  input: UnregisterNotificationGroupInput,
): TransactItems {
  return [
    notificationGroupRepository.buildDeleteItem(input.groupId, input.familyId),
    {
      Update: {
        TableName: tables.families(),
        Key: { familyId: input.familyId },
        UpdateExpression: 'REMOVE notificationGroupId',
        ConditionExpression: 'notificationGroupId = :groupId',
        ExpressionAttributeValues: { ':groupId': input.groupId },
      },
    },
  ];
}

/**
 * 解除の取引が断られた理由を読み分ける。ConditionalCheckFailed と TransactionConflict だけなら 'stale'
 * （読み直して 1 回だけやり直す）。ほかの Code や読み取れない失敗は undefined（投げ直す）。
 */
export function classifyUnregisterCancellation(
  reasons: { Code?: string }[] | undefined,
): 'stale' | undefined {
  const codes = cancellationCodes(reasons);
  if (codes.length === 0) return undefined;
  logger.warn({ event: 'NOTIFICATION_GROUP_TRANSACTION_CANCELED', operation: 'unregister', codes });
  return codes.every((c) => c === 'ConditionalCheckFailed' || c === 'TransactionConflict')
    ? 'stale'
    : undefined;
}

export type UnregisterNotificationGroupResult = 'unregistered' | 'stale';

/** お知らせ先を解除する。2 件を 1 つの取引で書く（NFR2.17）。断られたら 'stale' を返し、読み取れない失敗は投げ直す。 */
export async function unregisterNotificationGroup(
  input: UnregisterNotificationGroupInput,
): Promise<UnregisterNotificationGroupResult> {
  try {
    await docClient.send(
      new TransactWriteCommand({ TransactItems: buildUnregisterNotificationGroupItems(input) }),
    );
    return 'unregistered';
  } catch (err) {
    if (
      err instanceof TransactionCanceledException &&
      classifyUnregisterCancellation(err.CancellationReasons) === 'stale'
    ) {
      return 'stale';
    }
    throw err;
  }
}

export type RotateInvitationResult = 'created' | 'record-conflict' | 'stale';

/**
 * 招待を作り直す。4 件（前の招待がなければ 3 件）を 1 つの取引で書くので、どれかが失敗すればどれも書かれない（NFR2.10）。
 * 断られたときは理由の並びを見て 'record-conflict'（送り直し）か 'stale'（読み直してやり直す）を返す。
 * 理由が読み取れない失敗は投げ直す。
 */
export async function rotateInvitation(
  input: RotateInvitationInput,
  now: Date = new Date(),
): Promise<RotateInvitationResult> {
  const { items, kinds } = buildRotateInvitationItems(input, now);
  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
    return 'created';
  } catch (err) {
    if (err instanceof TransactionCanceledException) {
      const outcome = classifyCancellation(err.CancellationReasons, kinds);
      if (outcome === 'requestRecord') return 'record-conflict';
      if (outcome === 'stale') return 'stale';
    }
    throw err;
  }
}
