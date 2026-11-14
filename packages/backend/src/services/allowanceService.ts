/**
 * お小遣いの額の計算（U9。読み取り専用）。
 *
 * 子供ごと・月ごとの額を、その月の「済」の担当に書き写された単価 × 回数から、読むたびに計算する（保存しない。BR10.2、BR10.12）。
 * 読み取りは最大 4 段: (1) 月の担当・家族とメンバー・種類を同時に、(2) 抜けた子供の確かめ、(3) 加算・減額、(4) 組み立て。
 * どれかの読み取りが失敗したら一部だけを返さず、全体が失敗する（BR10.13）。
 *
 * 純粋な関数（tallyDuties・assembleAllowances・deriveRange）は、時計も DynamoDB も logger も呼ばない。
 * ログは窓口が、計算が最後まで成功したあとにまとめて出す（名前も金額も残さない。BR10.15）。
 * このファイルは lineApiService・swapService・calendarService・書き込みの窓口を import しない（NFR4.89）。
 */
import {
  ALLOWANCE_UNKNOWN_CHILD,
  ALLOWANCE_UNKNOWN_CHORE,
  jstDateOf,
  monthOfDate,
  shiftMonth,
  type Allowance,
  type AllowanceAdjustmentLine,
  type AllowanceChoreLine,
  type AllowanceMonthView,
} from '@housework/shared';
import { logger, setRequestMetrics } from '../lib/logger';
import { mapWithConcurrency } from '../lib/promise';
import type { FamilyScope, ReadContext } from '../middleware/requireMembership';
import type { DutyRecord } from '../models';
import { loadMonth } from '../repositories/calendarRepository';
import * as choreTypeService from './choreTypeService';
import { findDisplayName, findFamilyChild, loadFamilyAndMembers } from './familyMemberService';

/** 抜けた子供の確かめ（findFamilyChild → findDisplayName）を同時に動かす上限（NFR7.56） */
export const OWNER_LOOKUP_CONCURRENCY = 10;
/** 異常のログの行の上限（種類ごと。NFR2.75）。省いた分も anomalyCount に全数が入る */
export const ANOMALY_LOG_LIMIT = 20;

/**
 * 加算・減額の差し込み口（U11 が取り付ける。BR10.7、BR10.18）。
 * 家族・月・行を出す子供の ID の一覧を受け取り、子供ごとの加算・減額の行を返す。既定は空。
 */
export type AdjustmentSource = (
  scope: FamilyScope,
  month: string,
  childUserIds: readonly string[],
) => Promise<ReadonlyMap<string, readonly AllowanceAdjustmentLine[]>>;

export interface GetAllowancesOptions {
  adjustments?: AdjustmentSource;
}

// ─────────────────────────────────────────────────────────────
// 純粋な関数
// ─────────────────────────────────────────────────────────────

/** (種類, 単価) ごとにまとめた回数 */
export interface TalliedLine {
  choreTypeId: string;
  unitPrice: number;
  count: number;
}

/** 異常の記録（ログは出さない。窓口が出す。ADR-U9-07） */
export interface AnomalyReport {
  /** 「済」なのに単価が空だった担当の ID（担当の並び順のまま。全数） */
  withoutPrice: string[];
  /** 担当の子供が管理者の ID だった担当の ID（全数） */
  ownerNotChild: string[];
  /** 種類が一覧になかった種類の ID → 該当した担当の数 */
  choreTypeMissing: Map<string, number>;
}

export interface TallyResult {
  /** 子供の ID → 内訳（(種類, 単価) ごと）。数えた担当がある子供だけ */
  byChild: Map<string, TalliedLine[]>;
  anomalies: AnomalyReport;
  /** 数えた「済」の数（異常で数えなかった担当を除く） */
  doneCount: number;
}

