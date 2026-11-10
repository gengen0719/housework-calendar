import { randomUUID } from 'node:crypto';
import { jstDateOf, monthOfDate, shiftMonth } from '@housework/shared';
import { logger } from '../lib/logger';
import type { FamilyContext } from '../middleware/requireMembership';
import type { DutyRecord, SwapOfferRecord } from '../models';
import * as calendarRepository from '../repositories/calendarRepository';
import type { DutyWithState } from '../repositories/calendarRepository';
import * as swapRepository from '../repositories/swapRepository';
import * as choreTypeService from './choreTypeService';
import { onDutyReassigned } from './dutyReassignedHook';
import { onDutyRecorded } from './dutyRecordedHook';

/**
 * 代わりにやる（U8）の業務の窓口（C8）。
 * 一覧・申し出・引き受け・取り下げ・掃除と、フックの登録をまとめる。
 * 読む→判定→書く、の形は U6 の recordDuty と同じ。書き込みが断られたら読み直して 1 回だけやり直す（BR9.15）。
 * 引き受けは担当を変える通知（notifyDutyReassigned）も記録の通知（notifyDutyRecorded）も呼ばない（BR9.9）。
 * ログには ID と印だけを残し、名前・LINE の ID・金額は残さない（BR9.18）。
 */

/** 書き込みの競合で読み直してやり直す回数（最初の 1 回を含めて 2 回。BR9.15） */
const MAX_ATTEMPTS = 2;

/** 受け口が一度に出す担当の数（BR9.6）。窓口は全件を返し、絞るのは受け口 */
export const SWAP_CHOICES_MAX = 10;

/** 名前が引けないときの言い換え（BR9.14） */
export const FALLBACK_CHORE_NAME = 'お手伝い';

/** 申し出られる担当 1 件（返事のボタンの元） */
export interface SwappableDuty {
  dutyId: string;
  /** 日本時間の YYYY-MM-DD */
  date: string;
  choreTypeId: string;
  choreName: string;
}

/** 申し出・引き受け・取り下げの結果の印（BR9.7、BR9.9、BR9.10） */
export type SwapRejection =
  | 'NOT_FOUND'
  | 'OFFER_OWNER_ONLY'
  | 'MONTH_CONFIRMED'
  | 'DUTY_NOT_TODO'
  | 'ALREADY_OFFERED'
  | 'DUTY_CHANGED'
  | 'OFFER_GONE'
  | 'CANNOT_ACCEPT_OWN_OFFER'
  | 'OFFER_ALREADY_ACCEPTED'
  | 'INTERNAL';

type Failure = { ok: false; reason: SwapRejection };

export interface OfferSuccess {
  ok: true;
  offerId: string;
  duty: DutyRecord;
  choreName: string;
}
export interface AcceptSuccess {
  ok: true;
  /** 引き受けたあとの担当 */
  duty: DutyRecord;
  choreName: string;
  /** 申し出た子供 */
  offererUserId: string;
}
export interface WithdrawSuccess {
  ok: true;
  duty: DutyRecord;
  choreName: string;
  offerId: string;
}

export interface SwapOptions {
  /** 要求の入口で 1 回だけ取った時刻。日本時間の今日と書き込みの時刻の元 */
  now: Date;
}

type SwapOp = 'list' | 'offer' | 'accept' | 'withdraw';

/** SWAP_REJECTED に残す印（一覧の断りの NO_SWAPPABLE_DUTY を含む） */
type LoggedReason = SwapRejection | 'NO_SWAPPABLE_DUTY';

/** 種類の一覧（名前と並び順）。読めなくても返事は止めない（BR9.14） */
async function loadChoreTypes(ctx: FamilyContext): Promise<{ id: string; name: string }[]> {
  try {
    const types = await choreTypeService.list(ctx);
    return types.map((type) => ({ id: type.choreTypeId, name: type.name }));
  } catch {
    // 検索できるように familyId だけを残す（名前・単価・ID は書かない。NFR2.66）
    logger.warn({ event: 'SWAP_CHORE_TYPES_FAILED', familyId: ctx.familyId });
    return [];
  }
}

const nameOf = (types: { id: string; name: string }[], choreTypeId: string): string =>
  types.find((type) => type.id === choreTypeId)?.name ?? FALLBACK_CHORE_NAME;

