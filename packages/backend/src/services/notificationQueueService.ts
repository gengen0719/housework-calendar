import {
  SQSClient,
  SendMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import type { NotificationTrigger } from '@housework/shared';
import { requireEnv } from '../lib/config';
import { parseTrigger } from './notificationTime';
const sqs = new SQSClient({ maxAttempts: 1 });
export interface NotificationJob extends NotificationTrigger {
  familyId: string;
}
export function parseJob(value: unknown): NotificationJob {
  if (!value || typeof value !== 'object') throw new Error('INVALID_JOB');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(',') !== 'familyId,kind,targetDate' ||
    typeof v.familyId !== 'string' ||
    !/^[0-9a-f-]{36}$/.test(v.familyId)
  )
    throw new Error('INVALID_JOB');
  return { ...parseTrigger({ kind: v.kind, targetDate: v.targetDate }), familyId: v.familyId };
}
export async function enqueue(job: NotificationJob): Promise<void> {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: requireEnv('NOTIFICATION_QUEUE_URL'),
      MessageBody: JSON.stringify(job),
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
}
export async function defer(receiptHandle: string, at: number, now: number): Promise<void> {
  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: requireEnv('NOTIFICATION_QUEUE_URL'),
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: Math.min(43200, Math.max(1, Math.ceil((at - now) / 1000))),
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
}
export async function oldestAge(): Promise<number> {
  // SQSには年齢のGetQueueAttributesがないため、CloudWatchの標準メトリクスを運用側で読む。
  const r = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: requireEnv('NOTIFICATION_QUEUE_URL'),
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'CreatedTimestamp',
      ],
    }),
    { abortSignal: AbortSignal.timeout(2000) },
  );
  return (
    Number(r.Attributes?.ApproximateNumberOfMessages ?? 0) +
    Number(r.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0)
  );
}
