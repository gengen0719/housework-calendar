// U10: 通知2表・notify Lambda/ログ各1・標準アラーム5・api/lineのSNS許可各1を追加。既存の認証・暗号化・表ごとの操作の制約は維持する。
import { resolve } from 'node:path';
import { App } from 'aws-cdk-lib';
import { CachePolicy } from 'aws-cdk-lib/aws-cloudfront';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app';
import { FAKE_ORIGIN_VERIFY_SECRET } from '../fixtures/fakeSecrets';

let templates: Record<string, Template>;
interface Statement {
  Action: string | string[];
  Resource: unknown;
}
const actions = (s: Statement) => (Array.isArray(s.Action) ? s.Action : [s.Action]);
const t = (name = 'Housework-staging-App') => templates[name]!;
function statements(entry: string, stack?: string): Statement[] {
  const policies = Object.values(t(stack).findResources('AWS::IAM::Policy')) as Array<{
    Properties: { Roles: { Ref: string }[]; PolicyDocument: { Statement: Statement[] } };
  }>;
  return policies
    .filter((p) =>
      p.Properties.Roles.some((r) =>
        r.Ref.startsWith(entry === 'api' ? 'ApiFunctionServiceRole' : 'LineFunctionServiceRole'),
      ),
    )
    .flatMap((p) => p.Properties.PolicyDocument.Statement);
}
beforeAll(() => {
  const app = buildApp(
    new App({
      context: {
        originVerifySecret: FAKE_ORIGIN_VERIFY_SECRET,
        frontendDistPath: resolve('infrastructure', 'test', 'u9-allowance', 'fixtures'),
      },
    }),
  );
  templates = {};
  for (const stack of app.node.children) {
    const name = (stack as { stackName?: string }).stackName;
    if (name) templates[name] = Template.fromStack(stack as never);
  }
}, 120000);

describe('U9 はインフラを増やさない', () => {
  it('IAM の文は api 11、line 9 のまま', () => {
    expect(statements('api')).toHaveLength(13);
    expect(statements('line')).toHaveLength(10);
  });
  it.each(['api', 'line'])('%s に広い DynamoDB の許可がない', (entry) => {
    for (const s of statements(entry).filter((s) =>
      actions(s).some((a) => a.startsWith('dynamodb:')),
    )) {
      expect(s.Resource).not.toBe('*');
      expect(actions(s)).not.toEqual(expect.arrayContaining(['dynamodb:*']));
      for (const action of ['dynamodb:Scan', 'dynamodb:BatchGetItem', 'dynamodb:BatchWriteItem'])
        expect(actions(s)).not.toContain(action);
    }
  });
  it.each(['Calendar', 'ChoreTypes'])('api の %s は既存の6操作', (table) => {
    expect(
      statements('api')
        .filter((s) => JSON.stringify(s.Resource).includes(table))
        .flatMap(actions)
        .sort(),
    ).toEqual(
      ['ConditionCheckItem', 'DeleteItem', 'GetItem', 'PutItem', 'Query', 'UpdateItem'].map(
        (a) => `dynamodb:${a}`,
      ),
    );
  });
  it('Users と Families の読み取りが許可済み', () => {
    for (const table of ['Users', 'Families'])
      expect(
        statements('api')
          .filter((s) => JSON.stringify(s.Resource).includes(table))
          .flatMap(actions),
      ).toContain('dynamodb:GetItem');
    const users = statements('api').filter((s) => JSON.stringify(s.Resource).includes('Users'));
    expect(JSON.stringify(users)).toContain('familyId-index');
    expect(users.flatMap(actions)).toContain('dynamodb:Query');
  });
  it.each(['api', 'line'])('%s の設定と環境変数を保つ', (entry) => {
    t().hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ENTRY: entry }) },
      MemorySize: 256,
      Timeout: 30,
      Architectures: ['arm64'],
    });
    const functions = Object.values(t().findResources('AWS::Lambda::Function')) as Array<{
      Properties: { Environment?: { Variables: Record<string, unknown> } };
    }>;
    const vars = functions.find((f) => f.Properties.Environment?.Variables.ENTRY === entry)!
      .Properties.Environment!.Variables;
    expect(Object.keys(vars).sort()).toEqual(
      [
        'ALERT_TOPIC_ARN',
        'CALENDAR_TABLE',
        'CHORE_TYPES_TABLE',
        'ENTRY',
        'ENV',
        'FAMILIES_TABLE',
        'NOTIFICATION_GROUPS_TABLE',
        'SSM_PREFIX',
        'USERS_TABLE',
        ...(entry === 'api'
          ? ['ADJUSTMENTS_TABLE', 'INVITATIONS_TABLE', 'REQUEST_RECORDS_TABLE']
          : ['PROCESSED_LINE_EVENTS_TABLE']),
      ].sort(),
    );
  });
  it('予約並行数を足さない', () => {
    expect(JSON.stringify(t().toJSON())).not.toContain('ReservedConcurrentExecutions');
  });
  it('資源数を保つ', () => {
    templates['Housework-staging-Data']!.resourceCountIs('AWS::DynamoDB::Table', 11);
    t().resourceCountIs('AWS::Lambda::Function', 6);
    t().resourceCountIs('AWS::Logs::LogGroup', 4);
    t().resourceCountIs('AWS::Logs::MetricFilter', 1);
    t().resourceCountIs('AWS::CloudWatch::Alarm', 5);
  });
  it('ログは30日保管', () => {
    for (const r of Object.values(t().findResources('AWS::Logs::LogGroup')))
      expect((r as { Properties: { RetentionInDays: number } }).Properties.RetentionInDays).toBe(
        30,
      );
  });
  it('本番のCalendarはRetain', () => {
    const rows = Object.entries(
      templates['Housework-production-Data']!.findResources('AWS::DynamoDB::Table'),
    ).filter(([id]) => id.startsWith('Calendar'));
    expect(rows).toHaveLength(1);
    expect((rows[0]![1] as { DeletionPolicy: string }).DeletionPolicy).toBe('Retain');
  });
  it('ステージングの許可が本番を参照しない', () => {
    expect(JSON.stringify([...statements('api'), ...statements('line')])).not.toContain(
      'Housework-production',
    );
  });
  it('CloudFrontのAPIキャッシュと振り分けを保つ', () => {
    const distributions = Object.values(
      t().findResources('AWS::CloudFront::Distribution'),
    ) as Array<{
      Properties: {
        DistributionConfig: {
          CacheBehaviors: {
            PathPattern: string;
            CachePolicyId: string;
            AllowedMethods: string[];
          }[];
        };
      };
    }>;
    const behaviors = distributions[0]!.Properties.DistributionConfig.CacheBehaviors;
    expect(behaviors.map((b) => b.PathPattern).sort()).toEqual(['/line/webhook', '/v1/*']);
    const api = behaviors.find((b) => b.PathPattern === '/v1/*')!;
    expect(api.CachePolicyId).toBe(CachePolicy.CACHING_DISABLED.cachePolicyId);
    expect(api.AllowedMethods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
    );
  });
});
