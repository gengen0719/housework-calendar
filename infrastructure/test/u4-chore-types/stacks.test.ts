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
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u4-dist-'));
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

const CHORE_TYPES_KEY_SCHEMA = [
  { AttributeName: 'familyId', KeyType: 'HASH' },
  { AttributeName: 'sk', KeyType: 'RANGE' },
];

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

/** 指定したテーブルを資源に含む文の操作を、並べ替えて返す */
function actionsOnTable(statements: Statement[], tableLogicalPrefix: string): string[] {
  return statements
    .filter((s) => JSON.stringify(s.Resource).includes(tableLogicalPrefix))
    .flatMap(actionsOf)
    .sort();
}

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

const findChoreTypes = (name: string): Array<{ DeletionPolicy: string }> =>
  Object.values(
    t(name).findResources('AWS::DynamoDB::Table', {
      Properties: { KeySchema: CHORE_TYPES_KEY_SCHEMA },
    }),
  ) as Array<{ DeletionPolicy: string }>;

describe('U4 CDK: Data スタック', () => {
  it('ChoreTypes テーブル: PK familyId・SK sk・TTL なし・オンデマンド・AWS 管理の暗号化', () => {
    t('Housework-staging-Data').hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: CHORE_TYPES_KEY_SCHEMA,
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: { SSEEnabled: true },
      TimeToLiveSpecification: Match.absent(),
    });
  });

  it('ChoreTypes に tableName を指定していない', () => {
    const tables = Object.values(
      t('Housework-staging-Data').findResources('AWS::DynamoDB::Table', {
        Properties: { KeySchema: CHORE_TYPES_KEY_SCHEMA },
      }),
    ) as Array<{ Properties: Record<string, unknown> }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]?.Properties.TableName).toBeUndefined();
  });

  it('本番の ChoreTypes は RETAIN、ステージングは DESTROY', () => {
    const prod = findChoreTypes('Housework-production-Data');
    const stg = findChoreTypes('Housework-staging-Data');
    expect(prod).toHaveLength(1);
    expect(stg).toHaveLength(1);
    expect(prod[0]?.DeletionPolicy).toBe('Retain');
    expect(stg[0]?.DeletionPolicy).toBe('Delete');
  });
});

describe('U4 CDK: App スタックの環境変数', () => {
  it('api に CHORE_TYPES_TABLE がある', () => {
    expect(lambdaVariables('api').CHORE_TYPES_TABLE).toBeDefined();
  });

  it('line に CHORE_TYPES_TABLE はない', () => {
    expect(lambdaVariables('line').CHORE_TYPES_TABLE).toBeUndefined();
  });
});

describe('U4 CDK: App スタックの権限', () => {
  it('api の ChoreTypes: GetItem・Query・PutItem・UpdateItem・DeleteItem がちょうど 5 つ', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('api の ChoreTypes に Scan と ConditionCheckItem がない', () => {
    const actions = actionsOnTable(apiStatements(), 'ChoreTypes');
    expect(actions).not.toContain('dynamodb:Scan');
    expect(actions).not.toContain('dynamodb:ConditionCheckItem');
  });

  it('api の ChoreTypes の許可は、テーブル本体だけを資源にする（索引を含まない）', () => {
    const statements = apiStatements().filter((s) =>
      JSON.stringify(s.Resource).includes('ChoreTypes'),
    );
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0]?.Resource)).not.toContain('/index/');
  });

  it('line に ChoreTypes の許可がない', () => {
    expect(JSON.stringify(lineStatements())).not.toContain('ChoreTypes');
  });

  it('api のほかのテーブルの許可は U3 のまま（Families）', () => {
    expect(actionsOnTable(apiStatements(), 'Families')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ]);
  });
});
