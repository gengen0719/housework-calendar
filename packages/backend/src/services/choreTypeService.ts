import { createHash, randomUUID } from 'node:crypto';
import {
  err,
  normalizeChoreName,
  normalizeDescription,
  ok,
  validateUnitPrice,
  type ChoreType,
  type Err,
  type Ok,
  type Result,
} from '@housework/shared';
import { logger } from '../lib/logger';
import type { ChoreTypeRecord, RequestRecord } from '../models';
import type { FamilyContext } from '../middleware/requireMembership';
import * as choreTypeRepository from '../repositories/choreTypeRepository';
import * as calendarPort from './calendarPort';
import * as requestRecordRepository from '../repositories/requestRecordRepository';

/** 登録・変更・消すの取引が競合で断られたときに、読み直してやり直す回数の上限（NFR2.26）。最初の 1 回を含めて 2 回。 */
const MAX_ATTEMPTS = 2;

/** 画面から受け取った入力（確かめる前）。C7 の窓口が受け取る形。 */
export interface ChoreTypeInputRaw {
  name: unknown;
  unitPrice: unknown;
  description?: unknown;
}

interface ValidChoreTypeInput {
  name: string;
  unitPrice: number;
  description?: string;
}

export type ChoreTypeValidationFailure =
  'INVALID_CHORE_TYPE_NAME' | 'INVALID_UNIT_PRICE' | 'INVALID_DESCRIPTION';

/** 保存する形から、画面と C7 に返す形にする（家族の ID は返さない）。 */
export function toView(record: ChoreTypeRecord): ChoreType {
  return {
    choreTypeId: record.choreTypeId,
    name: record.name,
    unitPrice: record.unitPrice,
    ...(record.description !== undefined ? { description: record.description } : {}),
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** 名前 → 単価 → 説明の順に確かめ、保存する形にそろえる（BR5.2、BR5.5、BR5.6）。 */
function validateInput(
  input: ChoreTypeInputRaw,
): Result<ValidChoreTypeInput, ChoreTypeValidationFailure> {
  const name = normalizeChoreName(input.name);
  if (!name.ok) return name;
  const unitPrice = validateUnitPrice(input.unitPrice);
  if (!unitPrice.ok) return unitPrice;
  const description = normalizeDescription(input.description);
  if (!description.ok) return description;
  return ok({
    name: name.value,
    unitPrice: unitPrice.value,
    ...(description.value !== undefined ? { description: description.value } : {}),
  });
}

/** 送り直しの本文の見分け: 正規化したあとの名前・単価・説明を決まった順の JSON にした SHA-256（security-design.md）。 */
function requestTarget(input: ValidChoreTypeInput): string {
  return createHash('sha256')
    .update(JSON.stringify([input.name, input.unitPrice, input.description ?? null]))
    .digest('hex');
}

function sortForDisplay(records: ChoreTypeRecord[]): ChoreTypeRecord[] {
  // 「使う」を登録した順（createdAt、同じなら choreTypeId）、そのあとに「使わない」を同じ順（BR5.11）
  return [...records].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.choreTypeId.localeCompare(b.choreTypeId),
  );
}

function logRejected(ctx: FamilyContext, reason: string, choreTypeId?: string): void {
  logger.info({
    event: 'CHORE_TYPE_REJECTED',
    familyId: ctx.familyId,
    userId: ctx.userId,
    ...(choreTypeId ? { choreTypeId } : {}),
    reason,
  });
}

/**
 * 種類の一覧（C7 list、F1、BR5.11）。家族のメンバー全員が見られる（呼び出し側が requireMembership を通す）。
 * 「使わない」の種類も active つきで返す。
 */
export async function list(ctx: FamilyContext): Promise<ChoreType[]> {
  const records = await choreTypeRepository.listByFamily(ctx.familyId);
  return sortForDisplay(records).map(toView);
}

/** 種類を 1 つ読む（強い整合性）。家族のキーで読むので、ほかの家族の種類は「ない」と同じ（BR5.10）。 */
export async function get(
  ctx: FamilyContext,
  choreTypeId: string,
): Promise<ChoreTypeRecord | undefined> {
  return choreTypeRepository.findById(ctx.familyId, choreTypeId);
}

/**
 * 今の単価（C7 getCurrentUnitPrice、BR5.7、BR5.10）。「使わない」の種類にも単価を返す。
 * NOT_FOUND は、種類がないかほかの家族のときだけ。
 */
export async function getCurrentUnitPrice(
  ctx: FamilyContext,
  choreTypeId: string,
): Promise<Result<number, 'NOT_FOUND'>> {
  const record = await choreTypeRepository.findById(ctx.familyId, choreTypeId);
  return record ? ok(record.unitPrice) : err('NOT_FOUND');
}

export type UpdateChoreTypeOutcome =
  Ok<ChoreType> | Err<ChoreTypeValidationFailure | 'NOT_FOUND' | 'INTERNAL'> | NameTakenFailure;

/**
 * 種類の名前・単価・説明を変える（C7 update、F3、BR5.3、BR5.5〜BR5.7）。`current` は呼び出し側が読んだ種類。
 * 入力の確かめ → 名前が同じなら Update だけ、違えば名前の印を付け替える取引。
 * 競合（読んだあとに別の要求が先に入った）なら読み直して 1 回だけやり直し、それでも断られたら INTERNAL。
 */
export async function update(
  ctx: FamilyContext,
  current: ChoreTypeRecord,
  input: ChoreTypeInputRaw,
  now: Date = new Date(),
): Promise<UpdateChoreTypeOutcome> {
  const valid = validateInput(input);
  if (!valid.ok) {
    logRejected(ctx, valid.reason, current.choreTypeId);
    return valid;
  }
  let record = current;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const outcome =
      valid.value.name === record.name
        ? await choreTypeRepository.updateKeepingName(record, valid.value, now)
        : await choreTypeRepository.renameWithName(record, valid.value, now);
    if (outcome.status === 'updated') {
      logger.info({
        event: 'CHORE_TYPE_UPDATED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        choreTypeId: record.choreTypeId,
        unitPrice: outcome.record.unitPrice,
      });
      return ok(toView(outcome.record));
    }
    if (outcome.status === 'name-taken') {
      logRejected(ctx, 'CHORE_TYPE_NAME_TAKEN', record.choreTypeId);
      return {
        ok: false,
        reason: 'CHORE_TYPE_NAME_TAKEN',
        conflictActive: await isConflictActive(ctx.familyId, valid.value.name),
      };
    }
    const fresh = await choreTypeRepository.findById(ctx.familyId, record.choreTypeId);
    if (!fresh) return err('NOT_FOUND');
    record = fresh;
  }
  return err('INTERNAL');
}

