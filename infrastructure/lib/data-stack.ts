import { RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';
import type { EnvName } from './env.js';

export interface DataStackProps extends StackProps {
  envName: EnvName;
}

/** `Housework-<env>-Data`: DynamoDB のテーブル。本番は消さない設定（NFR6.2） */
export class DataStack extends Stack {
  readonly users: dynamodb.Table;
  readonly families: dynamodb.Table;
  readonly processedLineEvents: dynamodb.Table;
  readonly requestRecords: dynamodb.Table;
  readonly invitations: dynamodb.Table;
  readonly notificationGroups: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const isProd = props.envName === 'production';
    const common = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    };

    this.users = new dynamodb.Table(this, 'Users', {
      ...common,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
    });
    this.users.addGlobalSecondaryIndex({
      indexName: 'lineUserId-index',
      partitionKey: { name: 'lineUserId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    // U2: 家族のメンバーの一覧（CloudFormation は 1 回の更新で GSI を 1 つしか足せない）
    this.users.addGlobalSecondaryIndex({
      indexName: 'familyId-index',
      partitionKey: { name: 'familyId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: ['displayName', 'role', 'familyJoinedAt'],
    });

    this.families = new dynamodb.Table(this, 'Families', {
      ...common,
      partitionKey: { name: 'familyId', type: dynamodb.AttributeType.STRING },
    });

    this.processedLineEvents = new dynamodb.Table(this, 'ProcessedLineEvents', {
      ...common,
      partitionKey: { name: 'webhookEventId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
    });

    this.requestRecords = new dynamodb.Table(this, 'RequestRecords', {
      ...common,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'idempotencyKey', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
    });

    // U2: 招待（期限 + 7 日で TTL により消える）
    this.invitations = new dynamodb.Table(this, 'Invitations', {
      ...common,
      partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
    });

    // U3: お知らせ先のグループ（TTL なし。1 グループ 1 家族）
    this.notificationGroups = new dynamodb.Table(this, 'NotificationGroups', {
      ...common,
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
    });
  }
}
