import { resolve } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, it, expect } from 'vitest';
import { buildApp } from '../../lib/app';
import { FAKE_ORIGIN_VERIFY_SECRET } from '../fixtures/fakeSecrets';
let templates: Record<string, Template>;
beforeAll(() => {
  const app = buildApp(
    new App({
      context: {
        originVerifySecret: FAKE_ORIGIN_VERIFY_SECRET,
        frontendDistPath: resolve('infrastructure', 'test', 'u10-notifications', 'fixtures'),
      },
    }),
  );
  templates = {};
  for (const stack of app.node.children) {
    const name = (stack as { stackName?: string }).stackName;
    if (name) templates[name] = Template.fromStack(stack as never);
  }
}, 120000);
const app = () => templates['Housework-staging-App']!;
const data = () => templates['Housework-staging-Data']!;
const resources = (kind: string) =>
  Object.values(app().findResources(kind)) as Array<{ Properties: Record<string, unknown> }>;
describe('通知の配備構成', () => {
  it('各環境10テーブル', () => {
    for (const env of ['staging', 'production'])
      templates[`Housework-${env}-Data`]!.resourceCountIs('AWS::DynamoDB::Table', 11);
  });
  it('通知処理と運用鍵の作成を含めてLambdaは6つ', () =>
    app().resourceCountIs('AWS::Lambda::Function', 6));
  it.each(['staging', 'production'])('%sの通知を環境固有の運用鍵の作成後に配備する', (env) => {
    const template = templates[`Housework-${env}-App`]!;
    const keyResources = template.findResources('Custom::NotificationOperationalKey');
    const [keyId] = Object.keys(keyResources);
    expect(Object.keys(keyResources)).toHaveLength(1);
    template.hasResource('AWS::Lambda::Function', {
      DependsOn: Match.arrayWith([keyId]),
      Properties: { Environment: { Variables: Match.objectLike({ ENTRY: 'notify' }) } },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          OPERATIONAL_KEY_PARAMETER: `/housework-calendar/${env}/notifications/operational-hash-key`,
        },
      },
    });
  });
  it('公開URLは元の2つだけ', () => app().resourceCountIs('AWS::Lambda::Url', 2));
  it('キューはWorkとDLQの2つ', () => app().resourceCountIs('AWS::SQS::Queue', 2));
  it('予定は5つ', () => app().resourceCountIs('AWS::Scheduler::Schedule', 5));
  it('SNSは環境に1つ', () => app().resourceCountIs('AWS::SNS::Topic', 1));
  it('アラームは環境に5つ', () => app().resourceCountIs('AWS::CloudWatch::Alarm', 5));
  it('ログは3入口で30日', () => {
    app().resourceCountIs('AWS::Logs::LogGroup', 3);
    for (const row of resources('AWS::Logs::LogGroup'))
      expect(row.Properties.RetentionInDays).toBe(30);
  });
  it('既定の予定は無効', () => {
    for (const row of resources('AWS::Scheduler::Schedule'))
      expect(row.Properties.State).toBe('DISABLED');
  });
  it('既定のSQS連携は無効', () => {
    expect(resources('AWS::Lambda::EventSourceMapping')[0]!.Properties.Enabled).toBe(false);
  });
  it('SQSは部分失敗とバッチ1', () => {
    expect(resources('AWS::Lambda::EventSourceMapping')[0]!.Properties).toMatchObject({
      BatchSize: 1,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
      ScalingConfig: { MaximumConcurrency: 2 },
    });
  });
  it('可視性は180秒', () => {
    expect(resources('AWS::SQS::Queue').some((r) => r.Properties.VisibilityTimeout === 180)).toBe(
      true,
    );
  });
  it('キューは暗号化', () => {
    for (const r of resources('AWS::SQS::Queue'))
      expect(r.Properties.SqsManagedSseEnabled).toBe(true);
  });
  it('DLQは7日保持', () =>
    expect(
      resources('AWS::SQS::Queue').some((r) => r.Properties.MessageRetentionPeriod === 604800),
    ).toBe(true));
  it('仕事は1日保持', () =>
    expect(
      resources('AWS::SQS::Queue').some((r) => r.Properties.MessageRetentionPeriod === 86400),
    ).toBe(true));
  it('notifyは256MB30秒ARM64', () => {
    const fn = resources('AWS::Lambda::Function').find(
      (r) =>
        (r.Properties.Environment as { Variables?: Record<string, unknown> })?.Variables?.ENTRY ===
        'notify',
    );
    expect(fn?.Properties).toMatchObject({
      MemorySize: 256,
      Timeout: 30,
      Architectures: ['arm64'],
    });
  });
  it('新テーブルのTTLはttl', () => {
    const rows = Object.entries(data().findResources('AWS::DynamoDB::Table')).filter(
      ([id]) => id.startsWith('NotificationDispatches') || id.startsWith('NotificationPayloads'),
    );
    expect(rows).toHaveLength(2);
    for (const [, r] of rows)
      expect(
        (r as { Properties: { TimeToLiveSpecification: unknown } }).Properties
          .TimeToLiveSpecification,
      ).toEqual({ AttributeName: 'ttl', Enabled: true });
  });
  it('定時はAsia/Tokyo', () => {
    for (const r of resources('AWS::Scheduler::Schedule'))
      expect(r.Properties.ScheduleExpressionTimezone).toBe('Asia/Tokyo');
  });
  it('柔軟枠はOFF', () => {
    for (const r of resources('AWS::Scheduler::Schedule'))
      expect(r.Properties.FlexibleTimeWindow).toEqual({ Mode: 'OFF' });
  });
  it('notifyにURLの許可を足さない', () => {
    const permissions = resources('AWS::Lambda::Permission');
    expect(
      permissions.some(
        (r) =>
          r.Properties.Action === 'lambda:InvokeFunctionUrl' &&
          JSON.stringify(r).includes('NotifyFunction'),
      ),
    ).toBe(false);
  });
  it('GetMetricStatistics例外はリージョン条件付き', () => {
    const policies = JSON.stringify(app().findResources('AWS::IAM::Policy'));
    expect(policies).toContain('cloudwatch:GetMetricStatistics');
    expect(policies).toContain('aws:RequestedRegion');
  });
  it('GetMetricDataは許可しない', () =>
    expect(JSON.stringify(app().toJSON())).not.toContain('cloudwatch:GetMetricData'));
  it('ListBackupsを許可', () =>
    expect(JSON.stringify(app().toJSON())).toContain('dynamodb:ListBackups'));
  it('バックアップの削除は自テーブルのARNだけ', () => {
    const policies = resources('AWS::IAM::Policy');
    for (const p of policies) {
      const statements = (
        p.Properties.PolicyDocument as {
          Statement: { Action: string | string[]; Resource: unknown }[];
        }
      ).Statement;
      for (const s of statements) {
        if (JSON.stringify(s.Action).includes('dynamodb:DeleteBackup')) {
          expect(JSON.stringify(s.Resource)).toContain('/backup/');
          expect(s.Resource).not.toBe('*');
        }
      }
    }
  });
  it('有効化は確認情報不足で止まる', () => {
    expect(() =>
      buildApp(
        new App({
          context: {
            originVerifySecret: FAKE_ORIGIN_VERIFY_SECRET,
            frontendDistPath: resolve('infrastructure', 'test', 'u10-notifications', 'fixtures'),
            stagingNotificationsEnabled: true,
          },
        }),
      ),
    ).toThrow();
  });
  it('本番通知メタデータは保持', () => {
    const rows = Object.entries(
      templates['Housework-production-Data']!.findResources('AWS::DynamoDB::Table'),
    ).filter(([id]) => id.startsWith('NotificationDispatches'));
    expect((rows[0]![1] as { DeletionPolicy: string }).DeletionPolicy).toBe('Retain');
  });
});
