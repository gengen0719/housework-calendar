import { resolve } from 'node:path';
import { ArnFormat, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import type { AppStackProps } from './app-stack.js';
import { ssmPrefix } from './env.js';
interface Props extends AppStackProps {
  api: nodejs.NodejsFunction;
  line: nodejs.NodejsFunction;
}
/** U10の資源。実データの購読確認・実機試験・合算予算確認なしでは起動を有効にしない。 */
export class NotificationConstruct extends Construct {
  readonly notify: nodejs.NodejsFunction;
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);
    const stack = Stack.of(this),
      env = props.envName,
      enabled = props.notificationsEnabled ?? false;
    if (
      enabled &&
      (!props.notificationEmail ||
        !/^\S+@\S+\.\S+$/.test(props.notificationEmail) ||
        !props.notificationChecksPassed ||
        !props.notificationBudgetVerified ||
        !Number.isFinite(props.notificationEstimatedJpy) ||
        props.notificationEstimatedJpy! > 100 ||
        props.notificationEstimatedJpy! < 0)
    )
      throw new Error('通知の有効化には購読と実機試験、月100円以内の合算見積もり確認が必要です');
    if (props.reservedConcurrency !== undefined && props.reservedConcurrency < 3 && enabled)
      throw new Error('通知の予約並行数は3以上が必要です');
    const dlq = new sqs.Queue(this, 'DeadLetterQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(7),
    });
    const queue = new sqs.Queue(this, 'WorkQueue', {
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      visibilityTimeout: Duration.seconds(180),
      retentionPeriod: Duration.days(1),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 10 },
    });
    const topic = new sns.Topic(this, 'AlertTopic');
    if (props.notificationEmail)
      topic.addSubscription(new subs.EmailSubscription(props.notificationEmail));
    const group = new logs.LogGroup(this, 'NotifyLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const root = resolve(import.meta.dirname, '..', '..');
    this.notify = new nodejs.NodejsFunction(this, 'NotifyFunction', {
      entry: resolve(root, 'packages', 'backend', 'src', 'entries', 'notify.ts'),
      handler: 'handler',
      depsLockFilePath: resolve(root, 'package-lock.json'),
      projectRoot: root,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: props.reservedConcurrency,
      logGroup: group,
      environment: {
        ENTRY: 'notify',
        ENV: env,
        SSM_PREFIX: ssmPrefix(env),
        NOTIFICATIONS_ENABLED: String(enabled),
        NOTIFICATION_DISPATCHES_TABLE: props.notificationDispatches.tableName,
        NOTIFICATION_DISPATCHES_ARN: props.notificationDispatches.tableArn,
        NOTIFICATION_PAYLOADS_TABLE: props.notificationPayloads.tableName,
        NOTIFICATION_QUEUE_URL: queue.queueUrl,
        NOTIFICATION_QUEUE_ARN: queue.queueArn,
        NOTIFICATION_QUEUE_NAME: queue.queueName,
        ALERT_TOPIC_ARN: topic.topicArn,
        USERS_TABLE: props.users.tableName,
        FAMILIES_TABLE: props.families.tableName,
        NOTIFICATION_GROUPS_TABLE: props.notificationGroups.tableName,
        CALENDAR_TABLE: props.calendar.tableName,
        CHORE_TYPES_TABLE: props.choreTypes.tableName,
      },
      bundling: {
        minify: true,
        target: 'node22',
        format: nodejs.OutputFormat.CJS,
        externalModules: ['@aws-sdk/*'],
      },
    });
    this.notify.addEventSource(
      new sources.SqsEventSource(queue, {
        batchSize: 1,
        maxBatchingWindow: Duration.seconds(0),
        reportBatchItemFailures: true,
        maxConcurrency: 2,
        enabled,
      }),
    );
    const policy = (
      action: string[],
      resources: string[],
      conditions?: Record<string, Record<string, string>>,
    ) =>
      this.notify.addToRolePolicy(
        new iam.PolicyStatement({ actions: action, resources, conditions }),
      );
    policy(['sqs:SendMessage', 'sqs:ChangeMessageVisibility'], [queue.queueArn]);
    policy(
      [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
      ],
      [props.notificationDispatches.tableArn, props.notificationPayloads.tableArn],
    );
    policy(
      ['dynamodb:GetItem'],
      [props.users.tableArn, props.families.tableArn, props.notificationGroups.tableArn],
    );
    policy(['dynamodb:Query'], [`${props.users.tableArn}/index/familyId-index`]);
    policy(
      ['dynamodb:GetItem', 'dynamodb:Query'],
      [props.calendar.tableArn, props.choreTypes.tableArn],
    );
    policy(['dynamodb:Scan'], [props.families.tableArn]);
    policy(['dynamodb:CreateBackup'], [props.notificationDispatches.tableArn]);
    policy(
      ['dynamodb:DescribeBackup', 'dynamodb:DeleteBackup'],
      [`${props.notificationDispatches.tableArn}/backup/*`],
    );
    // ListBackupsとGetMetricStatisticsは資源指定をサポートしない。自リージョンに制限し、コードは表名・ARNとキュー名を固定する。
    policy(['dynamodb:ListBackups', 'cloudwatch:GetMetricStatistics'], ['*'], {
      StringEquals: { 'aws:RequestedRegion': stack.region },
    });
    policy(['cloudwatch:PutMetricData'], ['*'], {
      StringEquals: { 'cloudwatch:namespace': `Housework/${env}` },
    });
    const param = (suffix: string) =>
      stack.formatArn({
        service: 'ssm',
        resource: 'parameter',
        resourceName: `${ssmPrefix(env).slice(1)}/${suffix}`,
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      });
    policy(
      ['ssm:GetParameter', 'ssm:GetParameters'],
      [param('line/channel-access-token'), param('notifications/operational-hash-key')],
    );
    policy(['kms:Decrypt'], ['*'], {
      StringEquals: { 'kms:ViaService': `ssm.${stack.region}.amazonaws.com` },
    });
    for (const fn of [props.api, props.line, this.notify]) {
      fn.addEnvironment('ALERT_TOPIC_ARN', topic.topicArn);
      topic.grantPublish(fn);
    }
    const role = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account },
          ArnLike: {
            'aws:SourceArn': stack.formatArn({
              service: 'scheduler',
              resource: 'schedule-group',
              resourceName: 'default',
              arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            }),
          },
        },
      }),
    });
    this.notify.grantInvoke(role);
    dlq.grantSendMessages(role);
    const schedules: [string, string, Record<string, string>][] = [
      [
        'Daily',
        'cron(0 16 * * ? *)',
        {
          operation: 'scheduled',
          kind: 'dailyReminder',
          scheduledTime: '<aws.scheduler.scheduled-time>',
        },
      ],
      [
        'Monthly',
        'cron(0 21 * * ? *)',
        {
          operation: 'scheduled',
          kind: 'monthlySummary',
          scheduledTime: '<aws.scheduler.scheduled-time>',
        },
      ],
      ['Watchdog', 'rate(1 minute)', { operation: 'watchdog' }],
      ['Cleanup', 'cron(0 * * * ? *)', { operation: 'cleanup' }],
      ['Backup', 'cron(0 3 * * ? *)', { operation: 'backup' }],
    ];
    for (const [name, expression, input] of schedules)
      new scheduler.CfnSchedule(this, name, {
        scheduleExpression: expression,
        scheduleExpressionTimezone: 'Asia/Tokyo',
        flexibleTimeWindow: { mode: 'OFF' },
        state: enabled ? 'ENABLED' : 'DISABLED',
        target: {
          arn: this.notify.functionArn,
          roleArn: role.roleArn,
          input: JSON.stringify(input),
          deadLetterConfig: { arn: dlq.queueArn },
          retryPolicy: { maximumEventAgeInSeconds: 900, maximumRetryAttempts: 2 },
        },
      });
    const alarm = (
      name: string,
      metric: cw.IMetric,
      threshold: number,
      missing: cw.TreatMissingData,
      comparison = cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    ) => {
      const a = new cw.Alarm(this, name, {
        metric,
        threshold,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: missing,
        comparisonOperator: comparison,
        actionsEnabled: enabled,
      });
      a.addAlarmAction(new actions.SnsAction(topic));
    };
    for (const [name, fn] of [
      ['ApiErrors', props.api],
      ['LineErrors', props.line],
      ['NotifyErrors', this.notify],
    ] as const)
      alarm(
        name,
        fn.metricErrors({ period: Duration.minutes(1), statistic: 'Sum' }),
        1,
        cw.TreatMissingData.NOT_BREACHING,
      );
    alarm(
      'NotifyHealth',
      new cw.Metric({
        namespace: `Housework/${env}`,
        metricName: 'NotifyHealth',
        period: Duration.minutes(5),
        statistic: 'Minimum',
      }),
      1,
      cw.TreatMissingData.BREACHING,
      cw.ComparisonOperator.LESS_THAN_THRESHOLD,
    );
    alarm(
      'DeadLetters',
      dlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(1),
        statistic: 'Maximum',
      }),
      1,
      cw.TreatMissingData.NOT_BREACHING,
    );
  }
}
