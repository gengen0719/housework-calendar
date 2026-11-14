import { randomUUID } from 'node:crypto';
import {
  isEditableMonth,
  ok,
  type AssignmentView,
  type CalendarChild,
  type ChoreType,
  type Duty,
  type DutyStatus,
  type Member,
  type MonthCalendar,
  type Ok,
  type OverlapItem,
  type OverwriteChange,
  type StatusChangeAction,
} from '@housework/shared';
import { describeError, logger, setRequestMetrics } from '../lib/logger';
import type { FamilyContext, FamilyScope } from '../middleware/requireMembership';
import type { AssignmentRecord, AssignmentRuleRecord, DutyRecord } from '../models';
import * as calendarRepository from '../repositories/calendarRepository';
import type { MonthItems, TransactItems } from '../repositories/calendarRepository';
import {
  creationRange,
  findOverlaps,
  guardedChoreTypeIds,
  isSubsetOfChanges,
  normalizeRules,
  planDutyChanges,
  sameRules,
  splitIntoChunks,
  type DutyOperation,
  type HashedChange,
} from './assignmentPlanner';
import { computeChangesHash } from './changesHash';
import * as choreTypeService from './choreTypeService';
import { notifyDutyReassigned, type DutyReassignedEvent } from './dutyReassignedHook';
import * as familyMemberService from './familyMemberService';

/** 保存の書き込みが競合で断られたとき、読み直してやり直す回数（最初の 1 回を含めて 2 回。NFR2.29） */
const MAX_ATTEMPTS = 2;

/** チャンクを書く前に、これより残り時間が短ければ書かずに 500 にする（Lambda の 30 秒の時間切れの前。NFR2.28） */
const MIN_REMAINING_MS = 5000;

export type SaveAssignmentFailure =
  | {
      ok: false;
      reason:
        'NOT_FOUND' | 'CHORE_TYPE_INACTIVE' | 'MONTH_CONFIRMED' | 'MONTH_NOT_EDITABLE' | 'INTERNAL';
    }
  | { ok: false; reason: 'ASSIGNMENT_OVERLAP'; overlaps: OverlapItem[] }
  | {
      ok: false;
      reason: 'OVERWRITE_CONFIRMATION_REQUIRED';
      changes: OverwriteChange[];
      changesHash: string;
    };

export type SaveAssignmentOutcome = Ok<MonthCalendar> | SaveAssignmentFailure;

export interface SaveAssignmentOptions {
  /** 保存の時刻（createdAt・updatedAt に書く）。省略すると今 */
  now?: Date;
  /** Lambda の残り時間（ミリ秒）。省略すると見ない */
  remainingTimeMs?: () => number;
  /** 新しい担当の ID の作り方（テスト用） */
  newId?: () => string;
}

/** 保存のたびに読む状態（Calendar の月、C7 の種類の一覧、本文に出る子供） */
interface Snapshot {
  month: MonthItems;
  choreTypes: ChoreType[];
  /** 本文に出る子供のうち、その家族の子供と確かめられた人 */
  children: Map<string, CalendarChild>;
}

async function readSnapshot(
  ctx: FamilyContext,
  month: string,
  childUserIds: readonly string[],
): Promise<Snapshot> {
  const [items, choreTypes, found] = await Promise.all([
    calendarRepository.loadMonth(ctx.familyId, month),
    choreTypeService.list(ctx),
    Promise.all(childUserIds.map((userId) => familyMemberService.findFamilyChild(ctx, userId))),
  ]);
  const children = new Map<string, CalendarChild>();
  for (const result of found) {
    if (result.ok) children.set(result.value.userId, result.value);
  }
  return { month: items, choreTypes, children };
}

/**
 * 行の確かめと月の確かめ（security-design.md の順番）。全行をまとめて、次の順に判断する:
 * 種類がない（404）→ 種類が「使わない」（422）→ 子供がその家族の子供でない（404）→ 月の確定（409）→
 * 今月か来月か（422）→ 重なり（422）。やり直しの読み直し（retried）では、消えた種類も「使わない」と同じ扱い（422）。
 */
function judgeRequest(
  snapshot: Snapshot,
  month: string,
  today: string,
  rules: readonly AssignmentRuleRecord[],
  retried: boolean,
): SaveAssignmentFailure | undefined {
  const types = new Map(snapshot.choreTypes.map((type) => [type.choreTypeId, type]));
  if (rules.some((rule) => !types.has(rule.choreTypeId))) {
    return { ok: false, reason: retried ? 'CHORE_TYPE_INACTIVE' : 'NOT_FOUND' };
  }
  if (rules.some((rule) => types.get(rule.choreTypeId)?.active !== true)) {
    return { ok: false, reason: 'CHORE_TYPE_INACTIVE' };
  }
  if (rules.some((rule) => !snapshot.children.has(rule.childUserId))) {
    return { ok: false, reason: 'NOT_FOUND' };
  }
  if (snapshot.month.state?.confirmed === true) return { ok: false, reason: 'MONTH_CONFIRMED' };
  if (!isEditableMonth(month, today)) return { ok: false, reason: 'MONTH_NOT_EDITABLE' };
  const overlaps = findOverlaps(month, rules);
  if (overlaps.length > 0) return { ok: false, reason: 'ASSIGNMENT_OVERLAP', overlaps };
  return undefined;
}

