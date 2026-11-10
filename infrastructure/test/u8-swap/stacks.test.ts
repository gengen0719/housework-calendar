import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../lib/app.js';
import { FAKE_ORIGIN_VERIFY_SECRET } from '../fixtures/fakeSecrets.js';

// U8（代わりにやる）は、インフラを一切変えない（NFR4.82、NFR1.33）。
// このテストは「U8 の前後で同じ」ことを固定する。申し出は Calendar の既存の表に
// `SWAP#<dutyId>` の項目として置くので、表・索引・TTL・IAM・環境変数に差がない。

let distDir: string;
let templates: Record<string, Template>;

interface Statement {
  Effect?: string;
  Action: string | string[];
  Resource: unknown;
}

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'housework-u8-dist-'));
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

const lambdaVariables = (entry: 'api' | 'line', stackName = 'Housework-staging-App') => {
  const fns = Object.values(t(stackName).findResources('AWS::Lambda::Function')) as Array<{
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

describe('U8 CDK: line のロールは U8 で変わらない（NFR4.81、NFR4.82。U6 の範囲のまま）', () => {
  it('line の Calendar は U6 のまま（4 操作。U8 で追加なし）', () => {
    expect(actionsOnTable(lineStatements(), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
  });

  it('line の ChoreTypes は U6 のまま（3 操作。読むだけ）', () => {
    expect(actionsOnTable(lineStatements(), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
    ]);
  });

  it('line に足さないものが 1 つもない（PutItem・DeleteItem・Batch 系・Scan・dynamodb:*）', () => {
    const actions = actionsOnTable(lineStatements(), 'Calendar');
    for (const forbidden of [
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:BatchGetItem',
      'dynamodb:BatchWriteItem',
      'dynamodb:Scan',
      'dynamodb:*',
    ]) {
      expect(actions).not.toContain(forbidden);
    }
    const all = lineStatements().flatMap(actionsOf);
    expect(all).not.toContain('dynamodb:*');
  });

  it('line の ChoreTypes に書き込みの許可がない', () => {
    const actions = actionsOnTable(lineStatements(), 'ChoreTypes');
    for (const write of ['dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem']) {
      expect(actions).not.toContain(write);
    }
  });

  it('line の DynamoDB の許可に Resource: "*" がない', () => {
    const dynamo = lineStatements().filter((s) =>
      actionsOf(s).some((a) => a.startsWith('dynamodb:')),
    );
    expect(dynamo.length).toBeGreaterThan(0);
    for (const s of dynamo) expect(s.Resource).not.toBe('*');
  });

  it('line の環境変数に CALENDAR_TABLE と CHORE_TYPES_TABLE がある（U6 のまま）', () => {
    const vars = lambdaVariables('line');
    expect(vars.CALENDAR_TABLE).toBeDefined();
    expect(vars.CHORE_TYPES_TABLE).toBeDefined();
  });
});

describe('U8 CDK: api のロールは U8 で変わらない', () => {
  it('api の Calendar は U5 のまま（6 操作。U8 で追加なし）', () => {
    expect(actionsOnTable(apiStatements(), 'Calendar')).toEqual(SIX_TABLE_ACTIONS);
  });

  it('api の ChoreTypes は U4 のまま（6 操作）', () => {
    expect(actionsOnTable(apiStatements(), 'ChoreTypes')).toEqual(SIX_TABLE_ACTIONS);
  });

  it('IAM の文の数は U7 のまま（U8 で文を足していない）', () => {
    expect(apiStatements()).toHaveLength(11);
    expect(lineStatements()).toHaveLength(9);
  });

  it('line と api の環境変数に、U8 で足された表の名前も秘密の値もない', () => {
    for (const entry of ['api', 'line'] as const) {
      const keys = Object.keys(lambdaVariables(entry));
      expect(keys).not.toContain('SWAP_TABLE');
      expect(keys).not.toContain('SWAPS_TABLE');
      expect(keys).not.toContain('OFFERS_TABLE');
      expect(keys.filter((k) => /PUSH|BROADCAST|MULTICAST/i.test(k))).toEqual([]);
    }
  });
});

describe('U8 CDK: 数と設定が U8 の前後で変わらない（NFR1.33）', () => {
  it('テーブル・Lambda・ロググループ・MetricFilter・アラームの数が U7 のまま', () => {
    t('Housework-staging-Data').resourceCountIs('AWS::DynamoDB::Table', 8);
    t('Housework-staging-App').resourceCountIs('AWS::Lambda::Function', 4);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::LogGroup', 2);
    t('Housework-staging-App').resourceCountIs('AWS::Logs::MetricFilter', 1);
    t('Housework-staging-App').resourceCountIs('AWS::CloudWatch::Alarm', 0);
    t('Housework-production-App').resourceCountIs('AWS::CloudWatch::Alarm', 0);
  });

  it('Calendar に TTL と新しい索引がない', () => {
    for (const stackName of ['Housework-staging-Data', 'Housework-production-Data']) {
      const tables = Object.entries(t(stackName).findResources('AWS::DynamoDB::Table'))
        .filter(([id]) => id.startsWith('Calendar'))
        .map(
          ([, r]) =>
            r as unknown as {
              Properties: {
                TimeToLiveSpecification?: unknown;
                GlobalSecondaryIndexes?: unknown;
                LocalSecondaryIndexes?: unknown;
              };
            },
        );
      expect(tables).toHaveLength(1);
      expect(tables[0]?.Properties.TimeToLiveSpecification).toBeUndefined();
      expect(tables[0]?.Properties.GlobalSecondaryIndexes).toBeUndefined();
      expect(tables[0]?.Properties.LocalSecondaryIndexes).toBeUndefined();
    }
  });

  it('line と api の Lambda は MemorySize 256・Timeout 30・ARM64 のまま（NFR3.16）', () => {
    for (const entry of ['api', 'line']) {
      t('Housework-staging-App').hasResourceProperties('AWS::Lambda::Function', {
        Environment: { Variables: Match.objectLike({ ENTRY: entry }) },
        MemorySize: 256,
        Timeout: 30,
        Architectures: ['arm64'],
      });
    }
  });

  it('同時実行の上限は既定では付かない（U1 のまま。NFR3.16）', () => {
    expect(JSON.stringify(t('Housework-staging-App').toJSON())).not.toContain(
      'ReservedConcurrentExecutions',
    );
  });
});

describe('U8 CDK: 本番とステージングの資源の切り分け（NFR6.9、NFR10.9）', () => {
  it('本番の Calendar は Retain のまま', () => {
    const tables = Object.entries(
      t('Housework-production-Data').findResources('AWS::DynamoDB::Table'),
    )
      .filter(([id]) => id.startsWith('Calendar'))
      .map(([, r]) => r as unknown as { DeletionPolicy: string });
    expect(tables).toHaveLength(1);
    expect(tables[0]?.DeletionPolicy).toBe('Retain');
  });

  it('ステージングの line・api の許可が本番の資源の ARN を含まない', () => {
    expect(JSON.stringify(lineStatements('Housework-staging-App'))).not.toContain(
      'Housework-production',
    );
    expect(JSON.stringify(apiStatements('Housework-staging-App'))).not.toContain(
      'Housework-production',
    );
  });

  it('本番の line の Calendar・ChoreTypes の許可もステージングと同じ形のまま', () => {
    expect(actionsOnTable(lineStatements('Housework-production-App'), 'Calendar')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ]);
    expect(actionsOnTable(lineStatements('Housework-production-App'), 'ChoreTypes')).toEqual([
      'dynamodb:ConditionCheckItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
    ]);
  });
});
