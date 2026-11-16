import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { parseTrigger, fromScheduledTime } from '../services/notificationTime';
import {
  dispatchFamily,
  dispatchTrigger,
  type DispatchOptions,
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
export async function handler(event: unknown): Promise<SQSBatchResponse | void> {
  if (process.env.NOTIFICATIONS_ENABLED !== 'true') throw new Error('NOTIFICATIONS_DISABLED');
  try {
    if (event && typeof event === 'object' && 'Records' in event) {
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
      await watchdog(Date.now());
      return;
    }
    if (input.operation === 'cleanup') {
      await cleanup(Date.now());
      return;
    }
    if (input.operation === 'backup') {
      await backup(Date.now());
      return;
    }
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
    await dispatchTrigger(trigger, {
      env: requireEnv('ENV'),
      operationalKey: await operationalKey(),
    });
  } catch {
    await operationalAlert('notify', 'invalid');
    throw new Error('NOTIFY_ENTRY_FAILED');
  }
}
