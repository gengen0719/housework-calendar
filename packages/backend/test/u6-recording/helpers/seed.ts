/**
 * U6（記録）の筋書きの前提データ。U5 の seed をそのまま使い、記録に要るものだけ足す。
 *
 * - 家族（管理者 1 人、子供 3 人）と種類（皿洗い 100 円、洗濯物たたみ 80 円）は U5 の seedHousehold と seedChoreType で置く
 * - 今日の担当（状態ごと: 未・済・×）、確定した月、単価の項目は Calendar と ChoreTypes に直接置く
 * - 「済」の担当には recordedAt・recordedBy・unitPrice を必ず 3 つ同時に置く（entities.md の決まり）
 */

import type { ChoreTypeRecord } from '../../../src/models';
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../../u2-invitation/helpers/seed';
import {
  CHILDREN,
  CHORES,
  MONTH,
  calendarKey,
  dutySk,
  seedDuty,
  seedHousehold,
  type HouseholdTables,
  type SeedDutyOptions,
} from '../../u5-assignment-calendar/helpers/seed';

export {
  CHILDREN,
  CHORES,
  MONTH,
  calendarKey,
  dutySk,
  seedDuty,
  seedHousehold,
  seedMonthState,
  type ChildKey,
  type ChoreKey,
} from '../../u5-assignment-calendar/helpers/seed';
export { FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';

/** U6 で使う種類の単価（皿洗い 100 円、洗濯物たたみ 80 円）。 */
export const UNIT_PRICE = {
  dishes: 100,
  laundry: 80,
} as const;

/**
 * 種類の単価を上書きして置く（U5 の seedChoreType は固定の単価なので、U6 は単価を指定して置き直す）。
 * 既に置かれている種類の unitPrice だけを書き換える。
 */
export function setUnitPrice(choreTypes: Table, choreTypeId: string, unitPrice: number): void {
  const key = `${FAMILY_ID}#TYPE#${choreTypeId}`;
  const existing = choreTypes.get(key) as ChoreTypeRecord | undefined;
  if (existing) choreTypes.set(key, { ...existing, unitPrice });
}

/**
 * 山田家 ＋ U6 の単価（皿洗い 100 円、洗濯物たたみ 80 円）を置く。
 * seedHousehold のあと、皿洗いと洗濯物たたみの単価を U6 の値にそろえる。
 */
export function seedHouseholdWithPrices(world: HouseholdTables): void {
  seedHousehold(world);
  setUnitPrice(world.choreTypes, CHORES.dishes.choreTypeId, UNIT_PRICE.dishes);
  setUnitPrice(world.choreTypes, CHORES.laundry.choreTypeId, UNIT_PRICE.laundry);
}

/** 「済」の担当を置く（recordedAt・recordedBy・unitPrice を 3 つ同時に。entities.md の決まり）。 */
export function seedDoneDuty(
  calendar: Table,
  options: Omit<SeedDutyOptions, 'status'> & {
    recordedAt: string;
    recordedBy: string;
    unitPrice: number;
  },
): void {
  seedDuty(calendar, { ...options, status: 'done' });
}

/** Calendar の中のある担当の項目（記録後の値の確かめ用）。 */
export function storedDuty(
  calendar: Table,
  date: string,
  choreTypeId: string,
  familyId = FAMILY_ID,
): Record<string, unknown> | undefined {
  const month = date.slice(0, 7);
  return calendar.get(calendarKey(dutySk(month, date, choreTypeId), familyId));
}

/** 便利: 子供のキーから userId を引く。 */
export const childId = (key: keyof typeof CHILDREN): string => CHILDREN[key].userId;
/** 便利: 種類のキーから choreTypeId を引く。 */
export const choreId = (key: keyof typeof CHORES): string => CHORES[key].choreTypeId;

export { MONTH as U6_MONTH };