/** 画面に返す変化の一覧（version は印の計算にだけ使い、返さない） */
const toOverwriteChange = (change: HashedChange): OverwriteChange => ({
  date: change.date,
  choreTypeId: change.choreTypeId,
  fromChildUserId: change.fromChildUserId,
  toChildUserId: change.toChildUserId,
});

/** チャンク 1 つ分の取引の項目（書く項目 + 月の確かめ + 種類の確かめ） */
function chunkItems(
  ctx: FamilyContext,
  month: string,
  chunk: readonly DutyOperation[],
  now: Date,
): TransactItems {
  const items: TransactItems = [];
  for (const operation of chunk) {
    if (operation.kind === 'create') {
      const at = now.toISOString();
      items.push(
        ...calendarRepository.buildCreateDutyItems({
          dutyId: operation.dutyId,
          familyId: ctx.familyId,
          month,
          date: operation.date,
          choreTypeId: operation.choreTypeId,
          childUserId: operation.childUserId,
          status: 'todo',
          origin: 'rule',
          version: 1,
          createdAt: at,
          updatedAt: at,
        }),
      );
    } else if (operation.kind === 'change') {
      items.push(
        calendarRepository.buildChangeChildItem(
          operation.duty,
          operation.toChildUserId,
          'rule',
          now,
        ),
      );
    } else {
      items.push(...calendarRepository.buildDeleteDutyItems(operation.duty));
    }
  }
  items.push(calendarRepository.buildMonthGuard(ctx.familyId, month));
  for (const choreTypeId of guardedChoreTypeIds(chunk)) {
    items.push(calendarRepository.buildChoreTypeGuard(ctx.familyId, choreTypeId));
  }
  return items;
}

/** 書けたチャンクの担当について、U8 が申し出を取り下げるための通知の中身 */
function reassignEvents(
  ctx: FamilyContext,
  chunk: readonly DutyOperation[],
): DutyReassignedEvent[] {
  return chunk.flatMap((operation): DutyReassignedEvent[] => {
    if (operation.kind === 'create') return [];
    const { duty } = operation;
    const base = {
      familyId: ctx.familyId,
      dutyId: duty.dutyId,
      date: duty.date,
      choreTypeId: duty.choreTypeId,
      fromChildUserId: duty.childUserId,
    };
    return operation.kind === 'change'
      ? [
          {
            ...base,
            kind: 'child-changed',
            toChildUserId: operation.toChildUserId,
            newOrigin: 'rule',
          },
        ]
      : [{ ...base, kind: 'deleted' }];
  });
}

/** 最後に書く割り当ての取引（割り当ての Put + 月の確かめ + 使う種類ごとの確かめ。最大 92 項目） */
function assignmentItems(
  ctx: FamilyContext,
  month: string,
  rules: readonly AssignmentRuleRecord[],
  now: Date,
): TransactItems {
  const choreTypeIds = calendarRepository.choreTypeIdsOf(rules);
  const record: AssignmentRecord = {
    familyId: ctx.familyId,
    month,
    rules: rules.map((rule) => ({ ...rule })),
    ...(choreTypeIds ? { choreTypeIds } : {}),
    updatedAt: now.toISOString(),
    updatedByUserId: ctx.userId,
  };
  return [
    calendarRepository.buildAssignmentPut(record),
    calendarRepository.buildMonthGuard(ctx.familyId, month),
    ...[...(choreTypeIds ?? [])]
      .sort()
      .map((choreTypeId) => calendarRepository.buildChoreTypeGuard(ctx.familyId, choreTypeId)),
  ];
}

/** 書き込みの進み具合（ログ用） */
interface Progress {
  written: number;
  total: number;
  created: number;
  changed: number;
  deleted: number;
}

function logFailure(
  ctx: FamilyContext,
  month: string,
  reason: string,
  progress: Progress,
  extra: Record<string, unknown> = {},
): void {
  const base = { familyId: ctx.familyId, userId: ctx.userId, month, reason, ...extra };
  if (progress.written > 0) {
    logger.warn({
      event: 'ASSIGNMENT_PARTIAL_FAILURE',
      ...base,
      writtenChunks: progress.written,
      totalChunks: progress.total,
    });
  } else {
    logger.info({ event: 'ASSIGNMENT_REJECTED', ...base });
  }
}

