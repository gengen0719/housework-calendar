import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app.js';
import { CONTENT_SECURITY_POLICY } from '../../lib/app-stack.js';

const DUMMY_SECRET = 'dummy-origin-verify-secret-for-tests';
let distDir: string;
let templates: Record<string, Template>;

function makeApp(context: Record<string, string>): App {
  return new App({
    context: { originVerifySecret: DUMMY_SECRET, frontendDistPath: distDir, ...context },
  });
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>test</title>');
  const app = buildApp(
    makeApp({ githubOwner: 'octo', githubRepo: 'housework', budgetEmail: 'owner@example.com' }),
  );
  templates = {};
  for (const child of app.node.children) {
    const stack = child as unknown as { stackName?: string };
    if (stack.stackName) {
      templates[stack.stackName] = Template.fromStack(child as never);
    }
  }
}, 120_000);

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

const t = (name: string): Template => templates[name] as Template;

describe('U1 CDK stacks', () => {
  it('作るスタックは 5 つ（環境ごとに Data と App、Account）', () => {
    expect(Object.keys(templates).sort()).toEqual([
      'Housework-Account',
      'Housework-production-App',
      'Housework-production-Data',
      'Housework-staging-App',
      'Housework-staging-Data',
    ]);
  });

  it('Lambda は Node.js 22・arm64・256MB・30 秒で、関数 URL は認証 NONE', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      MemorySize: 256,
      Timeout: 30,
      Environment: { Variables: Match.objectLike({ ENTRY: 'api', ENV: 'staging' }) },
    });
    app.hasResourceProperties('AWS::Lambda::Function', {
      Environment: Match.objectLike({ Variables: Match.objectLike({ ENTRY: 'line' }) }),
    });
    app.resourceCountIs('AWS::Lambda::Url', 2);
    app.allResourcesProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
  });

  it('関数 URL を公開で呼べる許可が付く', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunctionUrl',
      Principal: '*',
      FunctionUrlAuthType: 'NONE',
    });
  });

  it('予約された同時実行数は既定では付けず、コンテキストで付く', () => {
    expect(JSON.stringify(t('Housework-staging-App').toJSON())).not.toContain(
      'ReservedConcurrentExecutions',
    );
    const app = buildApp(makeApp({ reservedConcurrency: '5' }));
    const stack = app.node.findChild('Housework-staging-App');
    Template.fromStack(stack as never).hasResourceProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: 5,
    });
  }, 120_000);

  it('ロググループの保存は 30 日', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
    const groups = Object.values(app.findResources('AWS::Logs::LogGroup'));
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it('DynamoDB は 4 つで、オンデマンド、GSI と TTL がある', () => {
    const data = t('Housework-staging-Data');
    data.resourceCountIs('AWS::DynamoDB::Table', 4);
    data.allResourcesProperties('AWS::DynamoDB::Table', { BillingMode: 'PAY_PER_REQUEST' });
    data.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'lineUserId-index' })],
    });
    data.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'webhookEventId', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
    data.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'idempotencyKey', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it('本番のテーブルは RETAIN、ステージングは DESTROY', () => {
    const prod = Object.values(
      t('Housework-production-Data').findResources('AWS::DynamoDB::Table'),
    );
    const stg = Object.values(t('Housework-staging-Data').findResources('AWS::DynamoDB::Table'));
    expect(prod).toHaveLength(4);
    for (const r of prod) expect(r.DeletionPolicy).toBe('Retain');
    for (const r of stg) expect(r.DeletionPolicy).toBe('Delete');
  });

  it('API Gateway と Secrets Manager の資源がない', () => {
    for (const template of Object.values(templates)) {
      const types = Object.values(
        template.toJSON().Resources as Record<string, { Type: string }>,
      ).map((r) => r.Type);
      expect(
        types.filter((x) => x.startsWith('AWS::ApiGateway') || x.startsWith('AWS::ApiGatewayV2')),
      ).toEqual([]);
      expect(types.filter((x) => x.startsWith('AWS::SecretsManager'))).toEqual([]);
    }
  });

  it('Lambda のロールは自分の環境のパラメータだけを読み、cloudfront/* を含む', () => {
    for (const envName of ['staging', 'production']) {
      const json = JSON.stringify(t(`Housework-${envName}-App`).toJSON());
      const other = envName === 'staging' ? 'production' : 'staging';
      expect(json).toContain(`parameter/housework-calendar/${envName}/cloudfront/*`);
      expect(json).toContain(`parameter/housework-calendar/${envName}/jwt/*`);
      expect(json).not.toContain(`housework-calendar/${other}`);
    }
  });

  it('Lambda のロールの SSM の許可は、Users の GSI の Query だけ GSI に付く', () => {
    const policies = Object.values(
      t('Housework-staging-App').findResources('AWS::IAM::Policy'),
    ) as Array<{
      Properties: { PolicyDocument: { Statement: Array<{ Action: string | string[] }> } };
    }>;
    const actions = policies.flatMap((p) =>
      p.Properties.PolicyDocument.Statement.flatMap((s) => s.Action),
    );
    expect(actions).toContain('dynamodb:Query');
    expect(actions).toContain('ssm:GetParameter');
    expect(actions).not.toContain('dynamodb:*');
    expect(actions).not.toContain('ssm:*');
  });

  it('応答ヘッダーのポリシーに CSP ほかがある', () => {
    t('Housework-staging-App').hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: {
          ContentSecurityPolicy: { ContentSecurityPolicy: CONTENT_SECURITY_POLICY, Override: true },
          ContentTypeOptions: { Override: true },
          FrameOptions: { FrameOption: 'DENY', Override: true },
          ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
          StrictTransportSecurity: Match.objectLike({ Override: true }),
        },
      },
    });
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self';");
  });

  it('CloudFront の振り分けと、元への秘密のヘッダー', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: [
          Match.objectLike({ PathPattern: '/v1/*' }),
          Match.objectLike({ PathPattern: '/line/webhook' }),
        ],
      }),
    });
    const origins = Object.values(app.findResources('AWS::CloudFront::Distribution'))[0]!.Properties
      .DistributionConfig.Origins as Array<{
      OriginCustomHeaders?: Array<{ HeaderName: string }>;
      OriginPath?: string;
    }>;
    const withHeader = origins.filter((o) =>
      o.OriginCustomHeaders?.some((h) => h.HeaderName === 'X-Origin-Verify'),
    );
    expect(withHeader).toHaveLength(2);
    for (const o of origins) expect(o.OriginPath ?? '').toBe('');
    app.resourceCountIs('AWS::CloudFront::Function', 1);
  });

  it('秘密のヘッダーの値はコンテキストから入り、コードには書かれていない', () => {
    expect(JSON.stringify(t('Housework-staging-App').toJSON())).toContain(DUMMY_SECRET);
    const sources = ['app-stack.ts', 'account-stack.ts', 'data-stack.ts', 'app.ts'].map((f) =>
      fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'lib', f), 'utf8'),
    );
    for (const s of sources) expect(s).not.toContain(DUMMY_SECRET);
  });

  it('S3 は非公開で、画面を入れる BucketDeployment がある', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    app.resourceCountIs('Custom::CDKBucketDeployment', 1);
    app.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('Account: OIDC・ステージング用と本番用のロール・Budgets 月 1 ドル', () => {
    const account = t('Housework-Account');
    account.resourceCountIs('AWS::IAM::Role', 3); // OIDC プロバイダー用の Custom Resource のロールを含む
    account.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:octo/housework:ref:refs/heads/main',
              },
            },
          }),
        ],
      }),
    });
    account.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub':
                  'repo:octo/housework:environment:production',
              }),
            },
          }),
        ],
      }),
    });
    account.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ BudgetLimit: { Amount: 1, Unit: 'USD' }, TimeUnit: 'MONTHLY' }),
    });
    const json = JSON.stringify(account.toJSON());
    expect(json).toContain('/housework-calendar/staging/cloudfront/*');
    expect(json).toContain('/housework-calendar/production/cloudfront/*');
  });

  it('必須のコンテキストがないと組み立てに失敗する', () => {
    expect(() => buildApp(new App({ context: { frontendDistPath: distDir } }))).toThrow(
      /originVerifySecret/,
    );
    expect(() => buildApp(makeApp({ frontendDistPath: path.join(distDir, 'missing') }))).toThrow(
      /ビルド結果/,
    );
    expect(() => buildApp(makeApp({ reservedConcurrency: '0' }))).toThrow(/reservedConcurrency/);
  });

  it('Account: ID を渡すと、名前だけの sub と ID 入りの sub の両方に完全一致で引き受けられる', () => {
    const app = buildApp(
      makeApp({
        githubOwner: 'octo',
        githubRepo: 'housework',
        githubOwnerId: '74813858',
        githubRepoId: '1441628441',
        budgetEmail: 'owner@example.com',
      }),
    );
    const account = Template.fromStack(app.node.findChild('Housework-Account') as never);
    account.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'housework-calendar-github-staging-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': [
                  'repo:octo/housework:ref:refs/heads/main',
                  'repo:octo@74813858/housework@1441628441:ref:refs/heads/main',
                ],
              },
            },
          }),
        ],
      }),
    });
    account.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'housework-calendar-github-production-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [
          Match.objectLike({
            Condition: {
              StringEquals: Match.objectLike({
                'token.actions.githubusercontent.com:sub': [
                  'repo:octo/housework:environment:production',
                  'repo:octo@74813858/housework@1441628441:environment:production',
                ],
              }),
            },
          }),
        ],
      }),
    });
    // ワイルドカードで広げていない
    expect(JSON.stringify(account.toJSON())).not.toContain('StringLike');
  });

  it('Account: ID は両方そろって数字だけのときに受け付ける', () => {
    const base = { githubOwner: 'octo', githubRepo: 'housework', budgetEmail: 'owner@example.com' };
    expect(() => buildApp(makeApp({ ...base, githubOwnerId: '74813858' }))).toThrow(/両方/);
    expect(() =>
      buildApp(makeApp({ ...base, githubOwnerId: '74813858', githubRepoId: '1441*' })),
    ).toThrow(/数字/);
  });
});