function logRejected(ctx: FamilyContext, op: SwapOp, reason: LoggedReason, dutyId?: string): void {
  logger.info({
    event: 'SWAP_REJECTED',
    familyId: ctx.familyId,
    ...(dutyId ? { dutyId } : {}),
    op,
    reason,
  });
}

function reject(ctx: FamilyContext, op: SwapOp, dutyId: string, reason: SwapRejection): Failure {
  logRejected(ctx, op, reason, dutyId);
  return { ok: false, reason };
}

/**
 * 申し出が有効か（BR9.8 の (a)〜(e)）。読んだ値だけで決める純粋な関数で、項目は書き換えない。
 * フックが失敗・遅延・未登録でも正しさを守る。
 */
export function isOfferValid(
  offer: SwapOfferRecord,
  found: DutyWithState | undefined,
  today: string,
): boolean {
  if (offer.status !== 'open') return false; // (a)
  if (!found) return false;
  const { duty, confirmed } = found;
  return (
    duty.version === offer.dutyVersion && // (b)
    duty.status === 'todo' && // (c)
    duty.childUserId === offer.offererUserId && // (c)
    duty.date >= today && // (d)
    !confirmed // (e)
  );
}

/**
 * 申し出られる担当の一覧（C8 listSwappableDuties、BR9.5、BR9.6）。
 * 自分の・今日以降の・「未」の・確定していない月の担当を、日付→種類の順→担当の ID の順に全件返す。
 * 候補がなければ、今日の月が確定していれば MONTH_CONFIRMED、そうでなければ NO_SWAPPABLE_DUTY。
 * 読み取りは今月と来月の月の Query（並行）と種類の Query だけで、担当の数で増えない（BR9.17）。
 */
export async function listSwappableDuties(
  ctx: FamilyContext,
  today: string,
): Promise<SwappableDuty[] | 'NO_SWAPPABLE_DUTY' | 'MONTH_CONFIRMED'> {
  const startedAt = Date.now();
  const thisMonth = monthOfDate(today);
  const [current, next, types] = await Promise.all([
    calendarRepository.loadMonth(ctx.familyId, thisMonth),
    calendarRepository.loadMonth(ctx.familyId, shiftMonth(thisMonth, 1)),
    loadChoreTypes(ctx),
  ]);

  const order = new Map(types.map((type, index) => [type.id, index]));
  const rank = (choreTypeId: string): number => order.get(choreTypeId) ?? types.length;
  const candidates = [
    ...(current.state?.confirmed === true ? [] : current.duties),
    ...(next.state?.confirmed === true ? [] : next.duties),
  ]
    .filter(
      (duty) => duty.childUserId === ctx.userId && duty.status === 'todo' && duty.date >= today,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        rank(a.choreTypeId) - rank(b.choreTypeId) ||
        a.dutyId.localeCompare(b.dutyId),
    );

  if (candidates.length === 0) {
    const reason = current.state?.confirmed === true ? 'MONTH_CONFIRMED' : 'NO_SWAPPABLE_DUTY';
    logRejected(ctx, 'list', reason);
    return reason;
  }
  logger.info({
    event: 'SWAP_LISTED',
    familyId: ctx.familyId,
    count: candidates.length,
    shown: Math.min(candidates.length, SWAP_CHOICES_MAX),
    durationMs: Date.now() - startedAt,
  });
  return candidates.map((duty) => ({
    dutyId: duty.dutyId,
    date: duty.date,
    choreTypeId: duty.choreTypeId,
    choreName: nameOf(types, duty.choreTypeId),
  }));
}

/**
 * 担当を選んで申し出を作る（C8 offerSwap、BR9.7）。
 * 判定の順: 担当がない → 担当の子供が違う → 月が確定 → 「未」でない／過ぎた日 → 有効な申し出がある → 書く。
 * 断られたら読み直して 1 回だけやり直し、2 回続けて断られたら INTERNAL（何も書かれない）。
 */
