import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { parseTrigger, fromScheduledTime } from '../services/notificationTime';
import {
  dispatchFamily,
  dispatchTrigger,
  type DispatchOptions,
  type TriggerStage,
} from '../services/notificationService';
import { parseJob, defer } from '../services/notificationQueueService';
import { completeRunFamily } from '../repositories/notificationRepository';
import { operationalAlert } from '../services/operationalAlertService';
import {
  operationalKey,
  watchdog,
  cleanup,
  backup,
} from '../services/notificationMaintenanceService';
import { requireEnv } from '../lib/config';
import { logger } from '../lib/logger';

const inputErrors = new Set([
  'INVALID_BATCH',
  'INVALID_EVENT',
  'INVALID_NOTIFICATION',
  'INVALID_SCHEDULE',
  'NOT_MONTH_END',
  'INACTIVE_NOTIFICATION',
  'MISSING_OPERATIONAL_KEY',
  'WATCHDOG_FAILED',
  'CLEANUP_FAILED',
]);
const serviceErrors = new Set([
  'AccessDenied',
  'AccessDeniedException',
  'AbortError',
  'TimeoutError',
  'ParameterNotFound',
  'InvalidKeyId',
  'ResourceNotFoundException',
  'ValidationException',
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'TransactionCanceledException',
  'QueueDoesNotExist',
  'KMSAccessDeniedException',
]);

function failureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'UNKNOWN';
  if (inputErrors.has(error.message)) return error.message;
  if (serviceErrors.has(error.name)) return error.name;
  if (/^環境変数 [A-Z_]+ が設定されていません$/.test(error.message))
    return 'MISSING_ENVIRONMENT_VARIABLE';
  return 'UNKNOWN';
}

export async function handler(event: unknown): Promise<SQSBatchResponse | void> {
  const backupOnly =
    event !== null &&
    typeof event === 'object' &&
    Object.keys(event).join(',') === 'operation' &&
    (event as { operation?: unknown }).operation === 'backup';
  if (backupOnly) {
    if ((process.env.BACKUPS_ENABLED ?? process.env.NOTIFICATIONS_ENABLED) !== 'true')
      throw new Error('BACKUPS_DISABLED');
    try {
      await backup(Date.now());
      return;
    } catch {
      await operationalAlert('notify', 'backup');
      throw new Error('NOTIFY_ENTRY_FAILED');
    }
  }
  if (process.env.NOTIFICATIONS_ENABLED !== 'true') throw new Error('NOTIFICATIONS_DISABLED');
  let operation = 'unknown';
  let stage: TriggerStage | 'input' | 'environment' | 'operationalKey' | 'watchdog' | 'cleanup' =
    'input';
  let kind: 'dailyReminder' | 'monthlySummary' | undefined;
  let targetDate: string | undefined;
  try {
    if (event && typeof event === 'object' && 'Records' in event) {
      operation = 'sqs';
      const records = (event as SQSEvent).Records;
      if (!Array.isArray(records) || records.length !== 1) throw new Error('INVALID_BATCH');
      const failures: { itemIdentifier: string }[] = [];
      for (const record of records) {
        try {
          if (
            record.eventSource !== 'aws:sqs' ||
            record.eventSourceARN !== requireEnv('NOTIFICATION_QUEUE_ARN')
          )
            throw new Error('INVALID_SOURCE');
          const job = parseJob(JSON.parse(record.body));
          const options: DispatchOptions = {
            env: requireEnv('ENV'),
            operationalKey: await operationalKey(),
          };
          const result = await dispatchFamily(job, options);
          if (result.outcome === 'retry') {
            await defer(record.receiptHandle, result.at, Date.now());
            failures.push({ itemIdentifier: record.messageId });
          } else await completeRunFamily(job, job.familyId);
        } catch {
          await operationalAlert('notify', 'internal');
          failures.push({ itemIdentifier: record.messageId });
        }
      }
      return { batchItemFailures: failures };
    }
    if (!event || typeof event !== 'object') throw new Error('INVALID_EVENT');
    const input = event as Record<string, unknown>;
    if (input.operation === 'watchdog') {
      operation = stage = 'watchdog';
      await watchdog(Date.now());
      return;
    }
    if (input.operation === 'cleanup') {
      operation = stage = 'cleanup';
      await cleanup(Date.now());
      return;
    }
    if (input.kind === 'dailyReminder' || input.kind === 'monthlySummary') kind = input.kind;
    operation = input.operation === 'scheduled' ? 'scheduled' : 'direct';
    let trigger;
    if (input.operation === 'scheduled') {
      if (
        Object.keys(input).sort().join(',') !== 'kind,operation,scheduledTime' ||
        (input.kind !== 'dailyReminder' && input.kind !== 'monthlySummary') ||
        typeof input.scheduledTime !== 'string'
      )
        throw new Error('INVALID_EVENT');
      trigger = fromScheduledTime(input.kind, input.scheduledTime);
      if (!trigger) return;
    } else trigger = parseTrigger(input);
    targetDate = trigger.targetDate;
    stage = 'environment';
    const env = requireEnv('ENV');
    stage = 'operationalKey';
    const key = await operationalKey();
    await dispatchTrigger(trigger, { env, operationalKey: key }, (dispatchStage) => {
      stage = dispatchStage;
    });
  } catch (error) {
    logger.error({
      event: 'NOTIFY_ENTRY_DIAGNOSTIC',
      operation,
      stage,
      kind,
      targetDate,
      errorCode: failureCode(error),
    });
    await operationalAlert('notify', 'invalid');
    throw new Error('NOTIFY_ENTRY_FAILED');
  }
}
