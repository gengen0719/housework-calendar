import { ArnFormat, CfnOutput, Stack } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { ssmPrefix } from './env.js';

export function addCodexStagingReadOnly(
  stack: Stack,
  bucket: s3.IBucket,
  distribution: cloudfront.IDistribution,
  securityHeaders: cloudfront.IResponseHeadersPolicy,
  spaRewrite: cloudfront.IFunction,
): void {
  const issuerHost = 'auth.openai.com';
  const audience = 'sts.amazonaws.com';
  const subject = 'oai:v1:oic:oic_6b05140f427c81a3af5fe5fd6c8c2a1d';
  const provider = new iam.CfnOIDCProvider(stack, 'CodexOidcProvider', {
    url: `https://${issuerHost}`,
    clientIdList: [audience],
  });

  const regionalArn = (
    service: string,
    resource: string,
    resourceName: string,
    arnFormat = ArnFormat.SLASH_RESOURCE_NAME,
  ) => stack.formatArn({ service, resource, resourceName, arnFormat });
  const globalArn = (service: string, resource: string, resourceName: string) =>
    stack.formatArn({ service, resource, resourceName, region: '' });
  const appPrefix = `${stack.stackName}-*`;
  const table = regionalArn('dynamodb', 'table', 'Housework-staging-Data-*');
  const logGroup = regionalArn('logs', 'log-group', appPrefix, ArnFormat.COLON_RESOURCE_NAME);
  const scopedResources = [
    {
      actions: [
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackResource',
        'cloudformation:DescribeStackResources',
        'cloudformation:ListStackResources',
      ],
      resources: ['App', 'Data'].map((name) =>
        regionalArn('cloudformation', 'stack', `Housework-staging-${name}/*`),
      ),
    },
    {
      actions: [
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTimeToLive',
        'dynamodb:DescribeContinuousBackups',
        'dynamodb:ListTagsOfResource',
      ],
      resources: [table],
    },
    {
      actions: ['dynamodb:DescribeBackup'],
      resources: [`${table}/backup/*`],
    },
    {
      actions: [
        'lambda:GetFunction',
        'lambda:GetFunctionConfiguration',
        'lambda:GetFunctionUrlConfig',
        'lambda:GetPolicy',
        'lambda:ListAliases',
        'lambda:ListVersionsByFunction',
        'lambda:ListTags',
      ],
      resources: [regionalArn('lambda', 'function', appPrefix, ArnFormat.COLON_RESOURCE_NAME)],
    },
    {
      actions: ['logs:DescribeLogStreams', 'logs:FilterLogEvents', 'logs:DescribeMetricFilters'],
      resources: [`${logGroup}:*`],
    },
    {
      actions: ['logs:GetLogEvents'],
      resources: [`${logGroup}:log-stream:*`],
    },
    {
      actions: ['logs:ListTagsForResource'],
      resources: [logGroup],
    },
    {
      actions: [
        'cloudwatch:DescribeAlarms',
        'cloudwatch:DescribeAlarmHistory',
        'cloudwatch:ListTagsForResource',
      ],
      resources: [regionalArn('cloudwatch', 'alarm', appPrefix, ArnFormat.COLON_RESOURCE_NAME)],
    },
    {
      actions: [
        's3:GetBucketLocation',
        's3:GetBucketPolicy',
        's3:GetBucketPublicAccessBlock',
        's3:GetBucketTagging',
        's3:GetBucketVersioning',
        's3:GetEncryptionConfiguration',
        's3:ListBucket',
      ],
      resources: [bucket.bucketArn],
    },
    {
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects('*')],
    },
    {
      // Distribution の設定取得はオリジン認証ヘッダーの値も返す。
      actions: ['cloudfront:ListTagsForResource'],
      resources: [distribution.distributionArn],
    },
    {
      actions: ['cloudfront:GetResponseHeadersPolicy'],
      resources: [
        globalArn('cloudfront', 'response-headers-policy', securityHeaders.responseHeadersPolicyId),
      ],
    },
    {
      actions: ['cloudfront:DescribeFunction', 'cloudfront:GetFunction'],
      resources: [spaRewrite.functionArn],
    },
    {
      actions: ['cloudfront:GetOriginAccessControl'],
      resources: stack.node
        .findAll()
        .filter(
          (child): child is cloudfront.CfnOriginAccessControl =>
            child instanceof cloudfront.CfnOriginAccessControl,
        )
        .map((control) => globalArn('cloudfront', 'origin-access-control', control.attrId)),
    },
    {
      actions: [
        'iam:GetRole',
        'iam:GetRolePolicy',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies',
        'iam:ListRoleTags',
      ],
      resources: [globalArn('iam', 'role', appPrefix)],
    },
    {
      actions: ['sqs:GetQueueAttributes', 'sqs:GetQueueUrl', 'sqs:ListQueueTags'],
      resources: [stack.formatArn({ service: 'sqs', resource: appPrefix })],
    },
    {
      actions: [
        'sns:GetTopicAttributes',
        'sns:ListSubscriptionsByTopic',
        'sns:ListTagsForResource',
      ],
      resources: [stack.formatArn({ service: 'sns', resource: appPrefix })],
    },
    {
      actions: ['ssm:ListTagsForResource'],
      resources: [regionalArn('ssm', 'parameter', `${ssmPrefix('staging').slice(1)}/*`)],
    },
    {
      actions: ['scheduler:GetSchedule'],
      resources: [regionalArn('scheduler', 'schedule', `default/${appPrefix}`)],
    },
  ];
  const role = new iam.CfnRole(stack, 'CodexStagingReadOnlyRole', {
    roleName: 'housework-calendar-codex-staging-read-only',
    maxSessionDuration: 3600,
    assumeRolePolicyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Federated: provider.attrArn },
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              [`${issuerHost}:aud`]: audience,
              [`${issuerHost}:sub`]: subject,
            },
          },
        },
      ],
    },
    policies: [
      {
        policyName: 'StagingResourceReadOnly',
        policyDocument: {
          Version: '2012-10-17',
          Statement: scopedResources
            .filter(({ resources }) => resources.length > 0)
            .map(({ actions, resources }) => ({
              Effect: 'Allow',
              Action: actions,
              Resource: resources,
            })),
        },
      },
    ],
  });
  new CfnOutput(stack, 'CodexStagingReadOnlyRoleArn', {
    value: role.attrArn,
  });
}
