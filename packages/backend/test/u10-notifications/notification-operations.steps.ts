import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { expect, vi } from 'vitest';
import { operationalAlert } from '../../src/services/operationalAlertService';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-operations.feature',
);
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    vi.restoreAllMocks();
    delete process.env.ALERT_TOPIC_ARN;
  });
  Scenario('メールの本文を許可項目だけにする', ({ Given, When, Then }) => {
    Given('内部処理が失敗する', () => undefined);
    When('運用通知を送る', () => undefined);
    Then('本文や名前をメールへ含めない', async () => {
      const sns = mockClient(SNSClient);
      sns.on(PublishCommand).resolves({});
      process.env.ALERT_TOPIC_ARN = 'topic';
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await operationalAlert('notify', 'internal', {
        kind: 'dailyReminder',
        targetDate: '2027-01-31',
        ...{ text: '秘密の本文' },
      });
      const body = JSON.parse(sns.commandCalls(PublishCommand)[0]!.args[0].input.Message!);
      expect(Object.keys(body).sort()).toEqual([
        'entry',
        'event',
        'kind',
        'reason',
        'runbook',
        'targetDate',
      ]);
      expect(JSON.stringify(body)).not.toContain('秘密');
      sns.restore();
    });
  });
});
