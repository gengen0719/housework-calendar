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

// U5 で Calendar が同じキーの形になったため、キーの形ではなく論理 ID が ChoreTypes で始まるテーブルを探す
const findChoreTypesResources = (name: string): Array<Record<string, unknown>> =>
  Object.entries(t(name).findResources('AWS::DynamoDB::Table'))
    .filter(([id]) => id.startsWith('ChoreTypes'))
    .map(([, r]) => r as unknown as Record<string, unknown>);

const findChoreTypes = (name: string): Array<{ DeletionPolicy: string }> =>
  findChoreTypesResources(name) as Array<{ DeletionPolicy: string }>;

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
    const tables = findChoreTypesResources('Housework-staging-Data') as Array<{
      Properties: Record<string, unknown>;
    }>;
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

  // U4 の時点では line に CHORE_TYPES_TABLE はなかったが、U6 で line が ChoreTypes を読むために足した。
  // U6 後の正しい期待（line に CHORE_TYPES_TABLE がある）は infrastructure/test/u6-recording/stacks.test.ts を参照。
  it('line に CHORE_TYPES_TABLE がある（U6 で追加）', () => {
    expect(lambdaVariables('line').CHORE_TYPES_TABLE).toBeDefined();
  });
});

describe('U4 CDK: App スタックの権限', () => {
  // U5 で ConditionCheckItem を足した（5 → 6）
  it('api の ChoreTypes: GetItem・Query・PutItem・UpdateItem・DeleteItem・ConditionCheckItem がちょうど 6 つ', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('api の ChoreTypes に Scan がない（ConditionCheckItem は U5 で足した）', () => {
    const actions = actionsOnTable(apiStatements(), 'ChoreTypes');
    expect(actions).not.toContain('dynamodb:Scan');
    expect(actions).toContain('dynamodb:ConditionCheckItem');
  });

  it('api の ChoreTypes の許可は、テーブル本体だけを資源にする（索引を含まない）', () => {
    const statements = apiStatements().filter((s) =>
      JSON.stringify(s.Resource).includes('ChoreTypes'),
    );
    expect(statements).toHaveLength(1);
    expect(JSON.stringify(statements[0]?.Resource)).not.toContain('/index/');
  });

  // U6 で line に ChoreTypes の許可（GetItem・Query・ConditionCheckItem）を足したため、この U4 時点の
  // 不変条件は成り立たなくなった。コメントの予告どおりスキップにする。
  // U6 後の正しい期待は infrastructure/test/u6-recording/stacks.test.ts を参照。
  it.skip('line に ChoreTypes の許可がない（U4 の時点の確認。U6 で追加されたのでスキップ）', () => {
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