/**
 * 「済」だけを取り出して、子供ごと・(種類, 単価)ごとに数える（BR10.2〜BR10.4、BR10.13）。
 * 単価が undefined／null の「済」は数えず異常に記録する（0 円は有効）。持ち主が管理者の担当も数えず記録する。
 * 種類が一覧にない担当は数えて（名前は組み立てで「不明なお手伝い」にする）、異常に記録する。
 */
export function tallyDuties(
  duties: readonly DutyRecord[],
  adminUserIds: ReadonlySet<string>,
  knownChoreTypeIds: ReadonlySet<string>,
): TallyResult {
  const grouped = new Map<string, Map<string, TalliedLine>>();
  const anomalies: AnomalyReport = {
    withoutPrice: [],
    ownerNotChild: [],
    choreTypeMissing: new Map(),
  };
  let doneCount = 0;
  for (const duty of duties) {
    if (duty.status !== 'done') continue;
    const price = duty.unitPrice as number | null | undefined;
    if (price === undefined || price === null) {
      anomalies.withoutPrice.push(duty.dutyId);
      continue;
    }
    if (adminUserIds.has(duty.childUserId)) {
      anomalies.ownerNotChild.push(duty.dutyId);
      continue;
    }
    if (!knownChoreTypeIds.has(duty.choreTypeId)) {
      anomalies.choreTypeMissing.set(
        duty.choreTypeId,
        (anomalies.choreTypeMissing.get(duty.choreTypeId) ?? 0) + 1,
      );
    }
    doneCount += 1;
    let lines = grouped.get(duty.childUserId);
    if (!lines) {
      lines = new Map();
      grouped.set(duty.childUserId, lines);
    }
    const key = `${duty.choreTypeId}\u0000${price}`;
    const line = lines.get(key);
    if (line) line.count += 1;
    else lines.set(key, { choreTypeId: duty.choreTypeId, unitPrice: price, count: 1 });
  }
  const byChild = new Map<string, TalliedLine[]>();
  for (const [childUserId, lines] of grouped) byChild.set(childUserId, [...lines.values()]);
  return { byChild, anomalies, doneCount };
}

/** 文字の並びを（UTF-16 の順で）比べる。ロケールに左右されず、いつも同じ順になる。 */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ChildName {
  userId: string;
  displayName: string;
}

/** 表示名、同じなら userId の順 */
export const compareChildren = (a: ChildName, b: ChildName): number =>
  compareText(a.displayName, b.displayName) || compareText(a.userId, b.userId);

/**
 * 行を出す子供の並び（BR10.6）: 今いる子供はそのまま（家族に入った順）、そのあとに抜けた子供を表示名、userId の順。
 */
export function orderChildren(
  currentChildren: readonly ChildName[],
  departedChildren: readonly ChildName[],
): (ChildName & { current: boolean })[] {
  return [
    ...currentChildren.map((child) => ({ ...child, current: true })),
    ...[...departedChildren].sort(compareChildren).map((child) => ({ ...child, current: false })),
  ];
}

export interface AssembleInput {
  month: string;
  /** 今いる子供（家族に入った順） */
  currentChildren: readonly ChildName[];
  /** 「済」のある抜けた子供（並びは中で決める） */
  departedChildren: readonly ChildName[];
  /** 子供の ID → 内訳（tallyDuties の byChild） */
  lines: ReadonlyMap<string, readonly TalliedLine[]>;
  /** 種類の並び（C7 の list の並び）と今の名前 */
  choreTypes: readonly { choreTypeId: string; name: string }[];
  /** 子供の ID → 加算・減額の行 */
  adjustments: ReadonlyMap<string, readonly AllowanceAdjustmentLine[]>;
}

/**
 * 子供ごとの答え（Allowance）を組み立てる（BR10.4〜BR10.7）。
 * 行は種類の並び → 単価の低い順（種類が一覧にないものは「不明なお手伝い」で最後）。
 * total = 内訳の和 + 加算・減額の和。0 円を下回ってもそのまま（NFR2.69）。許可した項目だけを 1 つずつ書く（NFR4.91）。
 */
