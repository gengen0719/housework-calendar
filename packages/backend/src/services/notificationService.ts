import { randomInt, randomUUID } from 'node:crypto';
import type { NotificationTrigger, NotificationReason } from '@housework/shared';
import type { NotificationDispatch } from '../models';
import * as store from '../repositories/notificationRepository';
import { getPayload } from '../repositories/notificationPayloadRepository';
import * as family from './familyMemberService';
import * as calendar from './calendarService';
import { notificationKey, familyRef } from './notificationIdentity';
import { notificationWindow } from './notificationTime';
import { prepareContent, NotificationContentError } from './notificationMessages';
import { pushNotification } from './notificationPushService';
import { operationalAlert } from './operationalAlertService';
import { enqueue, type NotificationJob } from './notificationQueueService';
import { mapWithConcurrency } from '../lib/promise';
import { logger } from '../lib/logger';

export interface DispatchOptions {
  now?: () => number;
  random?: () => number;
  operationalKey: string;
  env: string;
}
export type DispatchResult =
  | { outcome: 'sent' | 'skipped' | 'failed' | 'expired' | 'duplicate' }
  | { outcome: 'retry'; at: number };
export type TriggerStage = 'window' | 'beginRun' | 'enumerateFamilies' | 'finishRun';

/** 列挙の再実行で未完了の家族を再投入する。RUNの対象数は家族ごとの印で重複加算しない。 */
export async function dispatchTrigger(
  trigger: NotificationTrigger,
  options: DispatchOptions,
  onStage?: (stage: TriggerStage) => void,
): Promise<void> {
  onStage?.('window');
  const now = options.now ?? Date.now;
  const window = notificationWindow(trigger, new Date(now()));
  if (window.status !== 'active') throw new Error('INACTIVE_NOTIFICATION');
  onStage?.('beginRun');
  await store.beginRun(trigger, window.scheduledAt);
  onStage?.('enumerateFamilies');
  for await (const page of family.listNotificationFamilies())
    await mapWithConcurrency(page, 2, async (familyId) => {
      await store.registerRunFamily(
        trigger,
        familyId,
        Math.floor(window.scheduledAt / 1000) + 35 * 86400,
      );
      await enqueue({ ...trigger, familyId });
    });
  onStage?.('finishRun');
  await store.finishRunEnumeration(trigger);
}
export async function dispatchFamily(
  job: NotificationJob,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const now = options.now ?? Date.now;
  const start = now();
  const window = notificationWindow(job, new Date(start));
  const ctx = { familyId: job.familyId, role: 'system' as const };
  const ref = familyRef(job.familyId, options.operationalKey);
  const logResult = (outcome: 'duplicate' | 'expired'): DispatchResult => {
    logger.info({
      event: outcome === 'duplicate' ? 'NOTIFY_DUPLICATE' : 'NOTIFY_EXPIRED',
      kind: job.kind,
      targetDate: job.targetDate,
      familyRef: ref,
      ...(outcome === 'expired' ? { reason: 'deadline' } : {}),
    });
    return { outcome };
  };
  const alert = async (reason: NotificationReason) =>
    operationalAlert('notify', reason, {
      kind: job.kind,
      targetDate: job.targetDate,
      familyRef: ref,
    });
  let record: NotificationDispatch | undefined;
  try {
    record = await store.getDispatch(job.familyId, job);
    if (record && store.terminal(record.state)) return logResult('duplicate');
    if (window.status === 'early') return { outcome: 'retry', at: window.scheduledAt };
    if (window.status === 'expired') {
      if (record)
        await store.replaceDispatch(record, {
          ...record,
          state: 'expired',
          failureReason: 'deadline',
        });
      return logResult('expired');
    }
    if (!record) {
      const destination = await family.getNotificationGroup(ctx);
      const prepared = destination.ok
        ? await prepareContent(ctx, job.kind, job.targetDate)
        : { reason: 'unregistered' as const };
      const fresh: NotificationDispatch = {
        familyId: job.familyId,
        kind: job.kind,
        targetDate: job.targetDate,
        scheduledAt: window.scheduledAt,
        expiresAt: window.expiresAt,
        state: prepared.text ? 'prepared' : 'skipped',
        attempts: 0,
        version: 0,
        retryKey: notificationKey(options.env, job.familyId, job),
        ...(prepared.reason ? { failureReason: prepared.reason } : {}),
      };
      const payload =
        prepared.text && destination.ok
          ? {
              scheduledDate: job.targetDate,
              dispatchKey: fresh.retryKey,
              scheduledAt: window.scheduledAt,
              ttl: Math.floor(window.scheduledAt / 1000) + 86400,
              destination: destination.value,
              text: prepared.text,
            }
          : undefined;
      if (!(await store.createDispatch(fresh, payload)))
        return { outcome: 'retry', at: now() + 1000 };
      record = fresh;
      if (record.state === 'skipped') {
        logger.info({
          event: 'NOTIFY_SKIPPED',
          kind: job.kind,
          targetDate: job.targetDate,
          familyRef: ref,
          reason: record.failureReason,
        });
        return { outcome: 'skipped' };
      }
    }
    if (record.leaseUntil && record.leaseUntil > now())
      return { outcome: 'retry', at: record.leaseUntil };
    if (record.nextAttemptAt && record.nextAttemptAt > now())
      return { outcome: 'retry', at: record.nextAttemptAt };
    const payload = await getPayload(record.targetDate, record.retryKey, now());
    if (!payload) {
      await store.replaceDispatch(record, {
        ...record,
        state: 'failed',
        failureReason: 'missingPayload',
      });
      await alert('missingPayload');
      return { outcome: 'failed' };
    }
    const destination = await family.getNotificationGroup(ctx);
    if (!destination.ok || destination.value !== payload.destination) {
      const state = record.attempts ? 'failed' : 'skipped';
      await store.replaceDispatch(record, {
        ...record,
        state,
        failureReason: 'destinationChanged',
      });
      if (state === 'failed') await alert('destinationChanged');
      return { outcome: state };
    }
    if (
      record.attempts === 0 &&
      job.kind === 'dailyReminder' &&
      (await calendar.isMonthConfirmed(ctx, job.targetDate.slice(0, 7)))
    ) {
      await store.replaceDispatch(record, {
        ...record,
        state: 'skipped',
        failureReason: 'confirmed',
      });
      return { outcome: 'skipped' };
    }
    if (now() + 5000 > record.expiresAt) {
      await store.replaceDispatch(record, {
        ...record,
        state: 'expired',
        failureReason: 'deadline',
      });
      return logResult('expired');
    }
    if (record.attempts >= 3) {
      await store.replaceDispatch(record, {
        ...record,
        state: 'failed',
        failureReason: 'attempts',
      });
      await alert('attempts');
      return { outcome: 'failed' };
    }
    const claimed = await store.replaceDispatch(record, {
      ...record,
      state: 'sending',
      leaseOwner: randomUUID(),
      leaseUntil: now() + 45000,
      attempts: record.attempts + 1,
      nextAttemptAt: undefined,
    });
    if (!claimed) return { outcome: 'retry', at: now() + 1000 };
    record = claimed;
    // 保存後にも時計を検査。期限ぎりぎりなら外部要求を始めない。
    if (now() + 5000 > record.expiresAt) {
      await store.replaceDispatch(record, {
        ...record,
        state: 'expired',
        failureReason: 'deadline',
      });
      return logResult('expired');
    }
    const result = await pushNotification(payload.destination, payload.text, record.retryKey);
    if (result.accepted) {
      const saved = await store.replaceDispatch(record, {
        ...record,
        state: 'sent',
        acceptedAt: now(),
        providerRequestId: result.providerRequestId,
        leaseOwner: undefined,
        leaseUntil: undefined,
      });
      if (!saved) throw new Error('SAVE_ACCEPTANCE_FAILED');
      logger.info({
        event: 'NOTIFY_SENT',
        kind: job.kind,
        targetDate: job.targetDate,
        familyRef: ref,
        attempt: record.attempts,
        elapsedMs: Math.max(0, now() - start),
      });
      return { outcome: 'sent' };
    }
    const wait = Math.max(
      (record.attempts === 1 ? 5000 : 20000) + (options.random?.() ?? randomInt(1001)),
      result.retryAfterMs ?? 0,
    );
    const at = now() + wait;
    const retry = result.retryable && record.attempts < 3 && at + 5000 <= record.expiresAt;
    const saved = await store.replaceDispatch(record, {
      ...record,
      state: retry ? 'prepared' : 'failed',
      leaseOwner: undefined,
      leaseUntil: undefined,
      nextAttemptAt: retry ? at : undefined,
      firstFailureAt: record.firstFailureAt ?? now(),
      failureReason: result.reason,
    });
    if (!saved) throw new Error('SAVE_FAILURE_FAILED');
    logger.info({
      event: retry ? 'NOTIFY_RETRY' : 'NOTIFY_FAILED',
      kind: job.kind,
      targetDate: job.targetDate,
      familyRef: ref,
      reason: result.reason,
      attempt: record.attempts,
    });
    // SNS障害でも恒久失敗・Retry-Afterの保存を妨げない。
    await alert(result.reason);
    return retry ? { outcome: 'retry', at } : { outcome: 'failed' };
  } catch (error) {
    await alert(error instanceof NotificationContentError ? error.reason : 'internal');
    throw new Error('NOTIFICATION_FAILED');
  }
}
