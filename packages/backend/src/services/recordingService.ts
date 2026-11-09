import { jstDateOf, jstTimeOf } from '@housework/shared';
import { logger } from '../lib/logger';
import type { FamilyContext } from '../middleware/requireMembership';
import type { DutyRecord } from '../models';
import * as calendarRepository from '../repositories/calendarRepository';
import type { DutyWithState } from '../repositories/calendarRepository';
import * as choreTypeService from './choreTypeService';
import { notifyDutyRecorded } from './dutyRecordedHook';

/** 記録の競合で読み直してやり直す回数（最初の 1 回を含めて 2 回。NFR2.34、reliability-design.md） */
const MAX_ATTEMPTS = 2;

/** 選べる担当（status=todo）。LINE の選択肢のボタンに使う（dutyId・種類の名前・見せた時点の version） */
export interface SelectableDuty {
  dutyId: string;
  choreTypeId: string;
  choreName: string;
  version: number;
}

/** 選べない担当（done・skipped）。状態の文字を添えて見せるだけ */
export interface NotSelectableDuty {
  choreName: string;
  status: 'done' | 'skipped';
  /** status=done のときだけ。日本時間の HH:mm */
  recordedTime?: string;
}

/** 今日の担当の一覧（LINE の選択肢の元。entities.md の TodayRecordableList） */
export interface TodayRecordableList {
  selectable: SelectableDuty[];
  notSelectable: NotSelectableDuty[];
}

/**
 * 記録の確かめの結果の印（BR7.4、functional-spec.md の「記録の結果の印と返事の対応」）。
 * 成功は RecordResult（印ではない）で返す。
 */
export type RecordRejection =
  | 'NOT_FOUND'
  | 'NOT_OWN_DUTY'
  | 'DUTY_ALREADY_DONE'
  | 'MONTH_CONFIRMED'
  | 'DUTY_SKIPPED_BY_ADMIN'
  | 'FUTURE_DUTY'
  | 'NOT_TODAY_DUTY'
  | 'DUTY_CHANGED'
  | 'INTERNAL';

/** 記録の成功（duty は記録後の担当。alreadyRecorded は二重押しで書かずに返したとき true） */
export interface RecordSuccess {
  ok: true;
  duty: DutyRecord;
  alreadyRecorded: boolean;
}

export type RecordResult = RecordSuccess | { ok: false; reason: RecordRejection };

export interface RecordDutyOptions {
  /** LINE だけ true（今日の担当だけ記録できる。BR7.4 の 7.）。画面は月をまたいでよい */
  todayOnly: boolean;
  /** 要求の入口で 1 回だけ取った時刻。日本時間の今日と recordedAt の元 */
  now: Date;
  /** ログの印（line か api）。動きは変えない */
  route: 'line' | 'api';
}

/**
 * 今日の記録できる担当の一覧（C8 listTodayRecordableDuties、F1、BR7.2）。
 * 月が確定していれば 'MONTH_CONFIRMED'（理由の印）。それ以外は成功の形 { selectable, notSelectable }。
 * 自分（ctx.userId）の今日の担当だけを対象にする。種類の名前は choreTypeService.list（Query 1 回）で引く。
 * 読み取りは、月の状態（GetItem 1 回）＋その日の担当の Query（1 回）＋種類の一覧の Query（1 回）。担当の数で増えない（NFR1.21）。
 */
export async function listTodayRecordableDuties(
  ctx: FamilyContext,
  today: string,
): Promise<TodayRecordableList | 'MONTH_CONFIRMED'> {
  const month = today.slice(0, 7);
  const state = await calendarRepository.getMonthState(ctx.familyId, month);
  if (state?.confirmed === true) return 'MONTH_CONFIRMED';

  const [duties, choreTypes] = await Promise.all([
    calendarRepository.listDutiesOn(ctx.familyId, today),
    choreTypeService.list(ctx),
  ]);
  const nameById = new Map(choreTypes.map((type) => [type.choreTypeId, type.name]));
  const mine = duties.filter((duty) => duty.childUserId === ctx.userId);

  const selectable: SelectableDuty[] = [];
  const notSelectable: NotSelectableDuty[] = [];
  for (const duty of mine) {
    const choreName = nameById.get(duty.choreTypeId) ?? '';
    if (duty.status === 'todo') {
      selectable.push({
        dutyId: duty.dutyId,
        choreTypeId: duty.choreTypeId,
        choreName,
        version: duty.version,
      });
    } else if (duty.status === 'done') {
      notSelectable.push({
        choreName,
        status: 'done',
        ...(duty.recordedAt ? { recordedTime: jstTimeOf(duty.recordedAt) } : {}),
      });
    } else {
      notSelectable.push({ choreName, status: 'skipped' });
    }
  }
  return { selectable, notSelectable };
}

/** 判定の結果（proceed のときだけ、確かめを通った担当を持つ） */
type Verdict =
  | { kind: 'proceed'; duty: DutyRecord }
  | { kind: 'already'; duty: DutyRecord }
  | { kind: 'reject'; reason: RecordRejection };

/**
 * BR7.4 の判定の順番。最初に当てはまったもので終える。
 * 二重押し（BR7.8）のため、3.（本人が記録済み）を 4〜8 より前に置く。
 */
