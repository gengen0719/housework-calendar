import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  ALLOWANCE_UNKNOWN_CHILD,
  jstDateOf,
  monthOfDate,
  shiftMonth,
  validateAdjustment,
  type AdjustmentView,
  type AdjustmentMonthView,
} from '@housework/shared';
import { mapWithConcurrency } from '../lib/promise';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';
import { requireAdmin } from '../middleware/requireAdmin';
import type { FamilyContext } from '../middleware/requireMembership';
import type { AdjustmentRecord } from '../models';
import * as store from '../repositories/adjustmentRepository';
import * as requests from '../repositories/requestRecordRepository';
import * as family from './familyMemberService';
import * as calendar from './calendarService';

export const toAdjustmentView = (row: AdjustmentRecord): AdjustmentView => ({
  adjustmentId: row.adjustmentId,
  childUserId: row.childUserId,
  month: row.month,
  kind: row.kind,
  amount: row.amount,
  reason: row.reason,
  createdAt: row.createdAt,
});
export async function requireAdjustmentMonth(ctx: FamilyContext, month: string, now: Date) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(422, 'INVALID_MONTH');
  const data = await family.loadFamilyAndMembers(ctx);
  const firstMonth = monthOfDate(jstDateOf(new Date(data.family.createdAt)));
  const lastMonth = shiftMonth(monthOfDate(jstDateOf(now)), 1);
  if (month < firstMonth || month > lastMonth) throw new ApiError(422, 'INVALID_MONTH');
  return { ...data, firstMonth, lastMonth };
}
export async function createAdjustment(
  ctx: FamilyContext,
  month: string,
  raw: unknown,
  key: string,
  options: { now: Date; remainingTimeMs?: () => number },
): Promise<AdjustmentView> {
  requireAdmin(ctx);
  const started = Date.now();
  const valid = validateAdjustment(raw);
  if (!valid.ok) throw new ApiError(422, valid.reason);
  const target = createHash('sha256')
    .update(
      JSON.stringify([
        ctx.familyId,
        month,
        valid.value.childUserId,
        valid.value.kind,
        valid.value.amount,
        valid.value.reason,
      ]),
    )
    .digest('hex');
  for (let attempt = 0; attempt < 2; attempt++) {
    const previous = await requests.find(ctx.userId, key, options.now);
    if (previous) {
      if (!requests.isSameRequest(previous, 'addAdjustment', target))
        throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
      return previous.result as AdjustmentView;
    }
    await requireAdjustmentMonth(ctx, month, options.now);
    if (!(await family.findFamilyChild(ctx, valid.value.childUserId)).ok)
      throw new ApiError(404, 'NOT_FOUND');
    if (await calendar.isMonthConfirmed(ctx, month)) throw new ApiError(409, 'MONTH_CONFIRMED');
    if (options.remainingTimeMs && options.remainingTimeMs() < 2500)
      throw new ApiError(500, 'INTERNAL');
    const record: AdjustmentRecord = {
      ...valid.value,
      adjustmentId: randomUUID(),
      familyId: ctx.familyId,
      month,
      createdBy: ctx.userId,
      createdAt: options.now.toISOString(),
    };
    const view = toAdjustmentView(record);
    const saved = await store.transact(
      store.buildCreateItems(
        record,
        {
          userId: ctx.userId,
          idempotencyKey: key,
          operation: 'addAdjustment',
          target,
          result: view,
        },
        [
          calendar.buildUnconfirmedMonthGuard(ctx, month),
          family.buildChildMembershipGuard(ctx, record.childUserId),
        ],
        options.now,
      ),
    );
    if (saved) {
      logger.info({
        event: 'ADJUSTMENT_CREATE',
        result: 'created',
        durationMs: Date.now() - started,
      });
      return view;
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, randomInt(51)));
  }
  const previous = await requests.find(ctx.userId, key, options.now);
  if (previous && requests.isSameRequest(previous, 'addAdjustment', target))
    return previous.result as AdjustmentView;
  if (previous) throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
  if (await calendar.isMonthConfirmed(ctx, month)) throw new ApiError(409, 'MONTH_CONFIRMED');
  if (!(await family.findFamilyChild(ctx, valid.value.childUserId)).ok)
    throw new ApiError(404, 'NOT_FOUND');
  throw new ApiError(500, 'INTERNAL');
}

/** 集計を呼ばない訂正用一覧。過去の子供の行も保持する。 */
export async function listAdjustments(
  ctx: FamilyContext,
  month: string,
  now: Date,
): Promise<AdjustmentMonthView> {
  requireAdmin(ctx);
  const started = Date.now();
  const data = await requireAdjustmentMonth(ctx, month, now);
  const [rows, confirmed] = await Promise.all([
    store.listByMonth(ctx.familyId, month),
    calendar.isMonthConfirmed(ctx, month),
  ]);
  const names = new Map(data.members.map((m) => [m.userId, m.displayName]));
  await mapWithConcurrency(
    [...new Set(rows.map((r) => r.childUserId))].filter((id) => !names.has(id)),
    10,
    async (id) => {
      const name = await family.findDisplayName(ctx, id);
      names.set(id, name.ok ? name.value : ALLOWANCE_UNKNOWN_CHILD);
    },
  );
  logger.info({ event: 'ADJUSTMENT_LIST', result: 'read', durationMs: Date.now() - started });
  return {
    month,
    confirmed,
    firstMonth: data.firstMonth,
    lastMonth: data.lastMonth,
    children: data.members
      .filter((m) => m.role === 'child')
      .map((m) => ({ userId: m.userId, displayName: m.displayName })),
    adjustments: rows.map((r) => ({
      ...toAdjustmentView(r),
      displayName: names.get(r.childUserId) ?? ALLOWANCE_UNKNOWN_CHILD,
    })),
  };
}

export async function deleteAdjustment(
  ctx: FamilyContext,
  id: string,
  options: { remainingTimeMs?: () => number } = {},
): Promise<void> {
  requireAdmin(ctx);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new ApiError(422, 'INVALID_REQUEST');
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await store.findById(ctx.familyId, id);
    if (!row) throw new ApiError(404, 'NOT_FOUND');
    if (await calendar.isMonthConfirmed(ctx, row.month)) throw new ApiError(409, 'MONTH_CONFIRMED');
    if (options.remainingTimeMs && options.remainingTimeMs() < 2500)
      throw new ApiError(500, 'INTERNAL');
    if (
      await store.transact(
        store.buildDeleteItems(row, [calendar.buildUnconfirmedMonthGuard(ctx, row.month)]),
      )
    ) {
      logger.info({
        event: 'ADJUSTMENT_DELETE',
        result: 'deleted',
        durationMs: Date.now() - started,
      });
      return;
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, randomInt(51)));
  }
  const row = await store.findById(ctx.familyId, id);
  if (!row) throw new ApiError(404, 'NOT_FOUND');
  if (await calendar.isMonthConfirmed(ctx, row.month)) throw new ApiError(409, 'MONTH_CONFIRMED');
  throw new ApiError(500, 'INTERNAL');
}
