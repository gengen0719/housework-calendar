/**
 * U8（代わりにやる）の筋書き・単体テストの前提データ。U5・U6・U7 の seed をそのまま使い、
 * お知らせ先のグループの登録と、申し出の項目（`SWAP#<dutyId>`）だけを足す。
 *
 * - 家族（管理者 1 人、子供 3 人。友だち登録済み）と種類は U5 の seedHousehold と U6・U7 の単価で置く
 * - 担当は seedDuty（未・済・×。origin が rule／manual／swap。日付は過去・今日・未来）
 * - 月の状態は seedMonthState（確定／未確定／行なし）
 * - 申し出の項目は Calendar に直接置く（dutyVersion が今の担当の version と一致／不一致を作れる）
 */
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';
import {
  CHILDREN,
  CHORES,
  calendarKey,
  seedDuty,
  type HouseholdTables,
  type SeedDutyOptions,
} from '../../u5-assignment-calendar/helpers/seed';
import { seedHouseholdWithPrices } from '../../u7-review-confirm/helpers/seed';
import { FAKE_U8_GROUP_ID } from '../../fixtures/fakeSecrets';
export {
  CHILDREN,
  CHORES,
  MONTH,
  calendarKey,
  dutySk,
  monthStateSk,
  seedDuty,
  type ChildKey,
  type ChoreKey,
} from '../../u5-assignment-calendar/helpers/seed';
export {
  adminId,
  childId,
  choreId,
  seedHouseholdWithPrices,
  seedMonthState,
  seedSkippedDuty,
  storedDuty,
  storedMonthState,
} from '../../u7-review-confirm/helpers/seed';
export { FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';

/**
 * 「済」の担当を置く。記録の 3 項目（recordedAt・recordedBy・unitPrice）は、指定がなければ
 * 担当の子供が 2027-01-06 に記録した 120 円として同時に置く（entities.md の不変条件）。
 */
export function seedDoneDuty(calendar: Table, options: Omit<SeedDutyOptions, 'status'>): void {
  seedDuty(calendar, {
    recordedAt: '2027-01-06T01:00:00.000Z',
    recordedBy: options.childUserId,
    unitPrice: 120,
    ...options,
    status: 'done',
  });
}

/** 申し出の項目の sk。 */
export const swapSk = (dutyId: string): string => `SWAP#${dutyId}`;

export type OfferStatus = 'open' | 'accepted' | 'withdrawn' | 'cancelled';

export interface SeedOfferOptions {
  dutyId: string;
  offerId: string;
  offererUserId: string;
  /** 申し出を作ったときの担当の version（今の担当の version と同じなら有効） */
  dutyVersion: number;
  status?: OfferStatus;
  acceptedByUserId?: string;
  acceptedAt?: string;
  familyId?: string;
}

/** 申し出の項目（Calendar の `SWAP#<dutyId>`）を置く。accepted のときは受け手と時刻もそろえる。 */
export function seedOffer(calendar: Table, options: SeedOfferOptions): void {
  const familyId = options.familyId ?? FAMILY_ID;
  const sk = swapSk(options.dutyId);
  const status = options.status ?? 'open';
  calendar.set(calendarKey(sk, familyId), {
    sk,
    familyId,
    dutyId: options.dutyId,
    offerId: options.offerId,
    offererUserId: options.offererUserId,
    dutyVersion: options.dutyVersion,
    status,
    createdAt: '2027-01-06T00:00:00.000Z',
    updatedAt: '2027-01-06T00:00:00.000Z',
    ...(status === 'accepted'
      ? {
          acceptedByUserId: options.acceptedByUserId ?? CHILDREN.taro.userId,
          acceptedAt: options.acceptedAt ?? '2027-01-06T01:00:00.000Z',
        }
      : {}),
  });
}

/** Calendar の中の申し出の項目（引き受け・取り下げ・掃除の後の値の確かめ用）。 */
export function storedOffer(
  calendar: Table,
  dutyId: string,
  familyId = FAMILY_ID,
): Record<string, unknown> | undefined {
  return calendar.get(calendarKey(swapSk(dutyId), familyId));
}

/** Calendar の中の申し出の項目の数（作られない・増えないことの確かめ用）。 */
export function offerCount(calendar: Table): number {
  return [...calendar.values()].filter((item) => String(item.sk).startsWith('SWAP#')).length;
}

/** お知らせ先のグループを家族に登録する（Families と NotificationGroups の両方）。 */
export function seedNotificationGroup(
  world: Pick<HouseholdTables, 'families'> & { notificationGroups: Table },
  groupId: string = FAKE_U8_GROUP_ID,
  familyId = FAMILY_ID,
): void {
  const existing = world.families.get(familyId) ?? { familyId };
  world.families.set(familyId, { ...existing, notificationGroupId: groupId });
  world.notificationGroups.set(groupId, {
    groupId,
    familyId,
    registeredByUserId: PEOPLE.mother.userId,
    registeredAt: '2026-11-02T00:00:00.000Z',
  });
}

/** 山田家（単価つき）と、お知らせ先のグループを置く。 */
export function seedSwapHousehold(
  world: HouseholdTables & { notificationGroups: Table },
  groupId: string = FAKE_U8_GROUP_ID,
): void {
  seedHouseholdWithPrices(world);
  seedNotificationGroup(world, groupId);
}

/** 便利: 担当を置く（太郎・皿洗い・未の 1 件を既定にする）。 */
export function seedTodoDuty(
  calendar: Table,
  options: { dutyId: string; date: string; childUserId?: string; choreTypeId?: string },
): void {
  seedDuty(calendar, {
    dutyId: options.dutyId,
    date: options.date,
    choreTypeId: options.choreTypeId ?? CHORES.dishes.choreTypeId,
    childUserId: options.childUserId ?? CHILDREN.taro.userId,
  });
}
