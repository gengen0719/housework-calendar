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
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u5-dist-'));
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

interface TableResource {
  DeletionPolicy: string;
  Properties: Record<string, unknown>;
}

/** 論理 ID が Calendar で始まるテーブル（キーの形では探さない） */
const findCalendar = (name: string): TableResource[] =>
  Object.entries(t(name).findResources('AWS::DynamoDB::Table'))
    .filter(([id]) => id.startsWith('Calendar'))
    .map(([, r]) => r as unknown as TableResource);

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

const statementsOnTable = (statements: Statement[], prefix: string): Statement[] =>
  statements.filter((s) => JSON.stringify(s.Resource).includes(prefix));

const actionsOnTable = (statements: Statement[], prefix: string): string[] =>
  statementsOnTable(statements, prefix).flatMap(actionsOf).sort();

const apiStatements = (): Statement[] =>
  statementsFor(t('Housework-staging-App'), 'ApiFunctionServiceRole');
const lineStatements = (): Statement[] =>
  statementsFor(t('Housework-staging-App'), 'LineFunctionServiceRole');

const lambdaVariables = (entry: 'api' | 'line'): Record<string, unknown> => {
  const fns = Object.values(
    t('Housework-staging-App').findResources('AWS::Lambda::Function'),
  ) as Array<{
    Properties: { Environment?: { Variables: Record<string, unknown> } };
  }>;
  const fn = fns.find((f) => f.Properties.Environment?.Variables.ENTRY === entry);
  expect(fn).toBeDefined();
  return fn?.Properties.Environment?.Variables ?? {};
};

describe('U5 CDK: Data スタック', () => {
  it('Calendar テーブル: PK familyId・SK sk（ともに文字列）、オンデマンド、暗号化、TTL なし', () => {
    const tables = findCalendar('Housework-staging-Data');
    expect(tables).toHaveLength(1);
    expect(tables[0]?.Properties).toMatchObject({
      KeySchema: [
        { AttributeName: 'familyId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: { SSEEnabled: true },
    });
    expect(tables[0]?.Properties.AttributeDefinitions).toEqual(
      expect.arrayContaining([
        { AttributeName: 'familyId', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ]),
    );
    expect(tables[0]?.Properties.TimeToLiveSpecification).toBeUndefined();
  });

  it('Calendar に索引（GSI・LSI）がない', () => {
    const props = findCalendar('Housework-staging-Data')[0]?.Properties ?? {};
    expect(props.GlobalSecondaryIndexes).toBeUndefined();
    expect(props.LocalSecondaryIndexes).toBeUndefined();
  });

  it('Calendar に tableName を指定していない', () => {
    expect(findCalendar('Housework-staging-Data')[0]?.Properties.TableName).toBeUndefined();
  });

  it('Calendar に PointInTimeRecoverySpecification がない', () => {
    expect(
      findCalendar('Housework-staging-Data')[0]?.Properties.PointInTimeRecoverySpecification,
    ).toBeUndefined();
  });

  it('本番の Calendar は Retain、ステージングは Delete', () => {
    const prod = findCalendar('Housework-production-Data');
    const stg = findCalendar('Housework-staging-Data');
    expect(prod).toHaveLength(1);
    expect(stg).toHaveLength(1);
    expect(prod[0]?.DeletionPolicy).toBe('Retain');
    expect(stg[0]?.DeletionPolicy).toBe('Delete');
  });

  it('テーブルの合計は 8 つ', () => {
    t('Housework-staging-Data').resourceCountIs('AWS::DynamoDB::Table', 8);
  });
});

describe('U5 CDK: App スタックの環境変数', () => {
  it('api に CALENDAR_TABLE がある', () => {
    expect(lambdaVariables('api').CALENDAR_TABLE).toBeDefined();
  });

  it('line に CALENDAR_TABLE はない', () => {
    expect(lambdaVariables('line').CALENDAR_TABLE).toBeUndefined();
  });
});

describe('U5 CDK: App スタックの権限', () => {
  it('api の Calendar: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem のちょうど 6 つ', () => {
    expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('api の Calendar に Scan・BatchGetItem・BatchWriteItem・dynamodb:* がない', () => {
    const actions = actionsOnTable(apiStatements(), 'Calendar');
    for (const forbidden of [
      'dynamodb:Scan',
      'dynamodb:BatchGetItem',
      'dynamodb:BatchWriteItem',
      'dynamodb:*',
    ]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it('api の Calendar の許可は 1 つの文で、テーブル本体だけを資源にする（索引を含まない）', () => {
    const statements = statementsOnTable(apiStatements(), 'Calendar');
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0]?.Resource)).not.toContain('/index/');
  });

  it('api の ChoreTypes: ConditionCheckItem を足した 6 つで、Scan はなく、文は 1 つのまま', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
    expect(statementsOnTable(apiStatements(), 'ChoreTypes')).toHaveLength(1);
  });

  it('api の Users の許可は変わらず GetItem がある', () => {
    expect(actionsOnTable(apiStatements(), 'Users')).toContain('dynamodb:GetItem');
  });

  it('line に Calendar も ChoreTypes も含む文がない', () => {
    const json = JSON.stringify(lineStatements());
    expect(json).not.toContain('Calendar');
    expect(json).not.toContain('ChoreTypes');
  });

  it('api のロールに Resource "*" の DynamoDB の文がない', () => {
    const wildcard = apiStatements().filter(
      (s) =>
        actionsOf(s).some((a) => a.startsWith('dynamodb:')) && JSON.stringify(s.Resource) === '"*"',
    );
    expect(wildcard).toHaveLength(0);
  });
});

describe('U5 CDK: 変えないもの', () => {
  it('Lambda は MemorySize 256・Timeout 30', () => {
    t('Housework-staging-App').hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ENTRY: 'api' }) },
      MemorySize: 256,
      Timeout: 30,
    });
    t('Housework-staging-App').hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ENTRY: 'line' }) },
      MemorySize: 256,
      Timeout: 30,
    });
  });

  it('ロググループの保管は 30 日', () => {
    t('Housework-staging-App').allResourcesProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 30,
    });
  });

  it('/v1/* は全メソッドを通す', () => {
    t('Housework-staging-App').hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/v1/*',
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
          }),
        ]),
      }),
    });
  });

  it('AWS::Logs::MetricFilter は 1 つのまま', () => {
    t('Housework-staging-App').resourceCountIs('AWS::Logs::MetricFilter', 1);
  });
});