/**
 * 割り当てを保存する（C8 saveAssignment、F3、BR6.1〜BR6.8、BR6.18）。管理者かどうかは呼び出し側が確かめる。
 * 流れ（reliability-design.md）: 読む → 行と月の確かめ → 計画（いまの担当と作るべき担当を比べる）→ 上書きの確かめ →
 * 担当をチャンクに分けて順に書く → 最後に割り当てを書く → 読み直して MonthCalendar を返す。
 * 書き込みが競合で断られたら、書けたチャンクはそのままに、読み直して 1 回だけやり直す。2 回目も断られたら INTERNAL。
 */
export async function saveAssignment(
  ctx: FamilyContext,
  month: string,
  inputRules: readonly AssignmentRuleRecord[],
  confirmedChangesHash: string | undefined,
  today: string,
  options: SaveAssignmentOptions = {},
): Promise<SaveAssignmentOutcome> {
  const now = options.now ?? new Date();
  const newId = options.newId ?? randomUUID;
  const rules = normalizeRules(inputRules);
  const childUserIds = [...new Set(rules.map((rule) => rule.childUserId))];
  const progress: Progress = { written: 0, total: 0, created: 0, changed: 0, deleted: 0 };
  /** 最初の試行で、印が合った（または空だった）確かめの一覧。やり直しの部分集合の規則に使う（要求の間だけ持つ） */
  let confirmedKnown: HashedChange[] | undefined;

  const fail = (failure: SaveAssignmentFailure): SaveAssignmentFailure => {
    logFailure(ctx, month, failure.reason, progress);
    return failure;
  };

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const snapshot = await readSnapshot(ctx, month, childUserIds);
      const rejected = judgeRequest(snapshot, month, today, rules, attempt > 0);
      if (rejected) return fail(rejected);

      const existing = snapshot.month.assignment;
      const plan = planDutyChanges({
        range: creationRange(month, today, existing !== undefined),
        rules,
        existing: snapshot.month.duties,
        newId,
      });

      // 上書きされる日ごとの変更・引き受けがあれば、いまの一覧と同じ印がなければ断る（BR6.7）
      const currentHash = computeChangesHash(ctx.familyId, month, plan.changes);
      const confirmed =
        plan.changes.length === 0 ||
        confirmedChangesHash === currentHash ||
        (confirmedKnown !== undefined && isSubsetOfChanges(plan.changes, confirmedKnown));
      if (!confirmed) {
        return fail({
          ok: false,
          reason: 'OVERWRITE_CONFIRMATION_REQUIRED',
          changes: plan.changes.map(toOverwriteChange),
          changesHash: currentHash,
        });
      }
      if (attempt === 0) confirmedKnown = plan.changes;

      const written = await writePlan(
        ctx,
        month,
        plan.operations,
        rules,
        existing,
        now,
        progress,
        options,
      );
      if (written === 'conflict') {
        if (attempt + 1 < MAX_ATTEMPTS) continue;
        return fail({ ok: false, reason: 'INTERNAL' });
      }
      if (written === 'out-of-time') return fail({ ok: false, reason: 'INTERNAL' });

      const reread = await calendarRepository.loadMonth(ctx.familyId, month);
      const calendar = await buildMonthCalendar(ctx, month, today, reread, snapshot.choreTypes, {
        known: snapshot.children,
      });
      setRequestMetrics({ dutyCount: calendar.duties.length });
      logger.info({
        event: 'ASSIGNMENT_SAVED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        month,
        dutyCount: calendar.duties.length,
        created: progress.created,
        changed: progress.changed,
        deleted: progress.deleted,
        chunks: progress.total,
      });
      return ok(calendar);
    }
    return fail({ ok: false, reason: 'INTERNAL' });
  } catch (error) {
    // 思いがけない失敗（ThrottlingError など）。書けたチャンクがあれば部分的な失敗として残し、500 にする
    logFailure(ctx, month, 'INTERNAL', progress, describeError(error));
    throw error;
  }
}

/**
 * 計画を書く。担当のチャンクを順に書き、最後に割り当てを書く（割り当てがすでに同じ内容なら書かない）。
 * 競合で断られたら 'conflict'、残り時間が短ければ 'out-of-time'。
 */
