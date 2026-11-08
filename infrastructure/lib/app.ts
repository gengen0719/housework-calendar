import * as fs from 'node:fs';
import * as path from 'node:path';
import { App } from 'aws-cdk-lib';
import { AccountStack } from './account-stack.js';
import { AppStack } from './app-stack.js';
import { DataStack } from './data-stack.js';
import { ENV_NAMES, REGION } from './env.js';

const DEFAULT_FRONTEND_DIST = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'packages',
  'frontend',
  'dist',
);

function requireContext(app: App, key: string): string {
  const value: unknown = app.node.tryGetContext(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`CDK のコンテキスト ${key} が必要です（例: -c ${key}=...）`);
  }
  return value;
}

/** コンテキストの値。数字で渡されても文字列にそろえる。なければ undefined */
function optionalContextString(app: App, key: string): string | undefined {
  const value: unknown = app.node.tryGetContext(key);
  if (value === undefined || value === '') return undefined;
  return String(value);
}

/** 4 つのスタックと、あれば Housework-Account を組み立てる。bin/app.ts とテストが使う */
export function buildApp(app: App = new App()): App {
  const account = process.env.CDK_DEFAULT_ACCOUNT;
  const env = { account, region: REGION };

  const originVerifySecret = requireContext(app, 'originVerifySecret');
  const frontendDistPath: string =
    (app.node.tryGetContext('frontendDistPath') as string | undefined) ?? DEFAULT_FRONTEND_DIST;
  if (!fs.existsSync(frontendDistPath)) {
    throw new Error(
      `画面のビルド結果がありません: ${frontendDistPath}（先に packages/frontend をビルドしてください）`,
    );
  }

  const rawConcurrency: unknown = app.node.tryGetContext('reservedConcurrency');
  const reservedConcurrency =
    rawConcurrency === undefined || rawConcurrency === '' ? undefined : Number(rawConcurrency);
  if (
    reservedConcurrency !== undefined &&
    (!Number.isInteger(reservedConcurrency) || reservedConcurrency < 1)
  ) {
    throw new Error('reservedConcurrency は 1 以上の整数にしてください');
  }

  for (const envName of ENV_NAMES) {
    const data = new DataStack(app, `Housework-${envName}-Data`, { env, envName });
    new AppStack(app, `Housework-${envName}-App`, {
      env,
      envName,
      users: data.users,
      families: data.families,
      processedLineEvents: data.processedLineEvents,
      requestRecords: data.requestRecords,
      originVerifySecret,
      frontendDistPath,
      reservedConcurrency,
    });
  }

  // 作り手が最初に 1 回、手元から反映する。3 つのコンテキストがそろったときだけ作る
  const githubOwner: unknown = app.node.tryGetContext('githubOwner');
  const githubRepo: unknown = app.node.tryGetContext('githubRepo');
  const budgetEmail: unknown = app.node.tryGetContext('budgetEmail');
  const githubOwnerId = optionalContextString(app, 'githubOwnerId');
  const githubRepoId = optionalContextString(app, 'githubRepoId');
  if (
    typeof githubOwner === 'string' &&
    typeof githubRepo === 'string' &&
    typeof budgetEmail === 'string'
  ) {
    new AccountStack(app, 'Housework-Account', {
      env,
      githubOwner,
      githubRepo,
      githubOwnerId,
      githubRepoId,
      budgetEmail,
    });
  }
  return app;
}
