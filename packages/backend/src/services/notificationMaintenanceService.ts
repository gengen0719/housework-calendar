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
const backupPrefix = () => `housework-${requireEnv('ENV')}-notifications-`;
export function ownedBackup(backup: BackupSummary): boolean {
  return (
    backup.TableArn === requireEnv('NOTIFICATION_DISPATCHES_ARN') &&
    !!backup.BackupArn?.startsWith(`${requireEnv('NOTIFICATION_DISPATCHES_ARN')}/backup/`) &&
    !!backup.BackupName?.startsWith(backupPrefix())
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
export async function backup(now: number): Promise<void> {
  let failure = false;
  try {
    const name = `${backupPrefix()}${jstDateOf(new Date(now))}`;
    let summaries: BackupSummary[] = [];
    let last: string | undefined;
    do {
      const r = await db.send(
        new ListBackupsCommand({
          TableName: dispatchTable(),
          BackupType: 'USER',
          ExclusiveStartBackupArn: last,
        }),
        options(),
      );
      summaries.push(...(r.BackupSummaries ?? []));
      last = r.LastEvaluatedBackupArn;
    } while (last);
    summaries = summaries.filter(ownedBackup);
    if (!summaries.some((b) => b.BackupName === name)) {
      try {
        const r = await db.send(
          new CreateBackupCommand({ TableName: dispatchTable(), BackupName: name }),
          options(),
        );
        const arn = r.BackupDetails?.BackupArn;
        if (!arn || !arn.startsWith(`${requireEnv('NOTIFICATION_DISPATCHES_ARN')}/backup/`))
          throw new Error('INVALID_BACKUP');
        await saveBackup(arn, now);
      } catch {
        failure = true;
      }
      // 保存前の中断や応答不明にも同じ一覧で追いつく。成功した作成も照合できる。
      let cursor: string | undefined;
      do {
        const r = await db.send(
          new ListBackupsCommand({
            TableName: dispatchTable(),
            BackupType: 'USER',
            ExclusiveStartBackupArn: cursor,
          }),
          options(),
        );
        summaries.push(...(r.BackupSummaries ?? []).filter(ownedBackup));
        cursor = r.LastEvaluatedBackupArn;
      } while (cursor);
    }
    for (const summary of new Map(summaries.map((b) => [b.BackupArn, b])).values()) {
      if (!summary.BackupArn || !summary.BackupCreationDateTime) continue;
      await saveBackup(summary.BackupArn, summary.BackupCreationDateTime.getTime());
    }
    // 台帳だけに残る作成もDescribeで検証。別テーブルのARNは絶対に要求しない。
    for (const row of await listMetadataPartition('BACKUPS')) {
      if (
        typeof row.sk !== 'string' ||
        !row.sk.startsWith(`${requireEnv('NOTIFICATION_DISPATCHES_ARN')}/backup/`)
      )
        continue;
      if (typeof row.createdAt !== 'number' || now - row.createdAt <= 7 * 86400000) continue;
      const result = await db.send(new DescribeBackupCommand({ BackupArn: row.sk }), options());
      const desc = result.BackupDescription;
      if (
        desc?.SourceTableDetails?.TableArn !== requireEnv('NOTIFICATION_DISPATCHES_ARN') ||
        !desc.BackupDetails?.BackupName?.startsWith(backupPrefix())
      )
        continue;
      await db.send(new DeleteBackupCommand({ BackupArn: row.sk }), options());
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
