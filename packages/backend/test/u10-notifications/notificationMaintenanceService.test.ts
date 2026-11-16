import { FAKE_U10_RETRY_KEY, FAKE_U10_BACKUP_NAME } from '../fixtures/fakeSecrets';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  DynamoDBClient,
  ListBackupsCommand,
  CreateBackupCommand,
  DescribeBackupCommand,
  DeleteBackupCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  watchdog,
  queueAge,
  cleanup,
  backup,
  ownedBackup,
} from '../../src/services/notificationMaintenanceService';
import * as repo from '../../src/repositories/notificationRepository';
import * as bodies from '../../src/repositories/notificationPayloadRepository';
import * as alert from '../../src/services/operationalAlertService';
const cw = mockClient(CloudWatchClient),
  db = mockClient(DynamoDBClient),
  doc = mockClient(DynamoDBDocumentClient);
const tableArn = 'arn:aws:dynamodb:ap-northeast-1:123456789012:table/dispatches';
beforeEach(() => {
  cw.reset();
  db.reset();
  doc.reset();
  doc.on(QueryCommand).resolves({ Items: [] });
  process.env.ENV = 'staging';
  process.env.NOTIFICATION_QUEUE_NAME = 'work';
  process.env.NOTIFICATION_DISPATCHES_TABLE = 'dispatches';
  process.env.NOTIFICATION_DISPATCHES_ARN = tableArn;
  vi.spyOn(alert, 'operationalAlert').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
describe('起動と滞留の見守り', () => {
  it('固定したキューの直近5分を読む', async () => {
    cw.on(GetMetricStatisticsCommand).resolves({ Datapoints: [{ Maximum: 12 }, { Maximum: 3 }] });
    expect(await queueAge(1000000)).toBe(12);
    expect(cw.commandCalls(GetMetricStatisticsCommand)[0]!.args[0].input).toMatchObject({
      Namespace: 'AWS/SQS',
      Dimensions: [{ Name: 'QueueName', Value: 'work' }],
      StartTime: new Date(700000),
      EndTime: new Date(1000000),
    });
  });
  it('予定前は正常値1を出す', async () => {
    cw.on(GetMetricStatisticsCommand).resolves({});
    cw.on(PutMetricDataCommand).resolves({});
    expect(await watchdog(Date.parse('2027-01-31T06:00:00Z'))).toBe(true);
    expect(cw.commandCalls(PutMetricDataCommand)[0]!.args[0].input.MetricData?.[0]?.Value).toBe(1);
  });
  it('予定が5分過ぎてRUNがなければ0', async () => {
    cw.on(GetMetricStatisticsCommand).resolves({});
    cw.on(PutMetricDataCommand).resolves({});
    vi.spyOn(repo, 'getRun').mockResolvedValue(undefined);
    expect(await watchdog(Date.parse('2027-01-31T07:05:00Z'))).toBe(false);
    expect(alert.operationalAlert).toHaveBeenCalledWith('notify', 'runMissing', expect.anything());
  });
  it('0家族の列挙完了も正常', async () => {
    cw.on(GetMetricStatisticsCommand).resolves({});
    cw.on(PutMetricDataCommand).resolves({});
    vi.spyOn(repo, 'getRun').mockResolvedValue({
      expected: 0,
      completed: 0,
      enumerationDone: true,
      ttl: 0,
    });
    expect(await watchdog(Date.parse('2027-01-31T07:05:00Z'))).toBe(true);
  });
  it('120秒の滞留は異常', async () => {
    cw.on(GetMetricStatisticsCommand).resolves({ Datapoints: [{ Maximum: 120 }] });
    cw.on(PutMetricDataCommand).resolves({});
    expect(await watchdog(Date.parse('2027-01-31T06:00:00Z'))).toBe(false);
  });
  it('監視自身の失敗を正常値で隠さない', async () => {
    cw.on(GetMetricStatisticsCommand).rejects(new Error('offline'));
    await expect(watchdog(0)).rejects.toThrow();
    expect(cw.commandCalls(PutMetricDataCommand)).toHaveLength(0);
  });
});
describe('本文の清掃', () => {
  it.each([23 * 3600000 - 1, 23 * 3600000, 24 * 3600000])('%sの保持境界', async (age) => {
    doc.on(GetCommand).resolves({});
    doc.on(PutCommand).resolves({});
    const now = Date.parse('2027-01-31T08:00:00Z');
    vi.spyOn(bodies, 'listPayloads')
      .mockResolvedValueOnce([
        {
          scheduledDate: '2027-01-29',
          dispatchKey: FAKE_U10_RETRY_KEY,
          scheduledAt: now - age,
          destination: 'group',
          text: 'body',
          ttl: 0,
        },
      ])
      .mockResolvedValue([]);
    const del = vi.spyOn(bodies, 'deletePayload').mockResolvedValue();
    await cleanup(now);
    expect(del).toHaveBeenCalledTimes(age >= 23 * 3600000 ? 1 : 0);
  });
  it('読込失敗では清掃完了カーソルを進めない', async () => {
    doc.on(GetCommand).resolves({});
    vi.spyOn(bodies, 'listPayloads').mockRejectedValue(new Error('offline'));
    await expect(cleanup(0)).rejects.toThrow();
    expect(doc.commandCalls(PutCommand)).toHaveLength(0);
  });
  it('清掃の停止した日から再開する', async () => {
    doc.on(GetCommand).resolves({ Item: { date: '2027-01-27' } });
    doc.on(PutCommand).resolves({});
    const list = vi.spyOn(bodies, 'listPayloads').mockResolvedValue([]);
    await cleanup(Date.parse('2027-01-31T08:00:00Z'));
    expect(list.mock.calls[0]?.[0]).toBe('2027-01-27');
  });
});
describe('メタデータだけのバックアップ', () => {
  const now = Date.parse('2027-01-31T08:00:00Z');
  const own = {
    TableArn: tableArn,
    BackupArn: `${tableArn}/backup/owned`,
    BackupName: FAKE_U10_BACKUP_NAME,
    BackupCreationDateTime: new Date(now),
  };
  it('他の表や名前は削除対象にしない', () => {
    expect(ownedBackup(own)).toBe(true);
    expect(ownedBackup({ ...own, TableArn: 'another' })).toBe(false);
    expect(ownedBackup({ ...own, BackupName: 'other' })).toBe(false);
  });
  it('自テーブル名でのみ一覧を取る', async () => {
    db.on(ListBackupsCommand).resolves({ BackupSummaries: [own] });
    doc.on(PutCommand).resolves({});
    doc.on(QueryCommand).resolves({ Items: [] });
    await backup(now);
    expect(db.commandCalls(ListBackupsCommand)[0]!.args[0].input.TableName).toBe('dispatches');
    expect(db.commandCalls(CreateBackupCommand)).toHaveLength(0);
  });
  it('一覧から台帳の欠落を補う', async () => {
    db.on(ListBackupsCommand).resolves({ BackupSummaries: [own] });
    doc.on(PutCommand).resolves({});
    doc.on(QueryCommand).resolves({ Items: [] });
    await backup(now);
    expect(doc.commandCalls(PutCommand)[0]!.args[0].input.Item?.sk).toBe(own.BackupArn);
  });
  it('作成の応答不明でも一覧で照合し失敗を知らせる', async () => {
    db.on(ListBackupsCommand)
      .resolvesOnce({ BackupSummaries: [] })
      .resolves({ BackupSummaries: [own] });
    db.on(CreateBackupCommand).rejects(new Error('unknown'));
    doc.on(PutCommand).resolves({});
    doc.on(QueryCommand).resolves({ Items: [] });
    await expect(backup(now)).rejects.toThrow();
    expect(doc.commandCalls(PutCommand)).toHaveLength(1);
  });
  it('7日ちょうどは削除しない', async () => {
    db.on(ListBackupsCommand).resolves({ BackupSummaries: [own] });
    doc.on(PutCommand).resolves({});
    doc
      .on(QueryCommand)
      .resolves({ Items: [{ sk: own.BackupArn, createdAt: now - 7 * 86400000 }] });
    await backup(now);
    expect(db.commandCalls(DeleteBackupCommand)).toHaveLength(0);
  });
  it('7日超はDescribeで所有を確かめて削除', async () => {
    db.on(ListBackupsCommand).resolves({ BackupSummaries: [own] });
    doc.on(PutCommand).resolves({});
    doc
      .on(QueryCommand)
      .resolves({ Items: [{ sk: own.BackupArn, createdAt: now - 7 * 86400000 - 1 }] });
    db.on(DescribeBackupCommand).resolves({
      BackupDescription: {
        SourceTableDetails: { TableArn: tableArn },
        // U11: 所有確認に加え、削除可能な状態も確認する。
        BackupDetails: { BackupName: own.BackupName, BackupStatus: 'AVAILABLE' },
      },
    } as never);
    db.on(DeleteBackupCommand).resolves({});
    await backup(now);
    expect(db.commandCalls(DeleteBackupCommand)).toHaveLength(1);
  });
  it('Describeの表が違えば削除0回', async () => {
    db.on(ListBackupsCommand).resolves({ BackupSummaries: [own] });
    doc.on(PutCommand).resolves({});
    doc.on(QueryCommand).resolves({ Items: [{ sk: own.BackupArn, createdAt: 0 }] });
    db.on(DescribeBackupCommand).resolves({
      BackupDescription: { SourceTableDetails: { TableArn: 'other' } },
    } as never);
    await backup(now);
    expect(db.commandCalls(DeleteBackupCommand)).toHaveLength(0);
  });
});
