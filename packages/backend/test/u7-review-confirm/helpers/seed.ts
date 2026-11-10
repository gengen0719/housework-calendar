/**
 * U7（確認・修正と確定）の筋書き・単体テストの前提データ。U5・U6 の seed をそのまま使い、
 * 状態ごとの担当（未・済・×）と、U7 が書く月の状態（confirmed・confirmedAt・confirmedByUserId・version）だけを足す。
 *
 * - 家族（管理者 1 人、子供 3 人）と種類（皿洗い 120 円ほか）は U5 の seedHousehold と U6 の単価で置く
 * - 「済」の担当には recordedAt・recordedBy・unitPrice を必ず 3 つ同時に置く（entities.md の不変条件）
 * - 月の状態は、確定した月／していない月／行のない月（行なし）の 3 とおりを作れる
 */

import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';
import {
  CHILDREN,
  CHORES,
  MONTH,
  calendarKey,
  dutySk,
  monthStateSk,
  seedDuty,
  seedHousehold,
  type HouseholdTables,
  type SeedDutyOptions,
} from '../../u5-assignment-calendar/helpers/seed';
import { setUnitPrice } from '../../u6-recording/helpers/seed';

export { setUnitPrice } from '../../u6-recording/helpers/seed';

export {
  CHILDREN,
  CHORES,
  MONTH,
  calendarKey,
  dutySk,
  monthStateSk,
  seedDuty,
  seedHousehold,
  type ChildKey,
  type ChoreKey,
} from '../../u5-assignment-calendar/helpers/seed';
export { FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';

/** U7 で使う種類の単価（皿洗い 120 円、洗濯物たたみ 80 円。要件の例）。 */
export const UNIT_PRICE = {
  dishes: 120,
  laundry: 80,
} as const;

/** 山田家 ＋ U7 の単価を置く。 */
export function seedHouseholdWithPrices(world: HouseholdTables): void {
  seedHousehold(world);
  setUnitPrice(world.choreTypes, CHORES.dishes.choreTypeId, UNIT_PRICE.dishes);
  setUnitPrice(world.choreTypes, CHORES.laundry.choreTypeId, UNIT_PRICE.laundry);
}

/** 「済」の担当を置く（recordedAt・recordedBy・unitPrice を 3 つ同時に。entities.md の不変条件）。 */
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

/** 「×」の担当を置く（記録の 3 項目は空）。 */
export function seedSkippedDuty(calendar: Table, options: Omit<SeedDutyOptions, 'status'>): void {
  seedDuty(calendar, { ...options, status: 'skipped' });
}

/**
 * 月の状態（確定・未確定）を置く。U7 は confirmedByUserId・version も書くので、ここでも置ける。
 * confirmed=true のとき confirmedAt・confirmedByUserId を 3 つそろえる（U7 の書き込みの形）。
 */
export function seedMonthState(
  calendar: Table,
  options: {
    month: string;
    confirmed: boolean;
    version?: number;
    confirmedAt?: string;
    confirmedByUserId?: string;
    familyId?: string;
  },
): void {
  const familyId = options.familyId ?? FAMILY_ID;
  const sk = monthStateSk(options.month);
  calendar.set(calendarKey(sk, familyId), {
    sk,
    familyId,
    month: options.month,
    confirmed: options.confirmed,
    version: options.version ?? (options.confirmed ? 1 : 0),
    ...(options.confirmed
      ? {
          confirmedAt: options.confirmedAt ?? '2027-02-01T00:00:00.000Z',
          confirmedByUserId: options.confirmedByUserId ?? PEOPLE.mother.userId,
        }
      : {}),
  });
}

/** Calendar の中のある担当の項目（状態の変更後の値の確かめ用）。 */
export function storedDuty(
  calendar: Table,
  date: string,
  choreTypeId: string,
  familyId = FAMILY_ID,
): Record<string, unknown> | undefined {
  const month = date.slice(0, 7);
  return calendar.get(calendarKey(dutySk(month, date, choreTypeId), familyId));
}

/** Calendar の中の月の状態の項目（確定・取り消しの後の値の確かめ用）。 */
export function storedMonthState(
  calendar: Table,
  month: string,
  familyId = FAMILY_ID,
): Record<string, unknown> | undefined {
  return calendar.get(calendarKey(monthStateSk(month), familyId));
}

/** 便利: 子供のキーから userId を引く。 */
export const childId = (key: keyof typeof CHILDREN): string => CHILDREN[key].userId;
/** 便利: 種類のキーから choreTypeId を引く。 */
export const choreId = (key: keyof typeof CHORES): string => CHORES[key].choreTypeId;
/** 便利: 管理者の userId。 */
export const adminId = (): string => PEOPLE.mother.userId;

export { MONTH as U7_MONTH };
