import { resolve } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app';
import { FAKE_ORIGIN_VERIFY_SECRET, FAKE_NOTIFICATION_EMAIL } from '../fixtures/fakeSecrets';
const base = {
  originVerifySecret: FAKE_ORIGIN_VERIFY_SECRET,
  frontendDistPath: resolve('infrastructure', 'test', 'u10-notifications', 'fixtures'),
};
const activation = {
  stagingBackupsEnabled: true,
  stagingNotificationsEnabled: false,
  stagingNotificationEmail: FAKE_NOTIFICATION_EMAIL,
  stagingNotificationChecksPassed: true,
  stagingNotificationBudgetVerified: true,
  stagingNotificationEstimatedJpy: 91,
};
let templates: Record<string, Template>;
beforeAll(() => {
  const app = buildApp(new App({ context: { ...base, ...activation } }));
  templates = {};
  for (const stack of app.node.children) {
    const name = (stack as { stackName?: string }).stackName;
    if (name) templates[name] = Template.fromStack(stack as never);
  }
}, 120000);
const app = () => templates['Housework-staging-App']!;
const resources = (kind: string) =>
  Object.entries(app().findResources(kind)) as [string, { Properties: Record<string, unknown> }][];
function variables(entry: string) {
  return resources('AWS::Lambda::Function')
    .map(
      ([, r]) => (r.Properties.Environment as { Variables?: Record<string, unknown> })?.Variables,
    )
    .find((v) => v?.ENTRY === entry)!;
}
describe('調整表と通知に依存しないバックアップ', () => {
  it.each(['staging', 'production'])('%sは11表で調整表の暗号化と保持を維持', (env) => {
    const data = templates[`Housework-${env}-Data`]!;
    data.resourceCountIs('AWS::DynamoDB::Table', 11);
    const row = Object.entries(data.findResources('AWS::DynamoDB::Table')).find(([id]) =>
      id.startsWith('Adjustments'),
    )![1] as { Properties: Record<string, unknown>; DeletionPolicy: string };
    expect(row.Properties.KeySchema).toEqual([
      { AttributeName: 'familyId', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ]);
    expect(row.Properties.SSESpecification).toEqual({ SSEEnabled: true });
    expect(row.Properties).not.toHaveProperty('GlobalSecondaryIndexes');
    expect(row.Properties).not.toHaveProperty('TimeToLiveSpecification');
    expect(row.DeletionPolicy).toBe(env === 'production' ? 'Retain' : 'Delete');
  });
  it('バックアップだけ有効でLINEとSQSを無効に保つ', () => {
    expect(variables('notify').BACKUPS_ENABLED).toBe('true');
    expect(variables('notify').NOTIFICATIONS_ENABLED).toBe('false');
    expect(resources('AWS::Lambda::EventSourceMapping')[0]![1].Properties.Enabled).toBe(false);
  });
  it('Backupの予定だけ有効', () => {
    for (const [id, row] of resources('AWS::Scheduler::Schedule'))
      expect(row.Properties.State).toBe(id.includes('Backup') ? 'ENABLED' : 'DISABLED');
  });
  it('本番は両方の起動が既定無効', () => {
    const json = templates['Housework-production-App']!.toJSON();
    const f = Object.values(
      json.Resources as Record<
        string,
        { Type: string; Properties?: { Environment?: { Variables?: Record<string, unknown> } } }
      >,
    ).find((r) => r.Properties?.Environment?.Variables?.ENTRY === 'notify')!;
    expect(f.Properties!.Environment!.Variables!.BACKUPS_ENABLED).toBe('false');
  });
  it('メール購読があり障害アラームアクションは有効だが通知欠測は無効', () => {
    const subscription = resources('AWS::SNS::Subscription')[0]![1].Properties;
    expect(subscription.Protocol).toBe('email');
    expect(subscription.Endpoint).toBe(FAKE_NOTIFICATION_EMAIL);
    for (const [id, row] of resources('AWS::CloudWatch::Alarm')) {
      expect(row.Properties.ActionsEnabled).toBe(!id.includes('NotifyHealth'));
      expect(row.Properties.AlarmActions).toHaveLength(1);
    }
  });
  it('APIとnotifyのみ調整表参照、LINEには渡さない', () => {
    expect(variables('api')).toHaveProperty('ADJUSTMENTS_TABLE');
    expect(variables('notify')).toHaveProperty('ADJUSTMENTS_TABLE');
    expect(variables('notify')).toHaveProperty('ADJUSTMENTS_ARN');
    expect(variables('line')).not.toHaveProperty('ADJUSTMENTS_TABLE');
  });
  it('既存Lambda/予定/有料警報は増やさない', () => {
    app().resourceCountIs('AWS::Lambda::Function', 6);
    app().resourceCountIs('AWS::Scheduler::Schedule', 5);
    app().resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });
  it('調整権限にScan/Updateやワイルドカード表を追加しない', () => {
    const policies = resources('AWS::IAM::Policy');
    const relevant = policies
      .flatMap(
        ([, p]) =>
          (
            p.Properties.PolicyDocument as {
              Statement: { Action: string | string[]; Resource: unknown }[];
            }
          ).Statement,
      )
      .filter((s) => JSON.stringify(s.Resource).includes('Adjustments'));
    expect(relevant.length).toBeGreaterThanOrEqual(4);
    for (const s of relevant) {
      expect(JSON.stringify(s.Action)).not.toContain('Scan');
      expect(JSON.stringify(s.Action)).not.toContain('UpdateItem');
      expect(s.Resource).not.toBe('*');
    }
    const notify = policies.find(([id]) => id.includes('NotifyFunction'))!;
    expect(JSON.stringify(notify)).toContain('dynamodb:CreateBackup');
  });
  it.each([
    'stagingNotificationEmail',
    'stagingNotificationChecksPassed',
    'stagingNotificationBudgetVerified',
  ])('%s未確認ではbackup有効化を拒否', (key) => {
    expect(() => buildApp(new App({ context: { ...base, ...activation, [key]: '' } }))).toThrow();
  });
  it('100円超の合算費用では有効化を拒否', () =>
    expect(() =>
      buildApp(
        new App({ context: { ...base, ...activation, stagingNotificationEstimatedJpy: 101 } }),
      ),
    ).toThrow());
});
