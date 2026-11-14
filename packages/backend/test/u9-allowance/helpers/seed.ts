/**
 * U9（お小遣いの額）の筋書き・単体テストの前提データ。U5・U7 の seed をそのまま使い、
 * 「済」の担当（単価の書き写しあり・なし・0 円）、抜けた子供、家族の作成時刻だけを足す。
 *
 * - 家族（管理者 1 人、子供 3 人。友だち登録済み）と種類は U5 の seedHousehold と U7 の単価で置く
 * - 「済」の担当には recordedAt・recordedBy・unitPrice を同時に置く（異常の確かめだけ unitPrice を外せる）
 * - 月の状態は seedMonthState（確定／未確定／行なし）
 */
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_CREATED_AT, FAMILY_ID } from '../../u2-invitation/helpers/seed';
import {
  CHILDREN,
  CHORES,
  calendarKey,
  dutyRefSk,
  dutySk,
  seedDuty,
  type ChildKey,
  type ChoreKey,
  type HouseholdTables,
} from '../../u5-assignment-calendar/helpers/seed';
import { seedHouseholdWithPrices } from '../../u7-review-confirm/helpers/seed';
import { FAKE_U9_DEPARTED_USER_ID } from '../../fixtures/fakeSecrets';

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
  storedDuty,
} from '../../u7-review-confirm/helpers/seed';
export { FAMILY_CREATED_AT, FAMILY_ID, PEOPLE } from '../../u2-invitation/helpers/seed';

/** 山田家（単価つき）を置く。 */
export function seedAllowanceHousehold(world: HouseholdTables): void {
  seedHouseholdWithPrices(world);
}

export interface SeedDoneOptions {
  dutyId: string;
  date: string;
  /** 担当の子供の ID。既定は太郎 */
  childUserId?: string;
  /** 種類の ID。既定は皿洗い */
  choreTypeId?: string;
  /** 書き写された単価。`null` を渡すと単価の項目そのものを置かない（異常のデータ） */
  unitPrice?: number | null;
  recordedBy?: string;
  recordedAt?: string;
  familyId?: string;
}

/** 「済」の担当を置く。unitPrice を `null` にすると、書き写しのない異常な「済」になる。 */
export function seedDone(calendar: Table, options: SeedDoneOptions): void {
  const childUserId = options.childUserId ?? CHILDREN.taro.userId;
  const choreTypeId = options.choreTypeId ?? CHORES.dishes.choreTypeId;
  const familyId = options.familyId ?? FAMILY_ID;
  seedDuty(calendar, {
    dutyId: options.dutyId,
    date: options.date,
    choreTypeId,
    childUserId,
    status: 'done',
    familyId,
    recordedAt: options.recordedAt ?? '2027-01-06T01:00:00.000Z',
    recordedBy: options.recordedBy ?? childUserId,
    ...(options.unitPrice === null ? {} : { unitPrice: options.unitPrice ?? 100 }),
  });
}

/** 担当の項目の単価だけを異常な値（undefined／null）に書き換える。 */
export function corruptUnitPrice(
  calendar: Table,
  date: string,
  choreTypeId: string,
  value: null | undefined,
  familyId = FAMILY_ID,
): void {
  const key = calendarKey(dutySk(date.slice(0, 7), date, choreTypeId), familyId);
  const item = calendar.get(key);
  if (!item) throw new Error('担当が置かれていません');
  const next = { ...item };
  if (value === null) next.unitPrice = null;
  else delete next.unitPrice;
  calendar.set(key, next);
}

/** 担当の項目の引き当て（DID#）を使わずに、担当が置かれているかを調べる。 */
export const hasDutyRef = (calendar: Table, dutyId: string, familyId = FAMILY_ID): boolean =>
  calendar.has(calendarKey(dutyRefSk(dutyId), familyId));

/**
 * 抜けた子供を置く。`familyId` を空（家族なし）または別の家族にした利用者。
 * 表示名を空にすると、名前が読めない抜けた子供（`Users` に項目がない）にするために項目そのものを置かない。
 */
export function seedDepartedChild(
  users: Table,
  options: {
    userId?: string;
    displayName?: string;
    /** 'none' は家族の欄が空、文字列は別の家族 */
    family?: 'none' | string;
    /** 利用者の項目そのものを置かない */
    missing?: boolean;
  } = {},
): string {
  const userId = options.userId ?? FAKE_U9_DEPARTED_USER_ID;
  if (options.missing) return userId;
  const family = options.family ?? 'none';
  users.set(userId, {
    userId,
    lineUserId: `U_departed_${userId.slice(-4)}`,
    displayName: options.displayName ?? '抜けた子',
    friendStatus: 'friend',
    registeredAt: FAMILY_CREATED_AT,
    friendStatusChangedAt: FAMILY_CREATED_AT,
    ...(family === 'none'
      ? {}
      : { familyId: family, role: 'child', familyJoinedAt: FAMILY_CREATED_AT }),
  });
  return userId;
}

/** 家族の作成時刻（UTC）を書き換える。月の移れる範囲（firstMonth）を作るため。 */
export function setFamilyCreatedAt(families: Table, createdAt: string, familyId = FAMILY_ID): void {
  const family = families.get(familyId);
  if (!family) throw new Error('家族が置かれていません');
  families.set(familyId, { ...family, createdAt });
}

/** Calendar の中で、月の担当の項目の数。 */
export function dutyCount(calendar: Table, familyId = FAMILY_ID): number {
  return [...calendar.values()].filter(
    (item) => item.familyId === familyId && String(item.sk).includes('#D#'),
  ).length;
}

export type { ChildKey as AllowanceChildKey, ChoreKey as AllowanceChoreKey };