/** 「使わない」「使う」を切り替える（C7 setActive、F4、BR5.8）。種類がなければ NOT_FOUND。 */
export async function setActive(
  ctx: FamilyContext,
  choreTypeId: string,
  active: boolean,
  now: Date = new Date(),
): Promise<Result<ChoreType, 'NOT_FOUND'>> {
  const record = await choreTypeRepository.setActive(ctx.familyId, choreTypeId, active, now);
  if (!record) return err('NOT_FOUND');
  logger.info({
    event: 'CHORE_TYPE_ACTIVE_CHANGED',
    familyId: ctx.familyId,
    userId: ctx.userId,
    choreTypeId,
    active,
  });
  return ok(toView(record));
}

export type RemoveChoreTypeFailure =
  'NOT_FOUND' | 'CHORE_TYPE_IN_USE' | 'CHORE_TYPE_STATE_CHANGED' | 'INTERNAL';

/**
 * 種類を消す（C7 delete、F5、BR5.9、reliability-design.md の「消す」）。
 * 1. 「使わない」にする（なければ NOT_FOUND）→ 2. C8 で割り当てに使われたかを確かめる（使われていれば CHORE_TYPE_IN_USE。「使わない」のまま残す）
 * → 3. 種類と名前の印を 1 つの取引で消す。取引が断られたら読み直し、なければ NOT_FOUND、「使う」に戻っていれば
 * CHORE_TYPE_STATE_CHANGED、ほかなら 1 回だけやり直す。
 */
export async function remove(
  ctx: FamilyContext,
  choreTypeId: string,
  now: Date = new Date(),
): Promise<Result<undefined, RemoveChoreTypeFailure>> {
  let record = await choreTypeRepository.setActive(ctx.familyId, choreTypeId, false, now);
  if (!record) return err('NOT_FOUND');
  // 手順 1 で「使わない」に変わった。あとで IN_USE になっても変わったままなので、だれがいつ変えたかをログに残す
  logger.info({
    event: 'CHORE_TYPE_ACTIVE_CHANGED',
    familyId: ctx.familyId,
    userId: ctx.userId,
    choreTypeId,
    active: false,
    via: 'delete',
  });
  if (await calendarPort.isChoreTypeAssigned(ctx, choreTypeId)) {
    logRejected(ctx, 'CHORE_TYPE_IN_USE', choreTypeId);
    return err('CHORE_TYPE_IN_USE');
  }
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if ((await choreTypeRepository.deleteWithName(record)) === 'deleted') {
      logger.info({
        event: 'CHORE_TYPE_DELETED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        choreTypeId,
      });
      return ok(undefined);
    }
    const fresh = await choreTypeRepository.findById(ctx.familyId, choreTypeId);
    if (!fresh) return err('NOT_FOUND');
    if (fresh.active) {
      logRejected(ctx, 'CHORE_TYPE_STATE_CHANGED', choreTypeId);
      return err('CHORE_TYPE_STATE_CHANGED');
    }
    record = fresh;
  }
  return err('INTERNAL');
}

