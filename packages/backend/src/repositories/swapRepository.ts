import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, tables } from '../lib/dynamoClient';
import type { DutyRecord, SwapOfferRecord } from '../models';
import {
  buildMonthGuard,
  CHECK_DUTY_UNCHANGED,
  dutySortKey,
  DUTY_UNCHANGED_NAMES,
  dutyUnchangedValues,
  writeTransaction,
} from './calendarRepository';

/**
 * 代わりにやるの申し出（U8）。Calendar テーブルの `SWAP#<dutyId>` の項目（1 つの担当に 1 項目）。
 * `M#` と重ならないので、月の Query にも種類の使用の確かめにも入らない。
 * 書き込みはすべて条件つきの UpdateItem（項目がなければ作られる）か取引で行い、
 * PutItem・DeleteItem・Scan・BatchGet・BatchWrite は使わない（BR9.19、NFR4.81）。
 * 条件式・更新式の属性名は、すべて # の別名で書く。
 */

export const swapSortKey = (dutyId: string): string => `SWAP#${dutyId}`;

const OFFER_NAMES = {
  '#status': 'status',
  '#offerId': 'offerId',
  '#updatedAt': 'updatedAt',
};

/** 申し出の項目を 1 つ読む（強い整合性の GetItem）。なければ undefined。 */
export async function getOffer(
  familyId: string,
  dutyId: string,
): Promise<SwapOfferRecord | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tables.calendar(),
      Key: { familyId, sk: swapSortKey(dutyId) },
      ConsistentRead: true,
    }),
  );
  if (!result.Item) return undefined;
  const offer = { ...result.Item } as SwapOfferRecord & { sk?: string };
  delete offer.sk;
  return offer;
}

/** 担当の ConditionCheck: 「未」・読んだ version・同じ担当・担当の子供が申し出た子供のまま */
function buildDutyCheck(duty: DutyRecord, version: number, childUserId: string) {
  return {
    ConditionCheck: {
      TableName: tables.calendar(),
      Key: {
        familyId: duty.familyId,
        sk: dutySortKey(duty.month, duty.date, duty.choreTypeId),
      },
      ConditionExpression: `${CHECK_DUTY_UNCHANGED} AND #childUserId = :child`,
      ExpressionAttributeNames: { ...DUTY_UNCHANGED_NAMES, '#childUserId': 'childUserId' },
      ExpressionAttributeValues: {
        ...dutyUnchangedValues({ ...duty, version }),
        ':child': childUserId,
      },
    },
  };
}

/**
 * 申し出を作る・上書きする（項目 3 つ）。担当そのものは書き換えない。
 * 項目がない、open でない、または dutyVersion が今の担当の version と違う（無効になった古い open）ときだけ書ける。
 */
export function buildCreateOfferItems(duty: DutyRecord, offerId: string, now: Date) {
  const iso = now.toISOString();
  return [
    {
      Update: {
        TableName: tables.calendar(),
        Key: { familyId: duty.familyId, sk: swapSortKey(duty.dutyId) },
        UpdateExpression:
          'SET #dutyId = :id, #offerId = :offerId, #offererUserId = :offerer, #dutyVersion = :v, ' +
          '#status = :open, #createdAt = :now, #updatedAt = :now REMOVE #acceptedByUserId, #acceptedAt',
        ConditionExpression: 'attribute_not_exists(#sk) OR #status <> :open OR #dutyVersion <> :v',
        ExpressionAttributeNames: {
          '#sk': 'sk',
          '#dutyId': 'dutyId',
          '#offerId': 'offerId',
          '#offererUserId': 'offererUserId',
          '#dutyVersion': 'dutyVersion',
          '#status': 'status',
          '#createdAt': 'createdAt',
          '#updatedAt': 'updatedAt',
          '#acceptedByUserId': 'acceptedByUserId',
          '#acceptedAt': 'acceptedAt',
        },
        ExpressionAttributeValues: {
          ':id': duty.dutyId,
          ':offerId': offerId,
          ':offerer': duty.childUserId,
          ':v': duty.version,
          ':open': 'open',
          ':now': iso,
        },
      },
    },
    buildDutyCheck(duty, duty.version, duty.childUserId),
    buildMonthGuard(duty.familyId, duty.month),
  ];
}

/**
 * 引き受ける（項目 3 つ）。担当の子供を引き受けた子供に変え origin を swap にし、申し出を accepted にする。
 * 全部書くか全部書かない。担当の状態・記録・単価は変えない。ChoreTypes は含めない。
 */
