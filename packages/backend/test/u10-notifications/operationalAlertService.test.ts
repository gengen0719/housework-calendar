import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { operationalAlert, reportEntryFailure } from '../../src/services/operationalAlertService';
import { logger } from '../../src/lib/logger';
const sns = mockClient(SNSClient);
beforeEach(() => {
  sns.reset();
  process.env.ALERT_TOPIC_ARN = 'topic';
  vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  delete process.env.ALERT_TOPIC_ARN;
  vi.restoreAllMocks();
});
describe('独立した失敗通知', () => {
  it.each(['api', 'line', 'notify'] as const)('%sの失敗を知らせる', async (entry) => {
    sns.on(PublishCommand).resolves({});
    await operationalAlert(entry, 'internal');
    expect(JSON.parse(sns.commandCalls(PublishCommand)[0]!.args[0].input.Message!).entry).toBe(
      entry,
    );
  });
  it('本文が任意に追加されても出さない', async () => {
    sns.on(PublishCommand).resolves({});
    await operationalAlert('notify', 'internal', {
      kind: 'dailyReminder',
      ...{ text: 'private body', displayName: 'private name' },
    });
    expect(sns.commandCalls(PublishCommand)[0]!.args[0].input.Message).not.toContain('private');
  });
  it('SNS失敗を正常にしない', async () => {
    sns.on(PublishCommand).rejects(new Error('offline'));
    await expect(operationalAlert('notify', 'internal')).rejects.toThrow(
      'OPERATIONAL_ALERT_FAILED',
    );
    expect(logger.error).toHaveBeenCalled();
  });
  it('対話の返事は通知エラーで変えない', async () => {
    sns.on(PublishCommand).rejects(new Error('offline'));
    await expect(reportEntryFailure('api')).resolves.toBeUndefined();
  });
  it('配備前の未設定では送信しない', async () => {
    delete process.env.ALERT_TOPIC_ARN;
    await operationalAlert('notify', 'internal');
    expect(sns.calls()).toHaveLength(0);
    expect(logger.error).toHaveBeenCalled();
  });
});