export type CreateChoreTypeFailure =
  ChoreTypeValidationFailure | 'IDEMPOTENCY_KEY_REUSED' | 'INTERNAL';

/** 名前が重なったときの失敗。相手が「使う」かを conflictActive で渡す（BR5.3）。 */
export type NameTakenFailure = Err<'CHORE_TYPE_NAME_TAKEN'> & { conflictActive: boolean };

export type CreateChoreTypeOutcome = Ok<ChoreType> | Err<CreateChoreTypeFailure> | NameTakenFailure;

function replay(
  record: RequestRecord,
  target: string,
  ctx: FamilyContext,
): Ok<ChoreType> | Err<'IDEMPOTENCY_KEY_REUSED'> {
  if (requestRecordRepository.isSameRequest(record, 'createChoreType', target)) {
    return ok(record.result as ChoreType);
  }
  logRejected(ctx, 'IDEMPOTENCY_KEY_REUSED');
  return err('IDEMPOTENCY_KEY_REUSED');
}

/** 名前の印が指す種類が「使う」か。種類が見つからない（直後に消された）ときは「使う」の相手と同じ扱い。 */
async function isConflictActive(familyId: string, name: string): Promise<boolean> {
  const marker = await choreTypeRepository.findNameMarker(familyId, name);
  if (!marker) return true;
  const other = await choreTypeRepository.findById(familyId, marker.choreTypeId);
  return other?.active ?? true;
}

/**
 * 種類を登録する（C7 create、F2、BR5.2〜BR5.6、BR5.12）。管理者かどうかは呼び出し側（requireAdmin）が確かめる。
 * 順番: 入力の確かめ → 同じ印の成功済みの記録があれば前と同じ結果 → 種類・名前の印・送り直しの記録を 1 つの取引で書く。
 * 名前の印の条件で断られたら CHORE_TYPE_NAME_TAKEN。送り直しの記録の競合（同じ印の同時の要求）は、最初の find からの
 * やり直しを 1 回だけ行い、勝った側の結果を返す。それでも断られたら INTERNAL。期限切れで TTL がまだ消していない記録は上書きできる。
 */
export async function create(
  ctx: FamilyContext,
  input: ChoreTypeInputRaw,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<CreateChoreTypeOutcome> {
  const valid = validateInput(input);
  if (!valid.ok) {
    logRejected(ctx, valid.reason);
    return valid;
  }
  const target = requestTarget(valid.value);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 毎回の最初に送り直しの記録を（強い整合性で）読む。同時の要求で負けて戻ってきたときは、ここで勝った側の結果を返す
    const previous = await requestRecordRepository.find(ctx.userId, idempotencyKey, now);
    if (previous) return replay(previous, target, ctx);

    const record: ChoreTypeRecord = {
      familyId: ctx.familyId,
      choreTypeId: randomUUID(),
      name: valid.value.name,
      unitPrice: valid.value.unitPrice,
      ...(valid.value.description !== undefined ? { description: valid.value.description } : {}),
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const view = toView(record);
    const outcome = await choreTypeRepository.createWithName(
      {
        record,
        request: {
          userId: ctx.userId,
          idempotencyKey,
          operation: 'createChoreType',
          target,
          result: view,
        },
      },
      now,
    );
    if (outcome === 'created') {
      logger.info({
        event: 'CHORE_TYPE_CREATED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        choreTypeId: record.choreTypeId,
        unitPrice: record.unitPrice,
      });
      return ok(view);
    }
    if (outcome === 'request-conflict') {
      // 同じ印の記録が先に入った。最初の find からやり直し（1 回だけ）、勝った側の記録が見えれば前と同じ結果を返す
      continue;
    }
    if (outcome === 'name-taken') {
      logRejected(ctx, 'CHORE_TYPE_NAME_TAKEN');
      return {
        ok: false,
        reason: 'CHORE_TYPE_NAME_TAKEN',
        conflictActive: await isConflictActive(ctx.familyId, valid.value.name),
      };
    }
  }
  return err('INTERNAL');
}