async function writePlan(
  ctx: FamilyContext,
  month: string,
  operations: readonly DutyOperation[],
  rules: readonly AssignmentRuleRecord[],
  existing: AssignmentRecord | undefined,
  now: Date,
  progress: Progress,
  options: SaveAssignmentOptions,
): Promise<'written' | 'conflict' | 'out-of-time'> {
  const chunks = splitIntoChunks(operations);
  const needsAssignmentWrite = existing === undefined || !sameRules(existing.rules, rules);
  progress.total = chunks.length + (needsAssignmentWrite ? 1 : 0);
  const outOfTime = (): boolean =>
    options.remainingTimeMs !== undefined && options.remainingTimeMs() < MIN_REMAINING_MS;

  for (const chunk of chunks) {
    if (outOfTime()) return 'out-of-time';
    const outcome = await calendarRepository.writeTransaction(chunkItems(ctx, month, chunk, now));
    if (outcome === 'conflict') return 'conflict';
    progress.written++;
    for (const operation of chunk) {
      if (operation.kind === 'create') progress.created++;
      else if (operation.kind === 'change') progress.changed++;
      else progress.deleted++;
    }
    await notifyDutyReassigned(reassignEvents(ctx, chunk));
  }
  if (needsAssignmentWrite) {
    if (outOfTime()) return 'out-of-time';
    const outcome = await calendarRepository.writeTransaction(
      assignmentItems(ctx, month, rules, now),
    );
    if (outcome === 'conflict') return 'conflict';
    progress.written++;
  }
  return 'written';
}

/** 保存された割り当て（C8 getAssignment）。割り当てがなければ exists は false で行は空。 */
export async function getAssignment(ctx: FamilyContext, month: string): Promise<AssignmentView> {
  const record = await calendarRepository.getAssignment(ctx.familyId, month);
  return {
    month,
    rules: record ? normalizeRules(record.rules) : [],
    exists: record !== undefined,
  };
}

/**
 * 月の「済」の担当で、書き写された単価を持つものを返す（C8 listDoneDuties。U10・U11 向けの読み取り窓口）。
 * 月は担当の日付の月（記録した日ではない）。単価のない「済」（異常なデータ）は返さない。0 円は返す。
 * allowanceService は自分の loadMonth の結果を使い、この窓口を呼ばない（Query を 2 回にしない）。
 */
export async function listDoneDuties(ctx: FamilyScope, month: string): Promise<DutyRecord[]> {
  const items = await calendarRepository.loadMonth(ctx.familyId, month);
  return items.duties.filter(
    (duty) => duty.status === 'done' && duty.unitPrice !== undefined && duty.unitPrice !== null,
  );
}

/** 月が確定しているか（C8 isMonthConfirmed）。月の状態の行がなければ確定していない。 */
export async function isMonthConfirmed(ctx: FamilyScope, month: string): Promise<boolean> {
  const state = await calendarRepository.getMonthState(ctx.familyId, month);
  return state?.confirmed === true;
}

/** MonthCalendar を作るときの追加の材料 */
export interface BuildCalendarOptions {
  /** 確かめ済みの子供（C6 の一覧に足す） */
  known?: ReadonlyMap<string, CalendarChild>;
  /** 先に読んだ C6 のメンバー一覧（なければここで読む） */
  members?: readonly Member[];
}

/**
 * 月のカレンダー（C8 getMonthCalendar、F4、BR6.11、BR6.14、BR6.15）。家族のメンバー全員が見られる。
 * Calendar の Query（強い整合性・1 回）、C6 のメンバー一覧、C7 の種類の一覧を同時に読み、メモリで突き合わせる。
 * 読み取りの回数は担当の数で増えない（NFR1.21）。
 */
export async function getMonthCalendar(
  ctx: FamilyContext,
  month: string,
  today: string,
): Promise<MonthCalendar> {
  const [items, choreTypes, members] = await Promise.all([
    calendarRepository.loadMonth(ctx.familyId, month),
    choreTypeService.list(ctx),
    familyMemberService.listMembers(ctx),
  ]);
  const calendar = await buildMonthCalendar(ctx, month, today, items, choreTypes, { members });
  setRequestMetrics({ dutyCount: calendar.duties.length });
  return calendar;
}

/**
 * 読んだ月の項目から、画面に返す MonthCalendar を作る。
 * 子供は C6 のメンバー一覧（結果整合）に、確かめ済みの子供（known）を足す。担当にいる子供が一覧にいなければ、
 * 強い整合性で 1 人ずつ読んで補う（参加した直後の子供でも、表示名が出る。NFR4.45）。
 */
