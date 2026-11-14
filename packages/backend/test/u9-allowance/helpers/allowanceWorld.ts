/**
 * U9 の計算（allowanceService）の筋書き・単体テストが共有する前提。
 * 山田家（管理者 1 人、子供 3 人。入った順は太郎、花子、次郎）、種類と単価、担当の置き方、文脈、内訳の文字化を置く。
 *
 * 単価（既定）: 皿洗い 100 円、洗濯物たたみ 150 円、ゴミ出し 50 円（「使う」）、お風呂洗い（「使わない」）。
 * 種類の並び: 皿洗い → 洗濯物たたみ → ゴミ出し → お風呂洗い（同じ登録時刻なので種類の ID の順）。
 */
import type { Allowance } from '@housework/shared';
import type {
  FamilyContext,
  ReadContext,
  SystemContext,
} from '../../../src/middleware/requireMembership';
import { fakeU9ChildId, fakeU9ChoreTypeId, fakeU9DutyId } from '../../fixtures/fakeSecrets';
import { setupWorld } from '../../u1-skeleton-family/helpers/world';
import { seedChoreType } from '../../u4-chore-types/helpers/seed';
import { setUnitPrice } from '../../u7-review-confirm/helpers/seed';
import { captureLogs, type CapturedLogs } from './logs';
import {
  CHILDREN,
  CHORES,
  FAMILY_ID,
  PEOPLE,
  seedAllowanceHousehold,
  seedDepartedChild,
  seedDone,
  seedDuty,
  type ChildKey,
  type ChoreKey,
} from './seed';

export { CHILDREN, CHORES, FAMILY_ID, PEOPLE };
export type { ChildKey, ChoreKey };

export type World = ReturnType<typeof setupWorld>;

export const MONTH = '2027-01';
export const SYSTEM_CTX: SystemContext = { familyId: FAMILY_ID, role: 'system' };

export const ctxAdmin = (): FamilyContext => ({
  familyId: FAMILY_ID,
  userId: PEOPLE.mother.userId,
  role: 'admin',
});
export const ctxChild = (key: ChildKey = 'taro'): FamilyContext => ({
  familyId: FAMILY_ID,
  userId: CHILDREN[key].userId,
  role: 'child',
});
export const asRead = (ctx: ReadContext): ReadContext => ctx;

/** 種類の既定の単価 */
export const PRICE = { dishes: 100, laundry: 150, garbage: 50 } as const;

/** 月 `YYYY-MM` の i 番目（0 から）の日付。1〜28 日を繰り返す。 */
export const dateOf = (index: number, month = MONTH): string =>
  `${month}-${String((index % 28) + 1).padStart(2, '0')}`;

export interface DoneSpec {
  date: string;
  chore?: ChoreKey;
  choreTypeId?: string;
  child?: ChildKey;
  childUserId?: string;
  /** 書き写された単価。null なら項目そのものを置かない。省略は種類の既定の単価 */
  price?: number | null;
  recordedBy?: string;
  recordedAt?: string;
}

export interface AllowanceWorld {
  world: World;
  logs: CapturedLogs;
  /** 「済」の担当を 1 件置く。担当の ID は連番で作る。置いた担当の ID を返す。 */
  done: (spec: DoneSpec) => string;
  /** 「未」「×」の担当を 1 件置く。 */
  other: (status: 'todo' | 'skipped', spec: DoneSpec) => string;
  /** 抜けた子供を置く（表示名を渡す。省略すると名前が読めない）。 */
  departed: (userId: string, displayName?: string) => string;
  /** 現在いる子供を 1 人足す（家族に入った時刻は指定の ISO） */
  addChild: (userId: string, displayName: string, joinedAt: string) => void;
  /** 種類を足す */
  addChore: (choreTypeId: string, name: string, unitPrice: number, active?: boolean) => void;
}

const priceOf = (chore: ChoreKey): number => {
  if (chore === 'dishes') return PRICE.dishes;
  if (chore === 'laundry') return PRICE.laundry;
  if (chore === 'garbage') return PRICE.garbage;
  return 90;
};