export function buildAcceptItems(
  duty: DutyRecord,
  offer: SwapOfferRecord,
  takerUserId: string,
  now: Date,
) {
  const iso = now.toISOString();
  return [
    {
      Update: {
        TableName: tables.calendar(),
        Key: {
          familyId: duty.familyId,
          sk: dutySortKey(duty.month, duty.date, duty.choreTypeId),
        },
        UpdateExpression:
          'SET #childUserId = :taker, #origin = :swap, #version = #version + :one, #updatedAt = :now',
        ConditionExpression: `${CHECK_DUTY_UNCHANGED} AND #childUserId = :offerer`,
        ExpressionAttributeNames: {
          ...DUTY_UNCHANGED_NAMES,
          '#childUserId': 'childUserId',
          '#origin': 'origin',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ...dutyUnchangedValues({ ...duty, version: offer.dutyVersion }),
          ':offerer': offer.offererUserId,
          ':taker': takerUserId,
          ':swap': 'swap',
          ':one': 1,
          ':now': iso,
        },
      },
    },
    {
      Update: {
        TableName: tables.calendar(),
        Key: { familyId: duty.familyId, sk: swapSortKey(duty.dutyId) },
        UpdateExpression:
          'SET #status = :accepted, #acceptedByUserId = :taker, #acceptedAt = :now, #updatedAt = :now',
        ConditionExpression: '#status = :open AND #offerId = :offerId',
        ExpressionAttributeNames: {
          ...OFFER_NAMES,
          '#acceptedByUserId': 'acceptedByUserId',
          '#acceptedAt': 'acceptedAt',
        },
        ExpressionAttributeValues: {
          ':accepted': 'accepted',
          ':open': 'open',
          ':offerId': offer.offerId,
          ':taker': takerUserId,
          ':now': iso,
        },
      },
    },
    buildMonthGuard(duty.familyId, duty.month),
  ];
}

/** 取り下げ（申し出の Update 1 つ）。open で、offerId が同じときだけ。担当には触れない。 */
export function buildWithdrawUpdate(familyId: string, dutyId: string, offerId: string, now: Date) {
  return {
    Update: {
      TableName: tables.calendar(),
      Key: { familyId, sk: swapSortKey(dutyId) },
      UpdateExpression: 'SET #status = :withdrawn, #updatedAt = :now',
      ConditionExpression: '#status = :open AND #offerId = :offerId',
      ExpressionAttributeNames: OFFER_NAMES,
      ExpressionAttributeValues: {
        ':withdrawn': 'withdrawn',
        ':open': 'open',
        ':offerId': offerId,
        ':now': now.toISOString(),
      },
    },
  };
}

/** 掃除（申し出の Update 1 つ）。項目があって open のときだけ。項目がなければ作らない。 */
export function buildCloseUpdate(familyId: string, dutyId: string, now: Date) {
  return {
    Update: {
      TableName: tables.calendar(),
      Key: { familyId, sk: swapSortKey(dutyId) },
      UpdateExpression: 'SET #status = :cancelled, #updatedAt = :now',
      ConditionExpression: 'attribute_exists(#sk) AND #status = :open',
      ExpressionAttributeNames: { '#sk': 'sk', '#status': 'status', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: {
        ':cancelled': 'cancelled',
        ':open': 'open',
        ':now': now.toISOString(),
      },
    },
  };
}

/** 申し出を作る（取引 1 回）。written か conflict（読み直してやり直す）。 */
export function createOffer(
  duty: DutyRecord,
  offerId: string,
  now: Date,
): Promise<'written' | 'conflict'> {
  return writeTransaction(buildCreateOfferItems(duty, offerId, now));
}

/** 引き受ける（取引 1 回）。written か conflict。 */
export function acceptOffer(
  duty: DutyRecord,
  offer: SwapOfferRecord,
  takerUserId: string,
  now: Date,
): Promise<'written' | 'conflict'> {
  return writeTransaction(buildAcceptItems(duty, offer, takerUserId, now));
}

/** 条件つきの UpdateItem を 1 回書く。条件で断られたら false（ほかの失敗は投げ直す）。 */
async function updateIfCondition(update: { Update: object }): Promise<boolean> {
  try {
    await docClient.send(
      new UpdateCommand(update.Update as ConstructorParameters<typeof UpdateCommand>[0]),
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

/** 取り下げる。書けたら written、条件で断られたら conflict。 */
export async function withdrawOffer(
  familyId: string,
  dutyId: string,
  offerId: string,
  now: Date,
): Promise<'written' | 'conflict'> {
  return (await updateIfCondition(buildWithdrawUpdate(familyId, dutyId, offerId, now)))
    ? 'written'
    : 'conflict';
}

/** 掃除する。open の項目を cancelled にしたら true。項目がない・open でないときは何もせず false。 */
export function closeOffer(familyId: string, dutyId: string, now: Date): Promise<boolean> {
  return updateIfCondition(buildCloseUpdate(familyId, dutyId, now));
}