export function assembleAllowances(input: AssembleInput): Allowance[] {
  const order = new Map(input.choreTypes.map((type, index) => [type.choreTypeId, index]));
  const names = new Map(input.choreTypes.map((type) => [type.choreTypeId, type.name]));
  return orderChildren(input.currentChildren, input.departedChildren).map((child) => {
    const lines: AllowanceChoreLine[] = [...(input.lines.get(child.userId) ?? [])]
      .sort(
        (a, b) =>
          (order.get(a.choreTypeId) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.choreTypeId) ?? Number.MAX_SAFE_INTEGER) ||
          compareText(a.choreTypeId, b.choreTypeId) ||
          a.unitPrice - b.unitPrice,
      )
      .map((line) => ({
        choreTypeId: line.choreTypeId,
        choreName: names.get(line.choreTypeId) ?? ALLOWANCE_UNKNOWN_CHORE,
        unitPrice: line.unitPrice,
        count: line.count,
        amount: line.unitPrice * line.count,
      }));
    const adjustments: AllowanceAdjustmentLine[] = (input.adjustments.get(child.userId) ?? []).map(
      (adjustment) => ({
        adjustmentId: adjustment.adjustmentId,
        amount: adjustment.amount,
        reason: adjustment.reason,
      }),
    );
    const total =
      lines.reduce((sum, line) => sum + line.amount, 0) +
      adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0);
    return {
      childUserId: child.userId,
      displayName: child.displayName,
      current: child.current,
      month: input.month,
      lines,
      adjustments,
      total,
    };
  });
}

/**
 * 月を移れる範囲（BR10.8）。firstMonth は家族の作成時刻（UTC）を日本時間の月にしたもの、
 * lastMonth は日本時間の今日の月の翌月。
 */
export function deriveRange(
  createdAtUtc: string,
  todayJst: string,
): { firstMonth: string; lastMonth: string } {
  return {
    firstMonth: monthOfDate(jstDateOf(new Date(createdAtUtc))),
    lastMonth: shiftMonth(monthOfDate(todayJst), 1),
  };
}

// ─────────────────────────────────────────────────────────────
// 窓口
// ─────────────────────────────────────────────────────────────

interface Computed {
  allowances: Allowance[];
  confirmed: boolean;
  familyCreatedAt: string;
  /** 計算が最後まで成功したあとにだけ呼ぶ。異常の行（warn）→ ALLOWANCE_COMPUTED（info）を出す */
  emit: () => void;
}

