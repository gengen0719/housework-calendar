import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { beforeEach, expect } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDispatch, replaceDispatch } from '../../src/repositories/notificationRepository';
import { dispatchFixture } from './helpers/fixtures';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-state.feature',
);
const db = mockClient(DynamoDBDocumentClient);
beforeEach(() => {
  db.reset();
  process.env.NOTIFICATION_DISPATCHES_TABLE = 'dispatches';
  process.env.NOTIFICATION_PAYLOADS_TABLE = 'payloads';
});
describeFeature(feature, ({ Scenario }) => {
  Scenario('作成と所有権の版を検査する', ({ Given, When, Then }) => {
    Given('同じ通知を二つの実行が扱う', () => undefined);
    When('初回保存と所有権の更新を要求する', () => undefined);
    Then('原子的な保存と版の条件が付く', async () => {
      db.on(TransactWriteCommand).resolves({});
      const record = dispatchFixture();
      await createDispatch(record);
      const create = db.commandCalls(TransactWriteCommand)[0]!.args[0].input;
      expect(create.TransactItems?.[0]?.Put?.ConditionExpression).toContain('attribute_not_exists');
      await replaceDispatch(record, {
        ...record,
        state: 'sending',
        leaseOwner: 'owner',
        leaseUntil: 100,
      });
      const update = db.commandCalls(TransactWriteCommand)[1]!.args[0].input;
      expect(update.TransactItems?.[0]?.Put?.ConditionExpression).toContain('version = :version');
      expect(update.TransactItems?.[0]?.Put?.Item?.version).toBe(1);
    });
  });
});
