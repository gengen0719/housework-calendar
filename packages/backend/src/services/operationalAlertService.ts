import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { NotificationKind, NotificationReason } from '@housework/shared';
import { logger } from '../lib/logger';
const sns = new SNSClient({ maxAttempts: 1 });
export interface AlertDetails {
  kind?: NotificationKind;
  targetDate?: string;
  familyRef?: string;
  correlationId?: string;
}
/** 許可した定型項目だけ。任意の例外・要求・名前・本文は受け付けない。 */
export async function operationalAlert(
  entry: 'api' | 'line' | 'notify',
  reason: NotificationReason,
  details: AlertDetails = {},
): Promise<void> {
  const message = {
    event: 'OPERATIONAL_FAILURE',
    entry,
    reason,
    ...(details.kind ? { kind: details.kind } : {}),
    ...(details.targetDate ? { targetDate: details.targetDate } : {}),
    ...(details.familyRef ? { familyRef: details.familyRef } : {}),
    ...(details.correlationId ? { correlationId: details.correlationId } : {}),
    runbook: 'docs/notification-runbook.md',
  };
  logger.error(message);
  const topic = process.env.ALERT_TOPIC_ARN;
  if (!topic) return;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn: topic,
        Subject: `Housework ${process.env.ENV ?? 'unknown'} ${entry} failure`,
        Message: JSON.stringify(message),
      }),
      { abortSignal: AbortSignal.timeout(2000) },
    );
  } catch {
    logger.error({ event: 'OPERATIONAL_ALERT_FAILED', entry, reason: 'internal' });
    throw new Error('OPERATIONAL_ALERT_FAILED');
  }
}
/** 対話の返事は変更しない。通知経路自体の失敗も定型ログで明示する。 */
export async function reportEntryFailure(entry: 'api' | 'line'): Promise<void> {
  try {
    await operationalAlert(entry, 'internal');
  } catch {
    /* operationalAlertが定型の失敗を記録済み。 */
  }
}
