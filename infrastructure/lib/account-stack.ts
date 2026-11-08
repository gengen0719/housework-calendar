import { Aws, CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { REGION, ssmPrefix, type EnvName } from './env.js';

export interface AccountStackProps extends StackProps {
  githubOwner: string;
  githubRepo: string;
  /**
   * GitHub の持ち主とリポジトリの番号（ID）。GitHub は OIDC の `sub` を
   * `repo:<owner>@<ownerId>/<repo>@<repoId>:...` の形で出すことがあるため、
   * 両方を渡すと、名前だけの形と ID 入りの形の両方を受け付ける（どちらも完全一致。ワイルドカードは使わない）
   */
  githubOwnerId?: string;
  githubRepoId?: string;
  budgetEmail: string;
  /** CDK の bootstrap のクオリファイア（既定のまま） */
  bootstrapQualifier?: string;
}

const OIDC_HOST = 'token.actions.githubusercontent.com';

/**
 * `Housework-Account`: アカウントに 1 つだけ。GitHub の OIDC のプロバイダー、
 * 反映用のロール 2 つ、AWS Budgets（月 1 ドル）。作り手が最初に手元から 1 回反映する。
 */
export class AccountStack extends Stack {
  readonly stagingRole: iam.Role;
  readonly productionRole: iam.Role;

  constructor(scope: Construct, id: string, props: AccountStackProps) {
    super(scope, id, props);

    const qualifier = props.bootstrapQualifier ?? 'hnb659fds';
    const hasIds = props.githubOwnerId !== undefined && props.githubRepoId !== undefined;
    if ((props.githubOwnerId === undefined) !== (props.githubRepoId === undefined)) {
      throw new Error('githubOwnerId と githubRepoId は両方そろえて渡してください');
    }
    for (const id of [props.githubOwnerId, props.githubRepoId]) {
      if (id !== undefined && !/^[0-9]+$/.test(id)) {
        throw new Error('githubOwnerId と githubRepoId は数字だけにしてください');
      }
    }
    // `sub` の頭の部分。名前だけの形と、ID 入りの形
    const repoForms = [`${props.githubOwner}/${props.githubRepo}`];
    if (hasIds) {
      repoForms.push(
        `${props.githubOwner}@${props.githubOwnerId}/${props.githubRepo}@${props.githubRepoId}`,
      );
    }

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: `https://${OIDC_HOST}`,
      clientIds: ['sts.amazonaws.com'],
    });

    this.stagingRole = this.createDeployRole(
      'StagingDeployRole',
      'staging',
      provider,
      repoForms.map((repo) => `repo:${repo}:ref:refs/heads/main`),
      qualifier,
    );
    // 本番は環境 `production` の承認のあとだけ。環境の反映できるブランチを main に限る設定は GitHub 側で行う
    this.productionRole = this.createDeployRole(
      'ProductionDeployRole',
      'production',
      provider,
      repoForms.map((repo) => `repo:${repo}:environment:production`),
      qualifier,
    );

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'housework-calendar-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: 1, unit: 'USD' },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.budgetEmail }],
        },
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [{ subscriptionType: 'EMAIL', address: props.budgetEmail }],
        },
      ],
    });

    new CfnOutput(this, 'StagingDeployRoleArn', { value: this.stagingRole.roleArn });
    new CfnOutput(this, 'ProductionDeployRoleArn', { value: this.productionRole.roleArn });
  }

  private createDeployRole(
    id: string,
    envName: EnvName,
    provider: iam.IOpenIdConnectProvider,
    subjects: string[],
    qualifier: string,
  ): iam.Role {
    const role = new iam.Role(this, id, {
      roleName: `housework-calendar-github-${envName}-deploy`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          [`${OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          // 値が 2 つのときは、どちらかに完全一致すれば引き受けられる
          [`${OIDC_HOST}:sub`]: subjects.length === 1 ? subjects[0] : subjects,
        },
      }),
    });

    // CDK の bootstrap のロールを引き受けて反映する。
    // CDK はセッションにタグを付けて引き受けるので、sts:TagSession も要る（bootstrap のロールの信頼ポリシーもこれを前提にしている）
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: [
          `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-${qualifier}-*-role-${Aws.ACCOUNT_ID}-${REGION}`,
        ],
      }),
    );

    // 秘密のヘッダーの値だけを読む（自分の環境のぶんだけ）
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:${Aws.PARTITION}:ssm:${REGION}:${Aws.ACCOUNT_ID}:parameter${ssmPrefix(envName)}/cloudfront/*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'kms:ViaService': `ssm.${REGION}.amazonaws.com` } },
      }),
    );
    return role;
  }
}