export async function buildMonthCalendar(
  ctx: FamilyContext,
  month: string,
  today: string,
  items: MonthItems,
  choreTypes: readonly ChoreType[],
  options: BuildCalendarOptions = {},
): Promise<MonthCalendar> {
  const members = options.members ?? (await familyMemberService.listMembers(ctx));
  const names = new Map(members.map((member) => [member.userId, member.displayName]));
  const children = new Map<string, CalendarChild>(
    members
      .filter((member) => member.role === 'child')
      .map((member) => [member.userId, { userId: member.userId, displayName: member.displayName }]),
  );
  for (const child of options.known?.values() ?? []) children.set(child.userId, child);
  const missing = [...new Set(items.duties.map((duty) => duty.childUserId))].filter(
    (childUserId) => !children.has(childUserId),
  );
  const found = await Promise.all(
    missing.map((childUserId) => familyMemberService.findFamilyChild(ctx, childUserId)),
  );
  for (const result of found) {
    if (result.ok) children.set(result.value.userId, result.value);
  }
  const typeById = new Map(choreTypes.map((type) => [type.choreTypeId, type]));
  const duties = items.duties.map((duty) => toDutyView(duty, typeById, names));
  const used = new Set(items.duties.map((duty) => duty.choreTypeId));
  return {
    month,
    confirmed: items.state?.confirmed === true,
    hasAssignment: items.assignment !== undefined,
    today,
    duties,
    children: [...children.values()],
    choreTypes: choreTypes
      .filter((type) => used.has(type.choreTypeId))
      .map((type) => ({ choreTypeId: type.choreTypeId, name: type.name, active: type.active })),
  };
}

function toDutyView(
  duty: DutyRecord,
  types: ReadonlyMap<string, { name: string }>,
  names: ReadonlyMap<string, string>,
): Duty {
  return {
    dutyId: duty.dutyId,
    date: duty.date,
    choreTypeId: duty.choreTypeId,
    choreName: types.get(duty.choreTypeId)?.name ?? '',
    childUserId: duty.childUserId,
    status: duty.status,
    origin: duty.origin,
    version: duty.version,
    recordedAt: duty.recordedAt ?? null,
    recordedBy: duty.recordedBy ?? null,
    recordedByName: duty.recordedBy ? (names.get(duty.recordedBy) ?? null) : null,
    unitPrice: duty.unitPrice ?? null,
  };
}

/** 担当の子供の変更が断られる理由（NOT_FOUND は担当か子供がない、ほかの家族のとき） */
export type ChangeDutyChildFailure = {
  ok: false;
  reason: 'NOT_FOUND' | 'MONTH_CONFIRMED' | 'DUTY_NOT_TODO' | 'INTERNAL';
};

export type ChangeDutyChildOutcome = Ok<Duty> | ChangeDutyChildFailure;

export interface ChangeDutyChildOptions {
  /** 保存の時刻（updatedAt に書く）。省略すると今 */
  now?: Date;
}

/** 書き込みが競合で断られたとき、読み直してやり直す回数（最初の 1 回を含めて 2 回。NFR2.30） */
const MAX_CHANGE_ATTEMPTS = 2;

function logChangeRejected(
  ctx: FamilyContext,
  dutyId: string,
  reason: ChangeDutyChildFailure['reason'],
): ChangeDutyChildFailure {
  logger.info({
    event: 'DUTY_CHANGE_REJECTED',
    familyId: ctx.familyId,
    userId: ctx.userId,
    dutyId,
    reason,
  });
  return { ok: false, reason };
}

/**
 * 日ごとの担当の子供を変える（C8 changeDutyChild、F4、BR6.9）。管理者かどうかは呼び出し側が確かめる。
 * 流れ（reliability-design.md の「日ごとの担当の変更」）: 引き当て・担当・月の状態を読む（404）→ 本文の子供を読む（呼び出し側の
 * 422）→ 子供の確かめ（404）→ 月の確定（409）→ 「未」か（409）→ 同じ子供なら書かずに返す → 2 項目の取引。
 * 断られたら読み直して理由を決め、version だけの競合なら 1 回だけやり直す。書けたら onDutyReassigned と DUTY_CHILD_CHANGED。
 * childUserId は関数でも渡せる（担当の 404 のあとに本文を読むため。NFR4.52）。
 */
