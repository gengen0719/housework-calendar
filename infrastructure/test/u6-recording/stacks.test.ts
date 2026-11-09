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
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u6-dist-'));
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

describe('U6 CDK: line のロールの Calendar への権限', () => {
  it('line の Calendar: GetItem・Query・UpdateItem・ConditionCheckItem のちょうど 4 つ', () => {
    expect(actionsOnTable(lineStatements(), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('line の Calendar に Scan・PutItem・DeleteItem・BatchGetItem・BatchWriteItem・dynamodb:* がない', () => {
    const actions = actionsOnTable(lineStatements(), 'Calendar');
    for (const forbidden of [
      'dynamodb:Scan',
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:BatchGetItem',
      'dynamodb:BatchWriteItem',
      'dynamodb:*',
    ]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it('line の Calendar の許可は 1 つの文で、テーブル本体だけを資源にする（索引を含まない）', () => {
    const statements = statementsOnTable(lineStatements(), 'Calendar');
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0]?.Resource)).not.toContain('/index/');
  });
});

describe('U6 CDK: line のロールの ChoreTypes への権限', () => {
  it('line の ChoreTypes: GetItem・Query・ConditionCheckItem のちょうど 3 つ', () => {
    expect(actionsOnTable(lineStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
    ]);
  });

  it('line の ChoreTypes に Scan・PutItem・DeleteItem・UpdateItem がない', () => {
    const actions = actionsOnTable(lineStatements(), 'ChoreTypes');
    for (const forbidden of [
      'dynamodb:Scan',
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:UpdateItem',
    ]) {
      expect(actions).not.toContain(forbidden);
    }
  });

  it('line の ChoreTypes の許可は 1 つの文で、テーブル本体だけを資源にする（索引を含まない）', () => {
    const statements = statementsOnTable(lineStatements(), 'ChoreTypes');
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0]?.Resource)).not.toContain('/index/');
  });
});

describe('U6 CDK: line の既存の権限が U6 で変わらない', () => {
  it('line の Users・ProcessedLineEvents・NotificationGroups・Families の許可は U5 のまま', () => {
    expect(actionsOnTable(lineStatements(), 'Users')).toEqual([
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
    expect(actionsOnTable(lineStatements(), 'ProcessedLineEvents')).toEqual([
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ]);
    expect(actionsOnTable(lineStatements(), 'NotificationGroups')).toEqual([
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
    ]);
    // Families は line では GetItem・UpdateItem のみ（ConditionCheckItem は足していない）
    expect(actionsOnTable(lineStatements(), 'Families')).toEqual([
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
    ]);
  });

  it('line に Invitations と RequestRecords の許可がない', () => {
    const json = JSON.stringify(lineStatements());
    expect(json).not.toContain('Invitations');
    expect(json).not.toContain('RequestRecords');
  });
});

describe('U6 CDK: api のロールは U6 で変わらない', () => {
  it('api の Calendar は U5 のまま（6 つ）', () => {
    expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('api の ChoreTypes は U5 のまま（6 つ）', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });
});

describe('U6 CDK: 本番とステージングの資源の切り分け', () => {
  it('ステージングの line が本番の Calendar と ChoreTypes の ARN を含まない', () => {
    const json = JSON.stringify(lineStatements('Housework-staging-App'));
    expect(json).not.toContain('Housework-production');
  });
});

describe('U6 CDK: line の環境変数', () => {
  it('line に CALENDAR_TABLE と CHORE_TYPES_TABLE がある', () => {
    const vars = lambdaVariables('line');
    expect(vars.CALENDAR_TABLE).toBeDefined();
    expect(vars.CHORE_TYPES_TABLE).toBeDefined();
  });
});

describe('U6 CDK: 数と設定が U6 の前後で変わらない（NFR1.25）', () => {
  it('テーブル・Lambda・ロググループ・MetricFilter の数が U5 のまま', () => {
    t('Housework-staging-Data').resourceCountIs('AWS::DynamoDB::Table', 8);
    // api・line の 2 関数に、CDK が作る補助の関数（S3 の自動削除・配備のカスタムリソース）2 つ
    t('Housework-staging-App').resourceCountIs('AWS::Lambda::Function', 4);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::LogGroup', 2);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::MetricFilter', 1);
  });

  it('line の Lambda は MemorySize 256・Timeout 30・ARM64 のまま', () => {
    t('Housework-staging-App').hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: Match.objectLike({ ENTRY: 'line' }) },
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