export async function offerSwap(
  ctx: FamilyContext,
  dutyId: string,
  options: SwapOptions,
): Promise<OfferSuccess | Failure> {
  const startedAt = Date.now();
  const today = jstDateOf(options.now);
  let types: { id: string; name: string }[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [found, offer, loaded] = await Promise.all([
      calendarRepository.findDuty(ctx.familyId, dutyId),
      swapRepository.getOffer(ctx.familyId, dutyId),
      types ? Promise.resolve(types) : loadChoreTypes(ctx),
    ]);
    types = loaded;
    if (!found) return reject(ctx, 'offer', dutyId, 'NOT_FOUND'); // 1
    const { duty, confirmed } = found;
    if (duty.childUserId !== ctx.userId) {
      // 2: 元の持ち主が古い選択ボタンを押したときだけ DUTY_CHANGED（申し出の項目で決める）
      const wasOwner = offer?.offererUserId === ctx.userId;
      return reject(ctx, 'offer', dutyId, wasOwner ? 'DUTY_CHANGED' : 'OFFER_OWNER_ONLY');
    }
    if (confirmed) return reject(ctx, 'offer', dutyId, 'MONTH_CONFIRMED'); // 3
    if (duty.status !== 'todo' || duty.date < today) {
      return reject(ctx, 'offer', dutyId, 'DUTY_NOT_TODO'); // 4
    }
    if (offer && isOfferValid(offer, found, today)) {
      return reject(ctx, 'offer', dutyId, 'ALREADY_OFFERED'); // 5
    }
    const offerId = randomUUID();
    const outcome = await swapRepository.createOffer(duty, offerId, options.now);
    if (outcome === 'written') {
      logger.info({
        event: 'SWAP_OFFERED',
        familyId: ctx.familyId,
        dutyId,
        offerId,
        durationMs: Date.now() - startedAt,
      });
      return { ok: true, offerId, duty, choreName: nameOf(types, duty.choreTypeId) };
    }
    logger.info({ event: 'SWAP_RETRY', familyId: ctx.familyId, dutyId, op: 'offer' });
  }
  return reject(ctx, 'offer', dutyId, 'INTERNAL');
}

/**
 * 申し出を引き受ける（C8 acceptSwap、BR9.9）。先着 1 人だけが成立する。
 * 判定の順: なくなった → 本人・管理者 → 引き受け済み → 取引（担当・申し出・月の確かめの 3 項目）。
 * 担当を変える通知・記録の通知は呼ばない（申し出は同じ取引で accepted になる）。
 */
export async function acceptSwap(
  ctx: FamilyContext,
  dutyId: string,
  offerId: string,
  options: SwapOptions,
): Promise<AcceptSuccess | Failure> {
  const startedAt = Date.now();
  const today = jstDateOf(options.now);
  let types: { id: string; name: string }[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [offer, found, loaded] = await Promise.all([
      swapRepository.getOffer(ctx.familyId, dutyId),
      calendarRepository.findDuty(ctx.familyId, dutyId),
      types ? Promise.resolve(types) : loadChoreTypes(ctx),
    ]);
    types = loaded;
    // 1〜2: なくなった（ない・ID 違い・取り下げ・自動でなくなった・無効になった open）
    if (!offer || offer.offerId !== offerId || offer.status === 'withdrawn') {
      return reject(ctx, 'accept', dutyId, 'OFFER_GONE');
    }
    if (offer.status === 'cancelled') return reject(ctx, 'accept', dutyId, 'OFFER_GONE');
    if (offer.status === 'open' && !isOfferValid(offer, found, today)) {
      return reject(ctx, 'accept', dutyId, 'OFFER_GONE');
    }
    // 3: 管理者と申し出た本人（引き受けられたあとでも同じ）
    if (ctx.role === 'admin' || ctx.userId === offer.offererUserId) {
      return reject(ctx, 'accept', dutyId, 'CANNOT_ACCEPT_OWN_OFFER');
    }
    // 4: 引き受け済み
    if (offer.status === 'accepted') {
      return reject(ctx, 'accept', dutyId, 'OFFER_ALREADY_ACCEPTED');
    }
    const duty = (found as DutyWithState).duty; // open で有効なら担当がある
    const outcome = await swapRepository.acceptOffer(duty, offer, ctx.userId, options.now);
    if (outcome === 'written') {
      logger.info({
        event: 'SWAP_ACCEPTED',
        familyId: ctx.familyId,
        dutyId,
        offerId,
        durationMs: Date.now() - startedAt,
      });
      return {
        ok: true,
        duty: {
          ...duty,
          childUserId: ctx.userId,
          origin: 'swap',
          version: duty.version + 1,
          updatedAt: options.now.toISOString(),
        },
        choreName: nameOf(types, duty.choreTypeId),
        offererUserId: offer.offererUserId,
      };
    }
    logger.info({ event: 'SWAP_RETRY', familyId: ctx.familyId, dutyId, op: 'accept' });
  }
  return reject(ctx, 'accept', dutyId, 'INTERNAL');
}