export async function changeDutyChild(
  ctx: FamilyContext,
  dutyId: string,
  childUserId: string | (() => string),
  options: ChangeDutyChildOptions = {},
): Promise<ChangeDutyChildOutcome> {
  const now = options.now ?? new Date();
  let found = await calendarRepository.findDuty(ctx.familyId, dutyId);
  if (!found) return logChangeRejected(ctx, dutyId, 'NOT_FOUND');
  const wanted = typeof childUserId === 'function' ? childUserId() : childUserId;
  const child = await familyMemberService.findFamilyChild(ctx, wanted);
  if (!child.ok) return logChangeRejected(ctx, dutyId, 'NOT_FOUND');

  for (let attempt = 0; attempt < MAX_CHANGE_ATTEMPTS; attempt++) {
    const { duty, confirmed } = found;
    if (confirmed) return logChangeRejected(ctx, dutyId, 'MONTH_CONFIRMED');
    if (duty.status !== 'todo') return logChangeRejected(ctx, dutyId, 'DUTY_NOT_TODO');
    if (duty.childUserId === wanted) return ok(await dutyView(ctx, duty));

    const outcome = await calendarRepository.writeTransaction([
      calendarRepository.buildChangeChildItem(duty, wanted, 'manual', now),
      calendarRepository.buildMonthGuard(ctx.familyId, duty.month),
    ]);
    if (outcome === 'written') {
      const changed: DutyRecord = {
        ...duty,
        childUserId: wanted,
        origin: 'manual',
        version: duty.version + 1,
        updatedAt: now.toISOString(),
      };
      await notifyDutyReassigned([
        {
          familyId: ctx.familyId,
          dutyId,
          date: duty.date,
          choreTypeId: duty.choreTypeId,
          kind: 'child-changed',
          fromChildUserId: duty.childUserId,
          toChildUserId: wanted,
          newOrigin: 'manual',
        },
      ]);
      logger.info({
        event: 'DUTY_CHILD_CHANGED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        dutyId,
        date: duty.date,
        choreTypeId: duty.choreTypeId,
        fromChildUserId: duty.childUserId,
        toChildUserId: wanted,
      });
      return ok(await dutyView(ctx, changed));
    }
    // 断られた。読み直して、次の周で理由（404・409）を決める。version だけの競合なら 1 回だけやり直す
    if (attempt + 1 >= MAX_CHANGE_ATTEMPTS) break;
    found = await calendarRepository.findDuty(ctx.familyId, dutyId);
    if (!found) return logChangeRejected(ctx, dutyId, 'NOT_FOUND');
  }
  return logChangeRejected(ctx, dutyId, 'INTERNAL');
}

/**
 * 担当 1 件の画面用の形（種類の名前を C7 から読む）。
 * recordedBy があれば、家族のメンバー全員（管理者を含む）から表示名を引く（U7 の markDone は管理者。F2.5、BR6.13）。
 */
async function dutyView(ctx: FamilyContext, duty: DutyRecord): Promise<Duty> {
  const types = new Map<string, { name: string }>();
  const names = new Map<string, string>();
  // 呼び出し側は書き込みのあとに呼ぶ。読み取りが失敗しても 500 にせず、名前を空にして返す（警告は ID だけ）
  try {
    const type = await choreTypeService.get(ctx, duty.choreTypeId);
    if (type) types.set(type.choreTypeId, type);
    if (duty.recordedBy) {
      const members = await familyMemberService.listMembers(ctx);
      const member = members.find((m) => m.userId === duty.recordedBy);
      if (member) names.set(member.userId, member.displayName);
    }
  } catch {
    logger.warn({
      event: 'DUTY_VIEW_READ_FAILED',
      familyId: ctx.familyId,
      dutyId: duty.dutyId,
    });
  }
  return toDutyView(duty, types, names);
}

/**
 * 種類が割り当てか担当に一度でも使われたか（C8 isChoreTypeAssigned、BR6.10）。U4 の「消す」が使う。
 * 家族のキーの範囲の Query を強い整合性で読む（Scan なし、結果整合の索引なし。NFR1.22）。
 * 本物の取り付けは entries/api.ts（composition root）。
 */
export async function isChoreTypeAssigned(
  ctx: FamilyContext,
  choreTypeId: string,
): Promise<boolean> {
  return calendarRepository.isChoreTypeUsed(ctx.familyId, choreTypeId);
}

// --- U7: 状態の変更（changeDutyStatus）と月の確定・取り消し（confirmMonth・unconfirmMonth） ---

/** 状態の変更の取引が競合で断られたとき、読み直してやり直す回数（最初の 1 回を含めて 2 回。NFR2.45） */
const MAX_STATUS_ATTEMPTS = 2;

/** 状態の変更が断られる理由（ADMIN_ONLY は入口の requireAdmin で先に断るので、ここでは返さない） */
export type ChangeStatusFailure = {
  ok: false;
  reason: 'NOT_FOUND' | 'MONTH_CONFIRMED' | 'INVALID_TRANSITION' | 'INTERNAL';
};

export type ChangeStatusOutcome = Ok<Duty> | ChangeStatusFailure;

export interface ChangeDutyStatusOptions {
  /** 要求の入口で 1 回だけ取った時刻（recordedAt・updatedAt の元） */
  now: Date;
  /** 見せた時点の version。数でも、数を返す関数でも渡せる（本文を担当の 404 のあとで読むため） */
  version: number | (() => number);
}

/**
 * FR6.1 の表の判定（BR8.2）。いまの状態と action の組から、操作後の状態を返す。表になければ undefined。
 */
