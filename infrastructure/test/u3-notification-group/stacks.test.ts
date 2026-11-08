import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app.js';

let distDir: string;
let templates: Record<string, Template>;

interface Statement {
  Action: string | string[];
  Resource: unknown;
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u3-dist-'));
  fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>test</title>');
  const app = buildApp(
    new App({
      context: { originVerifySecret: 'dummy-secret-for-u3-tests', frontendDistPath: distDir },
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

/** 指定したテーブルを資源に含む文の操作を、並べ替えて返す */
function actionsOnTable(statements: Statement[], tableLogicalPrefix: string): string[] {
  const matching = statements.filter((s) =>
    JSON.stringify(s.Resource).includes(tableLogicalPrefix),
  );
  return matching.flatMap(actionsOf).sort();
}

const lineStatements = (): Statement[] =>
  statementsFor(t('Housework-staging-App'), 'LineFunctionServiceRole');
const apiStatements = (): Statement[] =>
  statementsFor(t('Housework-staging-App'), 'ApiFunctionServiceRole');

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

describe('U3 CDK: Data スタック', () => {
  it('NotificationGroups テーブル: PK groupId・TTL なし・オンデマンド・AWS 管理の暗号化', () => {
    t('Housework-staging-Data').hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'groupId', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      SSESpecification: { SSEEnabled: true },
      TimeToLiveSpecification: Match.absent(),
    });
  });

  it('NotificationGroups に tableName を指定していない', () => {
    const tables = Object.values(
      t('Housework-staging-Data').findResources('AWS::DynamoDB::Table', {
        Properties: { KeySchema: [{ AttributeName: 'groupId', KeyType: 'HASH' }] },
      }),
    ) as Array<{ Properties: Record<string, unknown> }>;
    expect(tables).toHaveLength(1);
    expect(tables[0]?.Properties.TableName).toBeUndefined();
  });

  it('本番の NotificationGroups は RETAIN、ステージングは DESTROY', () => {
    const find = (name: string): Array<{ DeletionPolicy: string }> =>
      Object.values(
        t(name).findResources('AWS::DynamoDB::Table', {
          Properties: { KeySchema: [{ AttributeName: 'groupId', KeyType: 'HASH' }] },
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

describe('U3 CDK: App スタックの環境変数', () => {
  it('line と api の両方に NOTIFICATION_GROUPS_TABLE がある', () => {
    expect(lambdaVariables('line').NOTIFICATION_GROUPS_TABLE).toBeDefined();
    expect(lambdaVariables('api').NOTIFICATION_GROUPS_TABLE).toBeDefined();
  });

  it('line に FAMILIES_TABLE があり、INVITATIONS_TABLE はない', () => {
    expect(lambdaVariables('line').FAMILIES_TABLE).toBeDefined();
    expect(lambdaVariables('line').INVITATIONS_TABLE).toBeUndefined();
  });
});

describe('U3 CDK: App スタックの権限', () => {
  it('line の NotificationGroups: GetItem・PutItem・DeleteItem だけ', () => {
    expect(actionsOnTable(lineStatements(), 'NotificationGroups')).toEqual([
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
    ]);
  });

  it('line の Families: GetItem・UpdateItem だけ', () => {
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

  it('line に ConditionCheckItem がない', () => {
    expect(lineStatements().flatMap(actionsOf)).not.toContain('dynamodb:ConditionCheckItem');
  });

  it('api の NotificationGroups: GetItem だけ', () => {
    expect(actionsOnTable(apiStatements(), 'NotificationGroups')).toEqual(['dynamodb:GetItem']);
  });

  it('api の Families は U2 のまま（GetItem・PutItem・UpdateItem・ConditionCheckItem）', () => {
    expect(actionsOnTable(apiStatements(), 'Families')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ]);
  });
});