function judge(
  found: DutyWithState | undefined,
  ctx: FamilyContext,
  version: number,
  options: RecordDutyOptions,
  today: string,
): Verdict {
  if (!found) return { kind: 'reject', reason: 'NOT_FOUND' }; // 1
  const { duty, confirmed } = found;
  if (duty.childUserId !== ctx.userId) return { kind: 'reject', reason: 'NOT_OWN_DUTY' }; // 2
  if (duty.status === 'done') {
    // 3: 本人が記録済みなら書かずに返す。他の人（管理者）なら DUTY_ALREADY_DONE
    return duty.recordedBy === ctx.userId
      ? { kind: 'already', duty }
      : { kind: 'reject', reason: 'DUTY_ALREADY_DONE' };
  }
  if (confirmed) return { kind: 'reject', reason: 'MONTH_CONFIRMED' }; // 4
  if (duty.status === 'skipped') return { kind: 'reject', reason: 'DUTY_SKIPPED_BY_ADMIN' }; // 5
  if (duty.date > today) return { kind: 'reject', reason: 'FUTURE_DUTY' }; // 6
  if (options.todayOnly && duty.date !== today) {
    return { kind: 'reject', reason: 'NOT_TODAY_DUTY' }; // 7
  }
  if (duty.version !== version) return { kind: 'reject', reason: 'DUTY_CHANGED' }; // 8
  return { kind: 'proceed', duty }; // 9
}

/**
 * 担当を記録する（C8 recordDuty、F2・F3、BR7.4〜BR7.8、BR7.11、BR7.17）。LINE と画面の両方が通る同じ窓口。
 * version は数でも、数を返す関数でも渡せる（画面は本文を担当の 404 のあとで読むため。U5 の changeDutyChild と同じ）。
 * 流れ（reliability-design.md の for attempt in 1..2）: 担当を探す → 判定 → 単価を読む → 取引で書く。
 * 断られたら読み直して BR7.4 を最初から評価（1 回だけ）。2 回続けて断られたら INTERNAL（何も書かない）。
 */
export async function recordDuty(
  ctx: FamilyContext,
  dutyId: string,
  version: number | (() => number),
  options: RecordDutyOptions,
): Promise<RecordResult> {
  const today = jstDateOf(options.now);
  // version は担当の 404 のあとに解決する（本文の 422 は担当の 404 より後。NFR4.60、reliability-design.md の 3.）。
  // 関数なら 1 回だけ呼んで覚える（やり直しでも同じ値。見せた時点の version のまま）。
  let wantedVersion: number | undefined;
  const resolveVersion = (): number => {
    if (wantedVersion === undefined) {
      wantedVersion = typeof version === 'function' ? version() : version;
    }
    return wantedVersion;
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const found = await calendarRepository.findDuty(ctx.familyId, dutyId);
    if (!found) {
      logRejected(ctx, dutyId, options.route, 'NOT_FOUND');
      return { ok: false, reason: 'NOT_FOUND' };
    }
    const verdict = judge(found, ctx, resolveVersion(), options, today);
    if (verdict.kind === 'reject') {
      logRejected(ctx, dutyId, options.route, verdict.reason);
      return { ok: false, reason: verdict.reason };
    }
    if (verdict.kind === 'already') {
      // 二重押し（BR7.8）。書かず、onDutyRecorded も呼ばない
      logger.info({
        event: 'DUTY_RECORDED',
        familyId: ctx.familyId,
        dutyId,
        route: options.route,
        alreadyRecorded: true,
      });
      return { ok: true, duty: verdict.duty, alreadyRecorded: true };
    }

    const { duty } = verdict;
    const price = await choreTypeService.getCurrentUnitPrice(ctx, duty.choreTypeId);
    if (!price.ok) {
      // 種類がない（起きない前提）。何も書かず INTERNAL（NFR2.38）
      logRejected(ctx, dutyId, options.route, 'INTERNAL');
      return { ok: false, reason: 'INTERNAL' };
    }

    const outcome = await calendarRepository.writeTransaction(
      calendarRepository.buildRecordItems(duty, price.value, ctx, options.now),
    );
    if (outcome === 'written') {
      const recorded: DutyRecord = {
        ...duty,
        status: 'done',
        recordedAt: options.now.toISOString(),
        recordedBy: ctx.userId,
        unitPrice: price.value,
        updatedAt: options.now.toISOString(),
        version: duty.version + 1,
      };
      logger.info({
        event: 'DUTY_RECORDED',
        familyId: ctx.familyId,
        dutyId,
        route: options.route,
        alreadyRecorded: false,
      });
      await notifyDutyRecorded({
        familyId: ctx.familyId,
        dutyId: recorded.dutyId,
        date: recorded.date,
        choreTypeId: recorded.choreTypeId,
        childUserId: recorded.childUserId,
      });
      return { ok: true, duty: recorded, alreadyRecorded: false };
    }
    // 競合で断られた。読み直して BR7.4 を最初から評価する（やり直しは 1 回まで）
    logger.info({
      event: 'DUTY_RECORD_RETRY',
      familyId: ctx.familyId,
      dutyId,
      route: options.route,
    });
  }
  // 2 回続けて断られた
  logRejected(ctx, dutyId, options.route, 'INTERNAL');
  return { ok: false, reason: 'INTERNAL' };
}

function logRejected(
  ctx: FamilyContext,
  dutyId: string,
  route: 'line' | 'api',
  reason: RecordRejection,
): void {
  logger.info({
    event: 'DUTY_RECORD_REJECTED',
    familyId: ctx.familyId,
    dutyId,
    route,
    reason,
  });
}