export function judgeTransition(
  status: DutyStatus,
  action: StatusChangeAction,
): DutyStatus | undefined {
  switch (action) {
    case 'cancel':
      return status === 'done' ? 'todo' : undefined; // 済 → 未
    case 'markDone':
      return status === 'todo' || status === 'skipped' ? 'done' : undefined; // 未・× → 済
    case 'markSkipped':
      return status === 'todo' || status === 'done' ? 'skipped' : undefined; // 未・済 → ×
    case 'unmarkSkipped':
      return status === 'skipped' ? 'todo' : undefined; // × → 未
  }
}

function logStatusRejected(
  ctx: FamilyContext,
  dutyId: string,
  action: StatusChangeAction,
  reason: ChangeStatusFailure['reason'],
): ChangeStatusFailure {
  logger.info({
    event: 'DUTY_STATUS_REJECTED',
    familyId: ctx.familyId,
    dutyId,
    action,
    reason,
  });
  return { ok: false, reason };
}

/**
 * 状態を変える（C8 changeDutyStatus、F2、BR8.2・BR8.4〜BR8.7、BR8.15・BR8.18、reliability-design.md）。
 * 管理者かどうかは呼び出し側（requireAdmin）が確かめる。version は数でも関数でも渡せる
 * （本文の 422 は担当の 404 のあと。U5・U6 と同じ）。
 * 流れ（for attempt in 1..2）: 探す（404）→ 月の確定（409）→ 見せた version との食い違い（409 INVALID_TRANSITION）→ 表（409）→ markDone は単価を読む →
 * 取引を 1 回書く → 断られたら読み直して 1 回だけやり直す → 2 回失敗で INTERNAL。
 * 書けたら DUTY_STATUS_CHANGED、担当が「未」でなくなったら notifyDutyReassigned を 1 回、更新後の Duty を返す。
 */
export async function changeDutyStatus(
  ctx: FamilyContext,
  dutyId: string,
  action: StatusChangeAction,
  options: ChangeDutyStatusOptions,
): Promise<ChangeStatusOutcome> {
  const { now } = options;
  const startedAt = Date.now();
  // version は担当の 404 のあとに解決する。関数なら 1 回だけ呼んで覚える（やり直しでも同じ値）
  let wantedVersion: number | undefined;
  const resolveVersion = (): number => {
    if (wantedVersion === undefined) {
      wantedVersion = typeof options.version === 'function' ? options.version() : options.version;
    }
    return wantedVersion;
  };

  for (let attempt = 0; attempt < MAX_STATUS_ATTEMPTS; attempt++) {
    const found = await calendarRepository.findDuty(ctx.familyId, dutyId);
    // 1 探す（家族の中だけ）
    if (!found) return logStatusRejected(ctx, dutyId, action, 'NOT_FOUND');
    const { duty, confirmed } = found;
    // 本文を読む（422 を投げる可能性があるので、担当の 404 のあとで呼ぶ）。見せた時点の version
    const shownVersion = resolveVersion();
    // 2 月の確定（担当の month で引く。今日の月ではない。NFR2.48）
    if (confirmed) return logStatusRejected(ctx, dutyId, action, 'MONTH_CONFIRMED');
    // 2.5 見せた version と違えば「先に変更された」（古い画面からの操作で上書きしない。BR8.4、NFR4.70）
    if (duty.version !== shownVersion) {
      return logStatusRejected(ctx, dutyId, action, 'INVALID_TRANSITION');
    }
    // 3 FR6.1 の表
    const toStatus = judgeTransition(duty.status, action);
    if (toStatus === undefined) {
      return logStatusRejected(ctx, dutyId, action, 'INVALID_TRANSITION');
    }

    // 4 markDone は書く直前に単価を読む
    let items;
    if (action === 'markDone') {
      const price = await choreTypeService.getCurrentUnitPrice(ctx, duty.choreTypeId);
      if (!price.ok) return logStatusRejected(ctx, dutyId, action, 'INTERNAL'); // 種類なし（起きない前提）
      items = calendarRepository.buildMarkDoneItems(duty, price.value, ctx, now, shownVersion);
    } else {
      items = calendarRepository.buildResetStatusItems(
        duty,
        toStatus as 'todo' | 'skipped',
        now,
        shownVersion,
      );
    }

    const outcome = await calendarRepository.writeTransaction(items);
    if (outcome === 'written') {
      const changed = applyStatusChange(duty, action, toStatus, ctx, now, items);
      logger.info({
        event: 'DUTY_STATUS_CHANGED',
        familyId: ctx.familyId,
        dutyId,
        action,
        fromStatus: duty.status,
        toStatus,
        durationMs: Date.now() - startedAt,
      });
      // 担当が「未」でなくなった（markDone・markSkipped）ときだけ、申し出の取り下げを呼ぶ（BR8.15）
      if (toStatus !== 'todo') {
        await notifyDutyReassigned([
          {
            familyId: ctx.familyId,
            dutyId,
            date: duty.date,
            choreTypeId: duty.choreTypeId,
            kind: 'status-changed',
            fromChildUserId: duty.childUserId,
          },
        ]);
      }
      return ok(await dutyView(ctx, changed));
    }
    // 競合で断られた。読み直して BR8.4 の判定を最初から（やり直しは 1 回まで）。
    // 読み直しは 1 回だけなので、次の試行があるときだけ DUTY_STATUS_RETRY を残す（observability-design.md）
    if (attempt + 1 < MAX_STATUS_ATTEMPTS) {
      logger.info({ event: 'DUTY_STATUS_RETRY', familyId: ctx.familyId, dutyId });
    }
  }
  // 2 回続けて断られた
  return logStatusRejected(ctx, dutyId, action, 'INTERNAL');
}

