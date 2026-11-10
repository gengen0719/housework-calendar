import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app.js';
import { FAKE_ORIGIN_VERIFY_SECRET } from '../fixtures/fakeSecrets.js';

// U7（状態の変更・月の確定）は、インフラを一切変えない。
// このテストは「U7 の前後で同じ」ことを固定する（NFR4.71、NFR4.72、NFR1.31）。

let distDir: string;
let templates: Record<string, Template>;

interface Statement {
  Action: string | string[];
  Resource: unknown;
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u7-dist-'));
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

const apiStatements = (stackName = 'Housework-staging-App'): Statement[] =>
  statementsFor(t(stackName), 'ApiFunctionServiceRole');
const lineStatements = (stackName = 'Housework-staging-App'): Statement[] =>
  statementsFor(t(stackName), 'LineFunctionServiceRole');

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

const SIX_TABLE_ACTIONS = [
  'dynamodb:ConditionCheckItem',
  'dynamodb:DeleteItem',
  'dynamodb:GetItem',
  'dynamodb:PutItem',
  'dynamodb:Query',
  'dynamodb:UpdateItem',
];

describe('U7 CDK: api のロールは U7 で変わらない（NFR4.71）', () => {
  it('api の Calendar は U5 のまま（6 操作。U7 で追加なし）', () => {
    expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual(SIX_TABLE_ACTIONS);
  });

  it('api の ChoreTypes は U4 のまま（6 操作。U7 で追加なし）', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual(SIX_TABLE_ACTIONS);
  });

  it('api の Calendar・ChoreTypes に Scan・Batch 系・dynamodb:* がない', () => {
    for (const table of ['Calendar', 'ChoreTypes']) {
      const actions = actionsOnTable(apiStatements(), table);
      for (const forbidden of [
        'dynamodb:Scan',
        'dynamodb:BatchGetItem',
        'dynamodb:BatchWriteItem',
        'dynamodb:*',
      ]) {
        expect(actions).not.toContain(forbidden);
      }
    }
  });

  it('api の環境変数に CALENDAR_TABLE・CHORE_TYPES_TABLE があり、U7 で新しい表の名前は足されていない', () => {
    const vars = lambdaVariables('api');
    expect(vars.CALENDAR_TABLE).toBeDefined();
    expect(vars.CHORE_TYPES_TABLE).toBeDefined();
    expect(Object.keys(vars).filter((k) => k.endsWith('_TABLE'))).toEqual(
      expect.not.arrayContaining(['CONFIRMATIONS_TABLE', 'MONTHS_TABLE']),
    );
  });

  it('api の許可の文の数は U6 のまま（U7 で IAM の文を足していない）', () => {
    // 表ごと・索引ごと・パラメータごとの文。数が増えたら、U7 でインフラが変わったということ
    expect(apiStatements()).toHaveLength(11);
    expect(lineStatements()).toHaveLength(9);
    expect(statementsOnTable(apiStatements(), 'Calendar')).toHaveLength(1);
    expect(statementsOnTable(apiStatements(), 'ChoreTypes')).toHaveLength(1);
  });
});

describe('U7 CDK: line のロールは U7 で一切変わらない（NFR4.72。U7 は LINE の経路なし）', () => {
  it('line の Calendar は U6 のまま（4 操作）', () => {
    expect(actionsOnTable(lineStatements(), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('line の ChoreTypes は U6 のまま（3 操作）', () => {
    expect(actionsOnTable(lineStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
    ]);
  });

  it('line に PutItem・DeleteItem・Scan が Calendar に付いていない（月の確定を line で書かない）', () => {
    const actions = actionsOnTable(lineStatements(), 'Calendar');
    for (const forbidden of ['dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Scan']) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it('line の環境変数に CALENDAR_TABLE と CHORE_TYPES_TABLE がある（U6 のまま）', () => {
    const vars = lambdaVariables('line');
    expect(vars.CALENDAR_TABLE).toBeDefined();
    expect(vars.CHORE_TYPES_TABLE).toBeDefined();
  });
});

describe('U7 CDK: 本番とステージングの資源の切り分け', () => {
  it('ステージングの api が本番の資源の ARN を含まない', () => {
    expect(JSON.stringify(apiStatements('Housework-staging-App'))).not.toContain(
      'Housework-production',
    );
  });

  it('本番の api の Calendar・ChoreTypes の許可も 6 操作のまま', () => {
    expect(actionsOnTable(apiStatements('Housework-production-App'), 'Calendar')).toEqual(
      SIX_TABLE_ACTIONS,
    );
    expect(actionsOnTable(apiStatements('Housework-production-App'), 'ChoreTypes')).toEqual(
      SIX_TABLE_ACTIONS,
    );
  });
});

describe('U7 CDK: 数と設定が U7 の前後で変わらない（NFR1.31）', () => {
  it('テーブル・Lambda・ロググループ・MetricFilter の数が U6 のまま', () => {
    t('Housework-staging-Data').resourceCountIs('AWS::DynamoDB::Table', 8);
    t('Housework-staging-App').resourceCountIs('AWS::Lambda::Function', 4);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::LogGroup', 2);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::MetricFilter', 1);
  });

  it('アラームは U6 のまま 0 件（U7 で新しいアラームを足していない）', () => {
    t('Housework-staging-App').resourceCountIs('AWS::CloudWatch::Alarm', 0);
    t('Housework-production-App').resourceCountIs('AWS::CloudWatch::Alarm', 0);
  });

  it('api の Lambda は MemorySize 256・Timeout 30・ARM64 のまま', () => {
    t('Housework-staging-App').hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ENTRY: 'api' }) },
      MemorySize: 256,
      Timeout: 30,
      Architectures: ['arm64'],
    });
  });

  it('本番の Calendar は Retain のまま（U5 の設定を変えていない）', () => {
    const tables = Object.entries(
      t('Housework-production-Data').findResources('AWS::DynamoDB::Table'),
    )
      .filter(([id]) => id.startsWith('Calendar'))
      .map(([, r]) => r as unknown as { DeletionPolicy: string });
    expect(tables).toHaveLength(1);
    expect(tables[0]?.DeletionPolicy).toBe('Retain');
  });
});
