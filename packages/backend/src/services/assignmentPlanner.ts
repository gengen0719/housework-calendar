import {
  datesOfMonth,
  monthOfDate,
  shiftMonth,
  weekdayOf,
  type OverlapItem,
} from '@housework/shared';
import type { AssignmentRuleRecord, DutyRecord } from '../models';

/**
 * 割り当ての保存の計画を立てる純粋な関数たち（reliability-design.md の「割り当ての保存の全体の流れ」）。
 * DynamoDB にも時計にも触れない。今日（日本時間の `YYYY-MM-DD`）と新しい ID の作り方は引数で受け取る。
 */

/** TransactWriteItems の項目数の上限 */
export const TRANSACTION_ITEM_LIMIT = 100;

/**
 * 行を整える（BR6.3）。同じ種類と子供の行は曜日を合わせて 1 行にし、曜日は重なりを 1 つにして昇順に並べる。
 * 行は種類の ID、子供の ID の順に並べる（同じ入力からいつも同じ並びになる）。
 */
export function normalizeRules(rows: readonly AssignmentRuleRecord[]): AssignmentRuleRecord[] {
  const merged = new Map<string, { choreTypeId: string; childUserId: string; days: Set<number> }>();
  for (const row of rows) {
    const key = JSON.stringify([row.choreTypeId, row.childUserId]);
    const entry = merged.get(key) ?? {
      choreTypeId: row.choreTypeId,
      childUserId: row.childUserId,
      days: new Set<number>(),
    };
    for (const day of row.weekdays) entry.days.add(day);
    merged.set(key, entry);
  }
  return [...merged.values()]
    .sort(
      (a, b) =>
        compareText(a.choreTypeId, b.choreTypeId) || compareText(a.childUserId, b.childUserId),
    )
    .map((entry) => ({
      choreTypeId: entry.choreTypeId,
      childUserId: entry.childUserId,
      weekdays: [...entry.days].sort((a, b) => a - b),
    }));
}

/** 整えた行が同じ内容か（保存の送り直しで何も書かないための比べ） */
export function sameRules(
  a: readonly AssignmentRuleRecord[],
  b: readonly AssignmentRuleRecord[],
): boolean {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}

/** 文字の並びを（UTF-16 の順で）比べる。ロケールに左右されず、いつも同じ順になる。 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 「日付 + 種類」の組を表す印 */
const slotKey = (date: string, choreTypeId: string): string => JSON.stringify([date, choreTypeId]);

/**
 * 重なりを探す（BR6.4）。その月のすべての日（作る範囲かどうかにかかわらない）で、
 * 同じ日付・同じ種類に 2 人以上の子供が入る組をすべて返す。日付、種類の順。
 */
export function findOverlaps(month: string, rules: readonly AssignmentRuleRecord[]): OverlapItem[] {
  const byChore = new Map<string, AssignmentRuleRecord[]>();
  for (const rule of rules) {
    byChore.set(rule.choreTypeId, [...(byChore.get(rule.choreTypeId) ?? []), rule]);
  }
  const choreIds = [...byChore.keys()].sort(compareText);
  const overlaps: OverlapItem[] = [];
  for (const date of datesOfMonth(month)) {
    const weekday = weekdayOf(date);
    for (const choreTypeId of choreIds) {
      const children = new Set<string>();
      for (const rule of byChore.get(choreTypeId) ?? []) {
        if (rule.weekdays.includes(weekday)) children.add(rule.childUserId);
      }
      if (children.size >= 2) {
        overlaps.push({
          date,
          weekday,
          choreTypeId,
          childUserIds: [...children].sort(compareText),
        });
      }
    }
  }
  return overlaps;
}

/**
 * 担当を作る・作り直す日の範囲（BR6.5、BR6.6）。today は日本時間の今日。
 * 来月は 1 日から月末。今月は、割り当てがまだなければ今日から月末、あれば明日から月末。
 * 今月でも来月でもない月は空（呼び出し側が先に断る）。
 */
export function creationRange(month: string, today: string, hasAssignment: boolean): string[] {
  const thisMonth = monthOfDate(today);
  const dates = datesOfMonth(month);
  if (month === shiftMonth(thisMonth, 1)) return dates;
  if (month !== thisMonth) return [];
  return dates.filter((date) => (hasAssignment ? date > today : date >= today));
}

/** 作るべき担当（日付と種類ごとに子供 1 人。重なりがない前提） */
export interface DesiredDuty {
  date: string;
  choreTypeId: string;
  childUserId: string;
}

export function desiredDuties(
  range: readonly string[],
  rules: readonly AssignmentRuleRecord[],
): DesiredDuty[] {
  const desired: DesiredDuty[] = [];
  for (const date of range) {
    const weekday = weekdayOf(date);
    for (const rule of rules) {
      if (rule.weekdays.includes(weekday)) {
        desired.push({ date, choreTypeId: rule.choreTypeId, childUserId: rule.childUserId });
      }
    }
  }
  return desired;
}

/** 書く操作 */
export type DutyOperation =
  | { kind: 'delete'; duty: DutyRecord }
  | { kind: 'change'; duty: DutyRecord; toChildUserId: string }
  | { kind: 'create'; date: string; choreTypeId: string; childUserId: string; dutyId: string };

/** 確かめの一覧に入れる 1 行（印の計算にも使う）。toChildUserId が null なら担当がなくなる。 */
export interface HashedChange {
  date: string;
  choreTypeId: string;
  fromChildUserId: string;
  toChildUserId: string | null;
  version: number;
}