async function compute(
  ctx: ReadContext,
  month: string,
  options: GetAllowancesOptions,
): Promise<Computed> {
  const startedAt = Date.now();
  const scope: FamilyScope = { familyId: ctx.familyId };

  // 段 1: 月の担当・家族とメンバー・種類を同時に読み始める
  const [monthItems, { family, members }, choreTypes] = await Promise.all([
    loadMonth(ctx.familyId, month),
    loadFamilyAndMembers(ctx),
    choreTypeService.list(scope),
  ]);

  const adminUserIds = new Set(members.filter((m) => m.role === 'admin').map((m) => m.userId));
  const currentChildren: ChildName[] = members
    .filter((m) => m.role === 'child')
    .map(({ userId, displayName }) => ({ userId, displayName }));
  const tally = tallyDuties(
    monthItems.duties,
    adminUserIds,
    new Set(choreTypes.map((type) => type.choreTypeId)),
  );

  // 段 2: 一覧にいない持ち主を、子供ごとの連なりで確かめる（10 並行まで。1 人が投げたら新しい確かめを始めない）
  const listedIds = new Set(currentChildren.map((c) => c.userId));
  const unlisted = [...tally.byChild.keys()].filter((id) => !listedIds.has(id)).sort(compareText);
  const lagging: ChildName[] = [];
  const departed: ChildName[] = [];
  await mapWithConcurrency(
    unlisted,
    OWNER_LOOKUP_CONCURRENCY,
    async (userId) => {
      const child = await findFamilyChild(scope, userId);
      if (child.ok) {
        lagging.push({ userId, displayName: child.value.displayName });
        return;
      }
      const name = await findDisplayName(scope, userId);
      departed.push({ userId, displayName: name.ok ? name.value : ALLOWANCE_UNKNOWN_CHILD });
    },
    { stopAfterFailure: true },
  );
  const current = [...currentChildren, ...lagging.sort(compareChildren)];

  // 段 3: 加算・減額（差し込み口。既定は空）
  const ordered = orderChildren(current, departed);
  const adjustments = options.adjustments
    ? await options.adjustments(
        scope,
        month,
        ordered.map((child) => child.userId),
      )
    : new Map<string, readonly AllowanceAdjustmentLine[]>();

  // 段 4: 組み立て
  const allowances = assembleAllowances({
    month,
    currentChildren: current,
    departedChildren: departed,
    lines: tally.byChild,
    choreTypes,
    adjustments,
  });

  const dutyCount = monthItems.duties.length;
  const { anomalies } = tally;
  const anomalyCount =
    anomalies.withoutPrice.length +
    anomalies.ownerNotChild.length +
    [...anomalies.choreTypeMissing.values()].reduce((sum, n) => sum + n, 0);

  const emit = (): void => {
    setRequestMetrics({ dutyCount });
    for (const dutyId of anomalies.withoutPrice.slice(0, ANOMALY_LOG_LIMIT)) {
      logger.warn({ event: 'ALLOWANCE_DUTY_WITHOUT_PRICE', familyId: ctx.familyId, dutyId });
    }
    for (const choreTypeId of [...anomalies.choreTypeMissing.keys()]
      .sort(compareText)
      .slice(0, ANOMALY_LOG_LIMIT)) {
      logger.warn({ event: 'ALLOWANCE_CHORE_TYPE_MISSING', familyId: ctx.familyId, choreTypeId });
    }
    for (const dutyId of anomalies.ownerNotChild.slice(0, ANOMALY_LOG_LIMIT)) {
      logger.warn({ event: 'ALLOWANCE_DUTY_OWNER_NOT_CHILD', familyId: ctx.familyId, dutyId });
    }
    logger.info({
      event: 'ALLOWANCE_COMPUTED',
      familyId: ctx.familyId,
      month,
      childCount: allowances.length,
      lineCount: allowances.reduce((sum, a) => sum + a.lines.length, 0),
      dutyCount,
      doneCount: tally.doneCount,
      departedChildCount: allowances.filter((a) => !a.current).length,
      anomalyCount,
      durationMs: Date.now() - startedAt,
    });
  };

  return {
    allowances,
    confirmed: monthItems.state?.confirmed === true,
    familyCreatedAt: family.createdAt,
    emit,
  };
}

/**
 * 窓口（契約 C9）: 家族の全員分のお小遣いを返す。管理者でなくてよく、role: system の文脈（U10）でも呼べる。
 * 失敗は投げる（一部だけ返さない）。
 */
export async function getAllowances(
  ctx: ReadContext,
  month: string,
  options: GetAllowancesOptions = {},
): Promise<Allowance[]> {
  const computed = await compute(ctx, month, options);
  computed.emit();
  return computed.allowances;
}

/** 画面 S5 用: 確定の有無・今日・月を移れる範囲を添えて返す（BR10.8、BR10.9）。 */
export async function getAllowanceMonthView(
  ctx: ReadContext,
  month: string,
  options: GetAllowancesOptions & { today: string },
): Promise<AllowanceMonthView> {
  const computed = await compute(ctx, month, options);
  const range = deriveRange(computed.familyCreatedAt, options.today);
  computed.emit();
  return {
    month,
    confirmed: computed.confirmed,
    today: options.today,
    firstMonth: range.firstMonth,
    lastMonth: range.lastMonth,
    allowances: computed.allowances,
  };
}