/** 取引が書けたあとの担当の形（画面に返す前の記録。markDone は 3 項目をそろえ、ほかは消す）。 */
function applyStatusChange(
  duty: DutyRecord,
  action: StatusChangeAction,
  toStatus: DutyStatus,
  ctx: FamilyContext,
  now: Date,
  items: TransactItems,
): DutyRecord {
  const at = now.toISOString();
  if (action === 'markDone') {
    // 単価は取引の担当の Update に入れた :price を使う（読んだ値）
    const update = (items[0] as { Update: { ExpressionAttributeValues: Record<string, unknown> } })
      .Update;
    return {
      ...duty,
      status: 'done',
      recordedAt: at,
      recordedBy: ctx.userId,
      unitPrice: update.ExpressionAttributeValues[':price'] as number,
      updatedAt: at,
      version: duty.version + 1,
    };
  }
  const { recordedAt: _a, recordedBy: _b, unitPrice: _c, ...rest } = duty;
  void _a;
  void _b;
  void _c;
  return { ...rest, status: toStatus, updatedAt: at, version: duty.version + 1 };
}

/**
 * 月を確定する（C8 confirmMonth、F3、BR8.11、BR8.14〜BR8.16、NFR2.46）。管理者かどうかは呼び出し側が確かめる。
 * 行の有無は条件つきの 1 回の書き込みで分ける（まず attribute_not_exists の Put、競合なら Update）。
 * 書けたら MONTH_CONFIRMED_SET を残し、その月で「未」でなくなった担当を一覧にして notifyDutyReassigned を 1 回。
 */
export async function confirmMonth(
  ctx: FamilyContext,
  month: string,
  options: { now: Date },
): Promise<void> {
  const putResult = await calendarRepository.putConfirmedMonthIfAbsent(ctx, month, options.now);
  if (putResult === 'exists') {
    await calendarRepository.updateMonthConfirmation(ctx, month, true, options.now);
  }
  logger.info({
    event: 'MONTH_CONFIRMED_SET',
    familyId: ctx.familyId,
    month,
    confirmed: true,
  });
  // その月で「未」でなくなる担当（確定の時点で「未」だった担当）を、担当ごとに status-changed の 1 件で渡す（R-01）。
  // 書き込みは済んでいるので、読み取りが失敗しても成功のまま返す（警告は familyId・month だけ。名前・単価は書かない）
  let items: MonthItems;
  try {
    items = await calendarRepository.loadMonth(ctx.familyId, month);
  } catch {
    logger.warn({
      event: 'CONFIRM_POST_READ_FAILED',
      familyId: ctx.familyId,
      month,
    });
    return;
  }
  const events: DutyReassignedEvent[] = items.duties
    .filter((duty) => duty.status === 'todo')
    .map((duty) => ({
      familyId: ctx.familyId,
      dutyId: duty.dutyId,
      date: duty.date,
      choreTypeId: duty.choreTypeId,
      kind: 'status-changed',
      fromChildUserId: duty.childUserId,
    }));
  if (events.length > 0) await notifyDutyReassigned(events);
}

/**
 * 月の確定を取り消す（C8 unconfirmMonth、F4、BR8.12、BR8.14）。管理者かどうかは呼び出し側が確かめる。
 * 行があれば confirmed=false にし、無ければ何もしない。notifyDutyReassigned は呼ばない（取り下げるのは確定のときだけ）。
 */
export async function unconfirmMonth(ctx: FamilyContext, month: string): Promise<void> {
  await calendarRepository.updateMonthConfirmation(ctx, month, false, new Date());
  logger.info({
    event: 'MONTH_CONFIRMED_SET',
    familyId: ctx.familyId,
    month,
    confirmed: false,
  });
}
