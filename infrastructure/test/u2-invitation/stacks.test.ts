import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app.js';
import { FAKE_ORIGIN_VERIFY_SECRET } from '../fixtures/fakeSecrets.js';

let distDir: string;
let templates: Record<string, Template>;

interface Statement {
  Action: string | string[];
  Resource: unknown;
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u2-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>test</title>');
  const app = buildApp(
    new App({
      context: { originVerifySecret: FAKE_ORIGIN_VERIFY_SECRET, frontendDistPath: distDir },
    }),
  );
  templates = {};
  for (const child of app.node.children) {
    const stack = child as unknown as { stackName?: string };
    if (stack.stackName) templates[stack.stackName] = Template.fromStack(child as never);
  }
}, 120_000);

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

const t = (name: string): Template => templates[name] as Template;

/** 関数のロール（ServiceRole の論理 ID に prefix を含むもの）に付く許可の文を集める */
function statementsFor(template: Template, rolePrefix: string): Statement[] {
  const policies = Object.values(template.findResources('AWS::IAM::Policy')) as Array<{
    Properties: {
      Roles: Array<{ Ref: string }>;
      PolicyDocument: { Statement: Statement[] };
    };
  }>;
  return policies
    .filter((p) => p.Properties.Roles.some((r) => r.Ref.startsWith(rolePrefix)))
    .flatMap((p) => p.Properties.PolicyDocument.Statement);
}

const actionsOf = (s: Statement): string[] => (Array.isArray(s.Action) ? s.Action : [s.Action]);

describe('U2 CDK: Data スタック', () => {
  it('Invitations テーブル: PK token・TTL ttl・オンデマンド・AWS 管理の暗号化', () => {
    t('Housework-staging-Data').hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'token', KeyType: 'HASH' }],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: { SSEEnabled: true },
    });
  });

  it('Invitations テーブルに tableName を指定していない', () => {
    const tables = Object.values(
      t('Housework-staging-Data').findResources('AWS::DynamoDB::Table'),
    ) as Array<{ Properties: Record<string, unknown> }>;
    for (const table of tables) expect(table.Properties.TableName).toBeUndefined();
  });

  it('Users の familyId-index: PK familyId・射影 INCLUDE', () => {
    t('Housework-staging-Data').hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'familyId-index',
          KeySchema: [{ AttributeName: 'familyId', KeyType: 'HASH' }],
          Projection: {
            ProjectionType: 'INCLUDE',
            NonKeyAttributes: ['displayName', 'role', 'familyJoinedAt'],
          },
        }),
      ]),
    });
  });

  it('本番の Invitations は RETAIN、ステージングは DESTROY', () => {
    const find = (name: string): Array<{ DeletionPolicy: string }> =>
      Object.values(
        t(name).findResources('AWS::DynamoDB::Table', {
          Properties: { KeySchema: [{ AttributeName: 'token', KeyType: 'HASH' }] },
        }),
      ) as Array<{ DeletionPolicy: string }>;
    const prod = find('Housework-production-Data');
    const stg = find('Housework-staging-Data');
    expect(prod).toHaveLength(1);
    expect(stg).toHaveLength(1);
    expect(prod[0]?.DeletionPolicy).toBe('Retain');
    expect(stg[0]?.DeletionPolicy).toBe('Delete');
  });
});

describe('U2 CDK: App スタック', () => {
  it('api の環境変数に INVITATIONS_TABLE があり、line にはない', () => {
    const app = t('Housework-staging-App');
    app.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({ ENTRY: 'api', INVITATIONS_TABLE: Match.anyValue() }),
      },
    });
    const fns = Object.values(app.findResources('AWS::Lambda::Function')) as Array<{
      Properties: { Environment?: { Variables: Record<string, unknown> } };
    }>;
    const line = fns.find((f) => f.Properties.Environment?.Variables.ENTRY === 'line');
    expect(line).toBeDefined();
    expect(line?.Properties.Environment?.Variables.INVITATIONS_TABLE).toBeUndefined();
  });

  it('api のロール: Invitations に GetItem・PutItem・UpdateItem・ConditionCheckItem', () => {
    const statements = statementsFor(t('Housework-staging-App'), 'ApiFunctionServiceRole');
    const inv = statements.find((s) => JSON.stringify(s.Resource).includes('Invitations'));
    expect(inv).toBeDefined();
    expect(actionsOf(inv as Statement).sort()).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ]);
  });

  it('api のロール: familyId-index に Query だけ', () => {
    const statements = statementsFor(t('Housework-staging-App'), 'ApiFunctionServiceRole');
    const idx = statements.filter((s) => JSON.stringify(s.Resource).includes('familyId-index'));
    expect(idx).toHaveLength(1);
    expect(actionsOf(idx[0] as Statement)).toEqual(['dynamodb:Query']);
  });

  it('api のロール: Families に UpdateItem と ConditionCheckItem が足されている', () => {
    const statements = statementsFor(t('Housework-staging-App'), 'ApiFunctionServiceRole');
    const fam = statements.find(
      (s) =>
        JSON.stringify(s.Resource).includes('Families') &&
        actionsOf(s).includes('dynamodb:ConditionCheckItem'),
    );
    expect(fam).toBeDefined();
    expect(actionsOf(fam as Statement)).toEqual(
      expect.arrayContaining(['dynamodb:UpdateItem', 'dynamodb:ConditionCheckItem']),
    );
  });

  it('line のロール: Invitations と familyId-index に届かない', () => {
    const statements = statementsFor(t('Housework-staging-App'), 'LineFunctionServiceRole');
    expect(statements.length).toBeGreaterThan(0);
    const json = JSON.stringify(statements);
    expect(json).not.toContain('Invitations');
    expect(json).not.toContain('familyId-index');
    expect(statements.flatMap(actionsOf)).not.toContain('dynamodb:ConditionCheckItem');
  });

  it('メトリクスフィルタ InvitationInvalidCount: 名前空間・値 1・defaultValue 0', () => {
    for (const envName of ['staging', 'production']) {
      t(`Housework-${envName}-App`).hasResourceProperties('AWS::Logs::MetricFilter', {
        FilterPattern: '{ $.event = "INVITATION_REJECTED" && $.reason = "INVITATION_INVALID" }',
        MetricTransformations: [
          {
            MetricNamespace: `Housework/${envName}`,
            MetricName: 'InvitationInvalidCount',
            MetricValue: '1',
            DefaultValue: 0,
          },
        ],
      });
    }
  });

  it('メトリクスフィルタは 1 つで、api のロググループに付く', () => {
    const app = t('Housework-staging-App');
    app.resourceCountIs('AWS::Logs::MetricFilter', 1);
    const filter = Object.values(app.findResources('AWS::Logs::MetricFilter'))[0] as {
      Properties: { LogGroupName: { Ref: string } };
    };
    expect(filter.Properties.LogGroupName.Ref).toMatch(/^ApiLogGroup/);
  });
});
