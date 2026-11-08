import * as path from 'node:path';
import { ArnFormat, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import { ssmPrefix, type EnvName } from './env.js';

/**
 * 応答ヘッダーの CSP。MUI（emotion）が内側のスタイルを使うため style-src に
 * 'unsafe-inline' を許す（承認済みの逸脱）。script-src は厳しいまま。
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.line.me https://access.line.me",
  "img-src 'self' data: https://profile.line-scdn.net",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** 画面の道（拡張子のない道）を /index.html に書き換える。/v1/ と /line/ は触らない */
export const SPA_REWRITE_FUNCTION_CODE = `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/v1/') === 0 || uri.indexOf('/line/') === 0) {
    return request;
  }
  if (uri.lastIndexOf('.') > uri.lastIndexOf('/')) {
    return request;
  }
  request.uri = '/index.html';
  return request;
}
`;

export interface AppStackProps extends StackProps {
  envName: EnvName;
  users: dynamodb.ITable;
  families: dynamodb.ITable;
  processedLineEvents: dynamodb.ITable;
  requestRecords: dynamodb.ITable;
  invitations: dynamodb.ITable;
  notificationGroups: dynamodb.ITable;
  choreTypes: dynamodb.ITable;
  /** CloudFront が元に付ける秘密のヘッダー `X-Origin-Verify` の値（CDK のコンテキストから） */
  originVerifySecret: string;
  /** ビルド済みの画面（packages/frontend/dist）のあるフォルダ */
  frontendDistPath: string;
  /** 関数ごとの予約された同時実行数。未指定なら予約しない（新しいアカウントの枠が 10 でも反映できる） */
  reservedConcurrency?: number;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const ENTRIES_DIR = path.join(REPO_ROOT, 'packages', 'backend', 'src', 'entries');
const LOCK_FILE = path.join(REPO_ROOT, 'package-lock.json');

/** `Housework-<env>-App`: Lambda、CloudFront、S3、権限、ログ */
export class AppStack extends Stack {
  readonly distribution: cloudfront.Distribution;
  readonly apiFunction: nodejs.NodejsFunction;
  readonly lineFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { envName } = props;
    const prefix = ssmPrefix(envName);
    const paramArn = (suffix: string): string =>
      this.formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: `${prefix.slice(1)}/${suffix}`,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      });

    const api = this.createFunction('Api', 'api', props, {
      SSM_PREFIX: prefix,
      USERS_TABLE: props.users.tableName,
      FAMILIES_TABLE: props.families.tableName,
      REQUEST_RECORDS_TABLE: props.requestRecords.tableName,
      INVITATIONS_TABLE: props.invitations.tableName,
      NOTIFICATION_GROUPS_TABLE: props.notificationGroups.tableName,
      CHORE_TYPES_TABLE: props.choreTypes.tableName,
      ENV: envName,
      ENTRY: 'api',
    });
    this.apiFunction = api.fn;
    this.lineFunction = this.createFunction('Line', 'line', props, {
      SSM_PREFIX: prefix,
      USERS_TABLE: props.users.tableName,
      FAMILIES_TABLE: props.families.tableName,
      PROCESSED_LINE_EVENTS_TABLE: props.processedLineEvents.tableName,
      NOTIFICATION_GROUPS_TABLE: props.notificationGroups.tableName,
      ENV: envName,
      ENTRY: 'line',
    }).fn;

    // 使えない招待を開こうとした回数（濫用の目安。アラームは U10）。データのない時間は 0
    new logs.MetricFilter(this, 'InvitationInvalidMetricFilter', {
      logGroup: api.logGroup,
      metricNamespace: `Housework/${envName}`,
      metricName: 'InvitationInvalidCount',
      filterPattern: logs.FilterPattern.literal(
        '{ $.event = "INVITATION_REJECTED" && $.reason = "INVITATION_INVALID" }',
      ),
      metricValue: '1',
      defaultValue: 0,
    });

    // --- 権限（自分の環境のテーブルとパラメータだけ） ---
    const usersIndexArn = `${props.users.tableArn}/index/lineUserId-index`;
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [props.users.tableArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [usersIndexArn],
      }),
    );
    // U2: 作り直し・参加の取引で使う操作（Families は Update と ConditionCheck を足す）
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:ConditionCheckItem',
        ],
        resources: [props.families.tableArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [props.requestRecords.tableArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:ConditionCheckItem',
        ],
        resources: [props.invitations.tableArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [`${props.users.tableArn}/index/familyId-index`],
      }),
    );
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [props.users.tableArn],
      }),
    );
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [usersIndexArn],
      }),
    );
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [props.processedLineEvents.tableArn],
      }),
    );
    // U3: お知らせ先の登録・解除（TransactWriteItems は項目ごとの Put/Update/Delete の許可で確かめられる）。
    // ConditionCheck は使わないので ConditionCheckItem は足さない
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'],
        resources: [props.notificationGroups.tableArn],
      }),
    );
    this.lineFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
        resources: [props.families.tableArn],
      }),
    );
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem'],
        resources: [props.notificationGroups.tableArn],
      }),
    );

    // U4: お手伝いの種類（api だけ。Scan と ConditionCheckItem は足さない。ConditionCheckItem は U5 で足す。line には足さない）
    this.apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [props.choreTypes.tableArn],
      }),
    );

    const grantParameters = (fn: nodejs.NodejsFunction, suffixes: string[]): void => {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['ssm:GetParameter', 'ssm:GetParameters'],
          resources: suffixes.map((s) => paramArn(s)),
        }),
      );
      // SecureString の復号（AWS 管理の SSM 用のキー。SSM 経由に限る）
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: ['*'],
          conditions: {
            StringEquals: { 'kms:ViaService': `ssm.${this.region}.amazonaws.com` },
          },
        }),
      );
    };
    grantParameters(this.apiFunction, ['jwt/*', 'line/*', 'cloudfront/*']);
    grantParameters(this.lineFunction, ['line/*', 'cloudfront/*']);

    // --- 関数 URL（認証 NONE。公開で呼べる許可は CDK が付ける。秘密のヘッダーで守る） ---
    const apiUrl = this.apiFunction.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    const lineUrl = this.lineFunction.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });

    // --- S3（非公開）と CloudFront ---
    const bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(730),
          includeSubdomains: true,
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      },
    });

    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      code: cloudfront.FunctionCode.fromInline(SPA_REWRITE_FUNCTION_CODE),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const originVerifyHeaders = { 'X-Origin-Verify': props.originVerifySecret };
    const apiBehavior: cloudfront.BehaviorOptions = {
      origin: new origins.FunctionUrlOrigin(apiUrl, { customHeaders: originVerifyHeaders }),
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: securityHeaders,
    };
    const lineBehavior: cloudfront.BehaviorOptions = {
      ...apiBehavior,
      origin: new origins.FunctionUrlOrigin(lineUrl, { customHeaders: originVerifyHeaders }),
    };

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/v1/*': apiBehavior,
        '/line/webhook': lineBehavior,
      },
    });

    new s3deploy.BucketDeployment(this, 'WebDeployment', {
      sources: [s3deploy.Source.asset(props.frontendDistPath)],
      destinationBucket: bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
    new CfnOutput(this, 'ApiFunctionUrl', { value: apiUrl.url });
  }

  private createFunction(
    logicalId: string,
    entry: 'api' | 'line',
    props: AppStackProps,
    environment: Record<string, string>,
  ): { fn: nodejs.NodejsFunction; logGroup: logs.LogGroup } {
    const logGroup = new logs.LogGroup(this, `${logicalId}LogGroup`, {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const fn = new nodejs.NodejsFunction(this, `${logicalId}Function`, {
      entry: path.join(ENTRIES_DIR, `${entry}.ts`),
      handler: 'handler',
      depsLockFilePath: LOCK_FILE,
      projectRoot: REPO_ROOT,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: props.reservedConcurrency,
      logGroup,
      environment,
      bundling: {
        minify: true,
        target: 'node22',
        format: nodejs.OutputFormat.CJS,
        externalModules: ['@aws-sdk/*'],
      },
    });
    return { fn, logGroup };
  }
}
