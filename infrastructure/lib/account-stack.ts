import { Aws, CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { REGION, ssmPrefix, type EnvName } from './env.js';

export interface AccountStackProps extends StackProps {
  githubOwner: string;
  githubRepo: string;
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
    const repo = `${props.githubOwner}/${props.githubRepo}`;

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: `https://${OIDC_HOST}`,
      clientIds: ['sts.amazonaws.com'],
    });

    this.stagingRole = this.createDeployRole(
      'StagingDeployRole',
      'staging',
      provider,
      `repo:${repo}:ref:refs/heads/main`,
      qualifier,
    );
    // 本番は環境 `production` の承認のあとだけ。環境の反映できるブランチを main に限る設定は GitHub 側で行う
    this.productionRole = this.createDeployRole(
      'ProductionDeployRole',
      'production',
      provider,
      `repo:${repo}:environment:production`,
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
    subject: string,
    qualifier: string,
  ): iam.Role {
    const role = new iam.Role(this, id, {
      roleName: `housework-calendar-github-${envName}-deploy`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          [`${OIDC_HOST}:aud`]: 'sts.amazonaws.com',
          [`${OIDC_HOST}:sub`]: subject,
        },
      }),
    });

    // CDK の bootstrap のロールを引き受けて反映する
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
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