/**
 * 申し出を取り下げる（C8 withdrawSwap、BR9.10）。申し出た本人だけが、引き受けられる前に取り下げられる。
 * 判定の順: なくなった → 本人でない → 引き受け済み → 無効になった open → 書く。担当には触れない。
 */
export async function withdrawSwap(
  ctx: FamilyContext,
  dutyId: string,
  offerId: string,
  options: SwapOptions,
): Promise<WithdrawSuccess | Failure> {
  const startedAt = Date.now();
  const today = jstDateOf(options.now);
  let types: { id: string; name: string }[] | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [offer, found, loaded] = await Promise.all([
      swapRepository.getOffer(ctx.familyId, dutyId),
      calendarRepository.findDuty(ctx.familyId, dutyId),
      types ? Promise.resolve(types) : loadChoreTypes(ctx),
    ]);
    types = loaded;
    if (
      !offer ||
      offer.offerId !== offerId ||
      offer.status === 'withdrawn' ||
      offer.status === 'cancelled'
    ) {
      return reject(ctx, 'withdraw', dutyId, 'OFFER_GONE'); // 1
    }
    if (ctx.userId !== offer.offererUserId) {
      return reject(ctx, 'withdraw', dutyId, 'OFFER_OWNER_ONLY'); // 2
    }
    if (offer.status === 'accepted') {
      return reject(ctx, 'withdraw', dutyId, 'OFFER_ALREADY_ACCEPTED'); // 3
    }
    if (!isOfferValid(offer, found, today)) {
      return reject(ctx, 'withdraw', dutyId, 'OFFER_GONE'); // 4
    }
    const duty = (found as DutyWithState).duty;
    const outcome = await swapRepository.withdrawOffer(ctx.familyId, dutyId, offerId, options.now);
    if (outcome === 'written') {
      logger.info({
        event: 'SWAP_WITHDRAWN',
        familyId: ctx.familyId,
        dutyId,
        offerId,
        durationMs: Date.now() - startedAt,
      });
      return { ok: true, duty, choreName: nameOf(types, duty.choreTypeId), offerId };
    }
    logger.info({ event: 'SWAP_RETRY', familyId: ctx.familyId, dutyId, op: 'withdraw' });
  }
  return reject(ctx, 'withdraw', dutyId, 'INTERNAL');
}

/**
 * フックから呼ぶ掃除（BR9.11）。open の申し出を cancelled にする。
 * 項目がない・open でないときは何も書かず、ログも出さない（条件で断られた件は出さない）。
 * 実際に cancelled にしたときだけ SWAP_OFFER_CLOSED を出す。via は通知の種類か recorded。
 */
export async function closeOffer(
  familyId: string,
  dutyId: string,
  via: string,
  now: Date = new Date(),
): Promise<boolean> {
  const closed = await swapRepository.closeOffer(familyId, dutyId, now);
  if (closed) logger.info({ event: 'SWAP_OFFER_CLOSED', familyId, dutyId, via });
  return closed;
}

let registered = false;

/**
 * 起動の枠で 1 回だけ呼ぶ。申し出の掃除を、担当が変わった通知と記録の通知に登録する（BR9.11）。
 * api は両方、line は記録の通知だけ（line は担当を変える書き込みを持たない）。二重に呼んでも登録は 1 回。
 */
export function registerSwapHooks(options: { reassigned: boolean; recorded: boolean }): void {
  if (registered) return;
  registered = true;
  if (options.reassigned) {
    onDutyReassigned(async (event) => {
      await closeOffer(event.familyId, event.dutyId, event.kind);
    });
  }
  if (options.recorded) {
    onDutyRecorded(async (event) => {
      await closeOffer(event.familyId, event.dutyId, 'recorded');
    });
  }
}

/** 登録の状態を戻す（テスト用）。通知側の登録を空にする関数と合わせて使う。 */
export function resetSwapHooksForTest(): void {
  registered = false;
}
