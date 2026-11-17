import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  CreateBackupCommand,
  DeleteBackupCommand,
  DescribeBackupCommand,
  DynamoDBClient,
  ListBackupsCommand,
  type BackupSummary,
} from '@aws-sdk/client-dynamodb';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { jstDateOf } from '@housework/shared';
import { docClient } from '../lib/dynamoClient';
import { requireEnv } from '../lib/config';
import {
  dispatchTable,
  getRun,
  listMetadataPartition,
  conditionalFailure,
} from '../repositories/notificationRepository';
import { listPayloads, deletePayload } from '../repositories/notificationPayloadRepository';
import { operationalAlert } from './operationalAlertService';
import { fromScheduledTime } from './notificationTime';
const cw = new CloudWatchClient({ maxAttempts: 1 });
const db = new DynamoDBClient({ maxAttempts: 1 });
const ssm = new SSMClient({ maxAttempts: 1 });
const options = () => ({ abortSignal: AbortSignal.timeout(2000) });
let keyPromise: Promise<string> | undefined;
export function operationalKey(): Promise<string> {
  return (keyPromise ??= ssm
    .send(
      new GetParameterCommand({
        Name: `${requireEnv('SSM_PREFIX')}/notifications/operational-hash-key`,
        WithDecryption: true,
      }),
      options(),
    )
    .then((r) => {
      if (!r.Parameter?.Value) throw new Error('MISSING_OPERATIONAL_KEY');
      return r.Parameter.Value;
    })
    .catch((e) => {
      keyPromise = undefined;
      throw e;
    }));
}
export async function queueAge(now: number): Promise<number> {
  const r = await cw.send(
    new GetMetricStatisticsCommand({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Dimensions: [{ Name: 'QueueName', Value: requireEnv('NOTIFICATION_QUEUE_NAME') }],
      Period: 60,
      Statistics: ['Maximum'],
      StartTime: new Date(now - 300000),
      EndTime: new Date(now),
    }),
    options(),
  );
  return Math.max(0, ...(r.Datapoints ?? []).map((p) => p.Maximum ?? 0));
}
export async function watchdog(now: number): Promise<boolean> {
  let healthy = true;
  try {
    if ((await queueAge(now)) >= 120) {
      healthy = false;
      await operationalAlert('notify', 'queueAge');
    }
    const date = jstDateOf(new Date(now));
    for (const kind of ['dailyReminder', 'monthlySummary'] as const) {
      const scheduledAt = Date.parse(
        `${date}T${kind === 'dailyReminder' ? '16' : '21'}:00:00+09:00`,
      );
      const trigger = fromScheduledTime(kind, new Date(scheduledAt).toISOString());
      if (trigger && now >= scheduledAt + 300000) {
        const run = await getRun(trigger);
        if (!run || !run.enumerationDone || run.completed < run.expected) {
          healthy = false;
          await operationalAlert('notify', 'runMissing', trigger);
        }
      }
    }
    await cw.send(
      new PutMetricDataCommand({
        Namespace: `Housework/${requireEnv('ENV')}`,
        MetricData: [
          {
            MetricName: 'NotifyHealth',
            Value: healthy ? 1 : 0,
            Unit: 'Count',
            Timestamp: new Date(now),
          },
        ],
      }),
      options(),
    );
    return healthy;
  } catch {
    await operationalAlert('notify', 'internal');
    throw new Error('WATCHDOG_FAILED');
  }
}
/** 清掃が止まった日も取り直せるカーソル。24時間を過ぎた読取は別途拒否する。 */
export async function cleanup(now: number): Promise<void> {
  try {
    const key = { pk: 'OPS#cleanup', sk: 'META' };
    const saved = await docClient.send(
      new GetCommand({ TableName: dispatchTable(), Key: key, ConsistentRead: true }),
      options(),
    );
    let date =
      typeof saved.Item?.date === 'string'
        ? saved.Item.date
        : jstDateOf(new Date(now - 2 * 86400000));
    const today = jstDateOf(new Date(now));
    for (let pages = 0; date <= today && pages < 40; pages++) {
      const rows = await listPayloads(date);
      for (const row of rows) {
        if (now - row.scheduledAt >= 23 * 3600000) {
          if (now - row.scheduledAt >= 24 * 3600000) await operationalAlert('notify', 'cleanup');
          await deletePayload(row.scheduledDate, row.dispatchKey);
        }
      }
      const tomorrow = jstDateOf(new Date(Date.parse(`${date}T00:00:00+09:00`) + 86400000));
      // 当日と前日は次の回も読む。失敗なら進めない。
      if (date < jstDateOf(new Date(now - 86400000)))
        await docClient.send(
          new PutCommand({ TableName: dispatchTable(), Item: { ...key, date: tomorrow } }),
          options(),
        );
      date = tomorrow;
    }
    // TTLだけに任せず、日別ポインタのQueryで35日を過ぎた送信記録を明示削除。
    for (const date of [jstDateOf(new Date(now - 86400000)), jstDateOf(new Date(now))])
      for (const row of await listMetadataPartition(`EXPIRY#${date}`)) {
        if (
          typeof row.targetPk !== 'string' ||
          !row.targetPk.startsWith('F#') ||
          typeof row.targetSk !== 'string' ||
          typeof row.sk !== 'string'
        )
          continue;
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: dispatchTable(),
              Key: { pk: row.targetPk, sk: row.targetSk },
              ConditionExpression: 'attribute_not_exists(pk) OR ttl <= :now',
              ExpressionAttributeValues: { ':now': Math.floor(now / 1000) },
            }),
            options(),
          );
          await docClient.send(
            new DeleteCommand({ TableName: dispatchTable(), Key: { pk: row.pk, sk: row.sk } }),
            options(),
          );
        } catch (e) {
          if (!conditionalFailure(e)) throw e;
        }
      }
  } catch {
    await operationalAlert('notify', 'cleanup');
    throw new Error('CLEANUP_FAILED');
  }
}
interface BackupTarget {
  table: string;
  arn: string;
  kind: 'notifications' | 'adjustments';
}
const notificationBackupTarget = (): BackupTarget => ({
  table: dispatchTable(),
  arn: requireEnv('NOTIFICATION_DISPATCHES_ARN'),
  kind: 'notifications',
});
const backupPrefix = (target: BackupTarget) => `housework-${requireEnv('ENV')}-${target.kind}-`;
export function ownedBackup(
  backup: BackupSummary,
  target: BackupTarget = notificationBackupTarget(),
): boolean {
  return (
    backup.TableArn === target.arn &&
    !!backup.BackupArn?.startsWith(`${target.arn}/backup/`) &&
    !!backup.BackupName?.startsWith(backupPrefix(target))
  );
}
async function saveBackup(arn: string, createdAt: number): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: dispatchTable(),
      Item: { pk: 'BACKUPS', sk: arn, createdAt, ttl: Math.floor(createdAt / 1000) + 35 * 86400 },
    }),
    options(),
  );
}
/** 応答不明・台帳保存失敗でも、名前と自テーブルARNを検証した一覧で照合する。 */
async function backupTarget(now: number, target: BackupTarget, deadline: number): Promise<void> {
  const bounded = () => {
    const remaining = deadline - Date.now();
    if (remaining < 1) throw new Error('BACKUP_DEADLINE');
    return { abortSignal: AbortSignal.timeout(Math.min(2000, remaining)) };
  };
  let failure = false;
  try {
    const name = `${backupPrefix(target)}${jstDateOf(new Date(now))}`;
    let summaries: BackupSummary[] = [];
    let last: string | undefined;
    do {
      const r = await db.send(
        new ListBackupsCommand({
          TableName: target.table,
          BackupType: 'USER',
          ExclusiveStartBackupArn: last,
        }),
        bounded(),
      );
      summaries.push(...(r.BackupSummaries ?? []));
      last = r.LastEvaluatedBackupArn;
    } while (last);
    summaries = summaries.filter((b) => ownedBackup(b, target));
    if (!summaries.some((b) => b.BackupName === name)) {
      try {
        const r = await db.send(
          new CreateBackupCommand({ TableName: target.table, BackupName: name }),
          bounded(),
        );
        const arn = r.BackupDetails?.BackupArn;
        if (!arn || !arn.startsWith(`${target.arn}/backup/`)) throw new Error('INVALID_BACKUP');
        await saveBackup(arn, now);
      } catch {
        failure = true;
      }
      // 保存前の中断や応答不明にも同じ一覧で追いつく。成功した作成も照合できる。
      let cursor: string | undefined;
      do {
        const r = await db.send(
          new ListBackupsCommand({
            TableName: target.table,
            BackupType: 'USER',
            ExclusiveStartBackupArn: cursor,
          }),
          bounded(),
        );
        summaries.push(...(r.BackupSummaries ?? []).filter((b) => ownedBackup(b, target)));
        cursor = r.LastEvaluatedBackupArn;
      } while (cursor);
    }
    for (const summary of new Map(summaries.map((b) => [b.BackupArn, b])).values()) {
      if (!summary.BackupArn || !summary.BackupCreationDateTime) continue;
      await saveBackup(summary.BackupArn, summary.BackupCreationDateTime.getTime());
    }
    // 台帳だけに残る作成もDescribeで検証。別テーブルのARNは絶対に要求しない。
    for (const row of await listMetadataPartition('BACKUPS')) {
      if (typeof row.sk !== 'string' || !row.sk.startsWith(`${target.arn}/backup/`)) continue;
      if (typeof row.createdAt !== 'number' || now - row.createdAt <= 7 * 86400000) continue;
      try {
        const result = await db.send(new DescribeBackupCommand({ BackupArn: row.sk }), bounded());
        const desc = result.BackupDescription;
        if (
          desc?.SourceTableDetails?.TableArn !== target.arn ||
          !desc.BackupDetails?.BackupName?.startsWith(backupPrefix(target)) ||
          desc.BackupDetails.BackupStatus !== 'AVAILABLE'
        )
          continue;
        await db.send(new DeleteBackupCommand({ BackupArn: row.sk }), bounded());
      } catch (error) {
        // 削除後・台帳消去前の中断も再開できる。他の障害は隠さない。
        if (!(error instanceof Error) || error.name !== 'BackupNotFoundException') throw error;
      }
      await docClient.send(
        new DeleteCommand({ TableName: dispatchTable(), Key: { pk: 'BACKUPS', sk: row.sk } }),
        options(),
      );
    }
    if (failure) {
      await operationalAlert('notify', 'backup');
      throw new Error('BACKUP_CREATE_UNCERTAIN');
    }
  } catch {
    await operationalAlert('notify', 'backup');
    throw new Error('BACKUP_FAILED');
  }
}

/** 固定された二表のみ。片方の障害でも他方を試み、最後に失敗を返す。 */
export async function backup(now: number): Promise<void> {
  const targets = [notificationBackupTarget()];
  if (process.env.ADJUSTMENTS_TABLE || process.env.ADJUSTMENTS_ARN)
    targets.push({
      table: requireEnv('ADJUSTMENTS_TABLE'),
      arn: requireEnv('ADJUSTMENTS_ARN'),
      kind: 'adjustments',
    });
  const deadline = Date.now() + 25000;
  let failed = false;
  for (const target of targets) {
    try {
      await backupTarget(now, target, deadline);
    } catch {
      failed = true;
    }
  }
  if (failed) throw new Error('BACKUP_FAILED');
}