/** 山田家を置き、単価と入った順をそろえ、ログを集め始める。 */
export function setupAllowanceWorld(): AllowanceWorld {
  const world = setupWorld();
  seedAllowanceHousehold(world);
  setUnitPrice(world.choreTypes, CHORES.dishes.choreTypeId, PRICE.dishes);
  setUnitPrice(world.choreTypes, CHORES.laundry.choreTypeId, PRICE.laundry);
  setUnitPrice(world.choreTypes, CHORES.garbage.choreTypeId, PRICE.garbage);
  const joined = {
    taro: '2026-11-02T00:00:00.000Z',
    hanako: '2026-11-03T00:00:00.000Z',
    jiro: '2026-11-04T00:00:00.000Z',
  } as const;
  for (const key of Object.keys(joined) as ChildKey[]) {
    const item = world.users.get(CHILDREN[key].userId);
    if (item) world.users.set(CHILDREN[key].userId, { ...item, familyJoinedAt: joined[key] });
  }
  const logs = captureLogs();
  let seq = 0;
  const resolve = (spec: DoneSpec) => {
    seq += 1;
    const chore = spec.chore ?? 'dishes';
    return {
      dutyId: fakeU9DutyId(seq),
      choreTypeId: spec.choreTypeId ?? CHORES[chore].choreTypeId,
      childUserId: spec.childUserId ?? CHILDREN[spec.child ?? 'taro'].userId,
      price: spec.price === undefined ? priceOf(chore) : spec.price,
    };
  };
  return {
    world,
    logs,
    done: (spec) => {
      const r = resolve(spec);
      seedDone(world.calendar, {
        dutyId: r.dutyId,
        date: spec.date,
        childUserId: r.childUserId,
        choreTypeId: r.choreTypeId,
        unitPrice: r.price,
        ...(spec.recordedBy ? { recordedBy: spec.recordedBy } : {}),
        ...(spec.recordedAt ? { recordedAt: spec.recordedAt } : {}),
      });
      return r.dutyId;
    },
    other: (status, spec) => {
      const r = resolve(spec);
      seedDuty(world.calendar, {
        dutyId: r.dutyId,
        date: spec.date,
        childUserId: r.childUserId,
        choreTypeId: r.choreTypeId,
        status,
      });
      return r.dutyId;
    },
    departed: (userId, displayName) => {
      if (displayName === undefined)
        return seedDepartedChild(world.users, { userId, missing: true });
      return seedDepartedChild(world.users, { userId, displayName });
    },
    addChild: (userId, displayName, joinedAt) => {
      world.users.set(userId, {
        userId,
        lineUserId: `U_extra_${userId.slice(-4)}`,
        displayName,
        friendStatus: 'friend',
        registeredAt: joinedAt,
        friendStatusChangedAt: joinedAt,
        familyId: FAMILY_ID,
        role: 'child',
        familyJoinedAt: joinedAt,
      });
    },
    addChore: (choreTypeId, name, unitPrice, active = true) => {
      seedChoreType(world.choreTypes, { choreTypeId, name, unitPrice, active });
    },
  };
}

export { fakeU9ChildId, fakeU9ChoreTypeId, fakeU9DutyId };

/** 内訳の 1 行を「名前 単価 x 回数 = 小計」の文字にする（金額の表示の細部は見ない）。 */
export const lineText = (line: Allowance['lines'][number]): string =>
  `${line.choreName} ${line.unitPrice} x ${line.count} = ${line.amount}`;

/** 子供の行を表示名で探す。なければ投げる。 */
export function rowOf(allowances: readonly Allowance[], displayName: string): Allowance {
  const row = allowances.find((a) => a.displayName === displayName);
  if (!row) throw new Error(`${displayName} の行がありません`);
  return row;
}

/** ある表の読み取りの回数（操作は Get／Query）。 */
export function readCount(world: World, table?: string, operation?: 'Get' | 'Query'): number {
  return world.hooks.readLog.filter(
    (e) =>
      (table === undefined || e.table === table) &&
      (operation === undefined || e.operation === operation),
  ).length;
}
