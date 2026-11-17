import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CreateBackupCommand,
  DeleteBackupCommand,
  DescribeBackupCommand,
  DynamoDBClient,
  ListBackupsCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { backup, ownedBackup } from '../../src/services/notificationMaintenanceService';
import { handler } from '../../src/entries/notify';
import * as ops from '../../src/services/notificationMaintenanceService';
import * as alerts from '../../src/services/operationalAlertService';
const db = mockClient(DynamoDBClient),
  doc = mockClient(DynamoDBDocumentClient);
const arn = (name: string) => `arn:aws:dynamodb:ap-northeast-1:123456789012:table/${name}`;
const now = Date.parse('2027-01-31T08:00:00Z');
const target = { table: 'adjustments', arn: arn('adjustments'), kind: 'adjustments' as const };
const own = (table: string) => ({
  TableArn: arn(table),
  BackupArn: `${arn(table)}/backup/owned`,
  BackupName: `housework-staging-${table === 'dispatches' ? 'notifications' : 'adjustments'}-2027-01-31`,
  BackupCreationDateTime: new Date(now),
});
beforeEach(() => {
  db.reset();
  doc.reset();
  process.env.ENV = 'staging';
  process.env.NOTIFICATION_DISPATCHES_TABLE = 'dispatches';
  process.env.NOTIFICATION_DISPATCHES_ARN = arn('dispatches');
  process.env.ADJUSTMENTS_TABLE = 'adjustments';
  process.env.ADJUSTMENTS_ARN = target.arn;
  doc.on(PutCommand).resolves({});
  doc.on(QueryCommand).resolves({ Items: [] });
  db.on(ListBackupsCommand).callsFake((input) => ({
    BackupSummaries: [own(String(input.TableName))],
  }));
  vi.spyOn(alerts, 'operationalAlert').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const key of [
    'ADJUSTMENTS_TABLE',
    'ADJUSTMENTS_ARN',
    'BACKUPS_ENABLED',
    'NOTIFICATIONS_ENABLED',
  ])
    delete process.env[key];
});
describe('通知と調整の許可表バックアップ', () => {
  it('二表をそれぞれ固定名で照合し台帳に記録する', async () => {
    await backup(now);
    expect(db.commandCalls(ListBackupsCommand).map((c) => c.args[0].input.TableName)).toEqual([
      'dispatches',
      'adjustments',
    ]);
    expect(doc.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.sk)).toContain(
      own('adjustments').BackupArn,
    );
  });
  it('別表・別prefix・別環境のバックアップを所有しない', () => {
    const b = own('adjustments');
    expect(ownedBackup(b, target)).toBe(true);
    expect(ownedBackup({ ...b, TableArn: arn('other') }, target)).toBe(false);
    expect(ownedBackup({ ...b, BackupArn: `${arn('other')}/backup/x` }, target)).toBe(false);
    expect(ownedBackup({ ...b, BackupName: 'housework-production-adjustments-x' }, target)).toBe(
      false,
    );
  });
  it('通知表の失敗でも調整表を処理する', async () => {
    db.on(ListBackupsCommand, { TableName: 'dispatches' }).rejects(new Error('offline'));
    await expect(backup(now)).rejects.toThrow('BACKUP_FAILED');
    expect(
      db.commandCalls(ListBackupsCommand).some((c) => c.args[0].input.TableName === 'adjustments'),
    ).toBe(true);
    expect(alerts.operationalAlert).toHaveBeenCalledWith('notify', 'backup');
  });
  it('調整の作成応答不明でも一覧から台帳を回復して失敗通知する', async () => {
    db.on(ListBackupsCommand, { TableName: 'adjustments' })
      .resolvesOnce({ BackupSummaries: [] })
      .resolves({ BackupSummaries: [own('adjustments')] });
    db.on(CreateBackupCommand).rejects(new Error('unknown result'));
    await expect(backup(now)).rejects.toThrow();
    expect(
      doc
        .commandCalls(PutCommand)
        .some((c) => c.args[0].input.Item!.sk === own('adjustments').BackupArn),
    ).toBe(true);
    expect(alerts.operationalAlert).toHaveBeenCalled();
  });
  it.each([7 * 86400000, 7 * 86400000 + 1])('保持%sの境界', async (age) => {
    doc
      .on(QueryCommand)
      .resolves({ Items: [{ sk: own('adjustments').BackupArn, createdAt: now - age }] });
    db.on(DescribeBackupCommand).resolves({
      BackupDescription: {
        SourceTableDetails: { TableArn: target.arn },
        BackupDetails: { BackupName: own('adjustments').BackupName, BackupStatus: 'AVAILABLE' },
      },
    } as never);
    db.on(DeleteBackupCommand).resolves({});
    await backup(now);
    expect(db.commandCalls(DeleteBackupCommand)).toHaveLength(age > 7 * 86400000 ? 1 : 0);
  });
  it('AVAILABLE以外のバックアップは削除しない', async () => {
    doc.on(QueryCommand).resolves({ Items: [{ sk: own('adjustments').BackupArn, createdAt: 0 }] });
    db.on(DescribeBackupCommand).resolves({
      BackupDescription: {
        SourceTableDetails: { TableArn: target.arn },
        BackupDetails: { BackupName: own('adjustments').BackupName, BackupStatus: 'CREATING' },
      },
    } as never);
    await backup(now);
    expect(db.commandCalls(DeleteBackupCommand)).toHaveLength(0);
  });
  it('設定の片側が欠けたら黙って対象を落とさない', async () => {
    delete process.env.ADJUSTMENTS_ARN;
    await expect(backup(now)).rejects.toThrow();
  });
  it('backup明示falseは通知trueでもバックアップを開始しない', async () => {
    process.env.BACKUPS_ENABLED = 'false';
    process.env.NOTIFICATIONS_ENABLED = 'true';
    const call = vi.spyOn(ops, 'backup');
    await expect(handler({ operation: 'backup' })).rejects.toThrow('BACKUPS_DISABLED');
    expect(call).not.toHaveBeenCalled();
  });
  it('backup入口失敗は定型通知だけを呼ぶ', async () => {
    process.env.BACKUPS_ENABLED = 'true';
    process.env.NOTIFICATIONS_ENABLED = 'false';
    vi.spyOn(ops, 'backup').mockRejectedValue(new Error('private reason and amount'));
    await expect(handler({ operation: 'backup' })).rejects.toThrow('NOTIFY_ENTRY_FAILED');
    expect(alerts.operationalAlert).toHaveBeenCalledWith('notify', 'backup');
    expect(JSON.stringify(vi.mocked(alerts.operationalAlert).mock.calls)).not.toContain('private');
  });
});