export interface Plan {
  operations: DutyOperation[];
  /** 日ごとに変えた担当・引き受けた担当を上書きする行（BR6.7）。日付、種類の順 */
  changes: HashedChange[];
}

const OPERATION_ORDER: Record<DutyOperation['kind'], number> = { delete: 0, change: 1, create: 2 };

function operationSlot(operation: DutyOperation): [string, string] {
  return operation.kind === 'create'
    ? [operation.date, operation.choreTypeId]
    : [operation.duty.date, operation.duty.choreTypeId];
}

/**
 * いまの担当と作るべき担当を比べて、書く操作を決める（BR6.6）。
 * - 範囲の外の担当は何もしない（今日と過ぎた日の担当は変えない）
 * - 「未」で子供が同じなら何もしない。違えば子供を変える。作るべき担当がなければ消す
 * - 「済」「×」は残し、その日のその種類に新しい担当も作らない
 * - 担当がなければ作る
 * 並べ方は決まった順（消す → 子供を変える → 作る、日付と種類の順）。
 */
export function planDutyChanges(input: {
  range: readonly string[];
  rules: readonly AssignmentRuleRecord[];
  existing: readonly DutyRecord[];
  newId: () => string;
}): Plan {
  const inRange = new Set(input.range);
  const desired = new Map(
    desiredDuties(input.range, input.rules).map((duty) => [
      slotKey(duty.date, duty.choreTypeId),
      duty,
    ]),
  );
  const existing = new Map(
    input.existing.map((duty) => [slotKey(duty.date, duty.choreTypeId), duty]),
  );

  const operations: DutyOperation[] = [];
  const changes: HashedChange[] = [];
  for (const duty of input.existing) {
    if (!inRange.has(duty.date) || duty.status !== 'todo') continue;
    const wanted = desired.get(slotKey(duty.date, duty.choreTypeId));
    const overwritten = duty.origin === 'manual' || duty.origin === 'swap';
    if (!wanted) {
      operations.push({ kind: 'delete', duty });
      if (overwritten) {
        changes.push(hashedChange(duty, null));
      }
    } else if (wanted.childUserId !== duty.childUserId) {
      operations.push({ kind: 'change', duty, toChildUserId: wanted.childUserId });
      if (overwritten) {
        changes.push(hashedChange(duty, wanted.childUserId));
      }
    }
  }
  for (const [key, wanted] of desired) {
    if (existing.has(key)) continue;
    operations.push({ kind: 'create', ...wanted, dutyId: input.newId() });
  }

  operations.sort((a, b) => {
    const [dateA, choreA] = operationSlot(a);
    const [dateB, choreB] = operationSlot(b);
    return (
      OPERATION_ORDER[a.kind] - OPERATION_ORDER[b.kind] ||
      compareText(dateA, dateB) ||
      compareText(choreA, choreB)
    );
  });
  changes.sort((a, b) => compareText(a.date, b.date) || compareText(a.choreTypeId, b.choreTypeId));
  return { operations, changes };
}

function hashedChange(duty: DutyRecord, to: string | null): HashedChange {
  return {
    date: duty.date,
    choreTypeId: duty.choreTypeId,
    fromChildUserId: duty.childUserId,
    toChildUserId: to,
    version: duty.version,
  };
}

/** 確かめの一覧の 1 行が同じか（5 つの値がすべて同じ） */
export function sameChange(a: HashedChange, b: HashedChange): boolean {
  return (
    a.date === b.date &&
    a.choreTypeId === b.choreTypeId &&
    a.fromChildUserId === b.fromChildUserId &&
    a.toChildUserId === b.toChildUserId &&
    a.version === b.version
  );
}

/** 一覧 `next` が `known` の部分集合か（空も含む。内部のやり直しの規則） */
export function isSubsetOfChanges(
  next: readonly HashedChange[],
  known: readonly HashedChange[],
): boolean {
  return next.every((row) => known.some((other) => sameChange(row, other)));
}

/** 書く項目の数え方（作る・消すは 2、子供を変えるは 1） */
export const itemsOf = (operation: DutyOperation): number => (operation.kind === 'change' ? 1 : 2);

/** チャンクの確かめの数 = 月の状態 1 + 作る・変えるに出る種類の数（消すだけなら種類の確かめは付けない） */
export function guardCount(operations: readonly DutyOperation[]): number {
  return 1 + guardedChoreTypeIds(operations).length;
}

/** 種類の確かめが要る種類（作る・変えるに出る種類。重なりなし、昇順） */
export function guardedChoreTypeIds(operations: readonly DutyOperation[]): string[] {
  const ids = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === 'create') ids.add(operation.choreTypeId);
    if (operation.kind === 'change') ids.add(operation.duty.choreTypeId);
  }
  return [...ids].sort(compareText);
}

/** チャンクの項目数（書く項目 + 確かめ）。100 を超えてはいけない */
export function chunkSize(operations: readonly DutyOperation[]): number {
  return (
    operations.reduce((sum, operation) => sum + itemsOf(operation), 0) + guardCount(operations)
  );
}

/**
 * 書く操作を、確かめも数えて 100 項目を超えない組に分ける（NFR2.28）。
 * 並べ方は渡された順のまま、足すと超えるところで区切る（同じ入力から同じチャンクになる）。
 */
export function splitIntoChunks(operations: readonly DutyOperation[]): DutyOperation[][] {
  const chunks: DutyOperation[][] = [];
  let current: DutyOperation[] = [];
  for (const operation of operations) {
    if (current.length > 0 && chunkSize([...current, operation]) > TRANSACTION_ITEM_LIMIT) {
      chunks.push(current);
      current = [];
    }
    current.push(operation);
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
