import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { logger } from '../../src/lib/logger';
import { handler } from '../../src/entries/notify';
import * as service from '../../src/services/notificationService';
import * as family from '../../src/services/familyMemberService';
import * as queue from '../../src/services/notificationQueueService';
import * as ops from '../../src/services/notificationMaintenanceService';
import * as alerts from '../../src/services/operationalAlertService';
import * as repo from '../../src/repositories/notificationRepository';
import { job } from './helpers/workflow';
import { FAKE_U10_OPERATIONAL_SECRET } from '../fixtures/fakeSecrets';
const event = () => ({
  Records: [
    {
      messageId: 'message',
      receiptHandle: 'receipt',
      eventSource: 'aws:sqs',
      eventSourceARN: 'queue-arn',
      body: JSON.stringify(job),
    },
  ],
});
beforeEach(() => {
  process.env.NOTIFICATIONS_ENABLED = 'true';
  process.env.NOTIFICATION_QUEUE_ARN = 'queue-arn';
  process.env.ENV = 'staging';
  vi.spyOn(ops, 'operationalKey').mockResolvedValue(FAKE_U10_OPERATIONAL_SECRET);
  vi.spyOn(alerts, 'operationalAlert').mockResolvedValue();
  vi.spyOn(repo, 'completeRunFamily').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.NOTIFICATIONS_ENABLED;
});
describe('通知の入口とキュー応答', () => {
  it('無効状態では送信を始めない', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'false';
    const spy = vi.spyOn(service, 'dispatchFamily');
    await expect(handler(event())).rejects.toThrow('NOTIFICATIONS_DISABLED');
    expect(spy).not.toHaveBeenCalled();
  });
  it('終端の仕事だけ成功応答にする', async () => {
    vi.spyOn(service, 'dispatchFamily').mockResolvedValue({ outcome: 'sent' });
    expect(await handler(event())).toEqual({ batchItemFailures: [] });
    expect(repo.completeRunFamily).toHaveBeenCalledWith(job, job.familyId);
  });
  it('所有中や早期配達は可視性延長と部分失敗', async () => {
    vi.spyOn(service, 'dispatchFamily').mockResolvedValue({
      outcome: 'retry',
      at: Date.now() + 5000,
    });
    const spy = vi.spyOn(queue, 'defer').mockResolvedValue();
    expect(await handler(event())).toEqual({ batchItemFailures: [{ itemIdentifier: 'message' }] });
    expect(spy).toHaveBeenCalled();
    expect(repo.completeRunFamily).not.toHaveBeenCalled();
  });
  it('送信後の保存失敗もキューに残す', async () => {
    vi.spyOn(service, 'dispatchFamily').mockRejectedValue(new Error('storage'));
    expect(await handler(event())).toEqual({ batchItemFailures: [{ itemIdentifier: 'message' }] });
  });
  it('他のキューからの入力は送信0回', async () => {
    const value = event();
    value.Records[0]!.eventSourceARN = 'other';
    const spy = vi.spyOn(service, 'dispatchFamily');
    await handler(value);
    expect(spy).not.toHaveBeenCalled();
  });
  it('不正なJSONは隔離へ残す', async () => {
    const value = event();
    value.Records[0]!.body = 'invalid';
    expect(await handler(value)).toEqual({ batchItemFailures: [{ itemIdentifier: 'message' }] });
  });
  it('月末でない21時は列挙しない', async () => {
    const spy = vi.spyOn(service, 'dispatchTrigger');
    await handler({
      operation: 'scheduled',
      kind: 'monthlySummary',
      scheduledTime: '2027-01-30T12:00:00Z',
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each(['watchdog', 'cleanup', 'backup'] as const)('%sを通知入力と分離', async (operation) => {
    const spy = vi.spyOn(ops, operation).mockResolvedValue(undefined as never);
    await handler({ operation });
    expect(spy).toHaveBeenCalled();
  });
  it('日次通知の予定時刻が不正な場合は入力の検証段階を記録する', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(
      handler({
        operation: 'scheduled',
        kind: 'dailyReminder',
        scheduledTime: 'not-a-date',
      }),
    ).rejects.toThrow('NOTIFY_ENTRY_FAILED');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'NOTIFY_ENTRY_DIAGNOSTIC',
        operation: 'scheduled',
        kind: 'dailyReminder',
        stage: 'input',
        errorCode: 'INVALID_EVENT',
      }),
    );
  });

  it('変更された予定時刻を家族ジョブに引き継ぐ', async () => {
    const scheduledTime = '2027-01-31T08:30:00Z';
    const scheduledAt = Date.parse(scheduledTime);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(scheduledAt + 899999);
    vi.spyOn(family, 'listNotificationFamilies').mockImplementation(async function* () {
      yield [job.familyId];
    });
    vi.spyOn(repo, 'beginRun').mockResolvedValue();
    vi.spyOn(repo, 'registerRunFamily').mockResolvedValue();
    vi.spyOn(repo, 'finishRunEnumeration').mockResolvedValue();
    const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue();
    const scheduled = { operation: 'scheduled', kind: job.kind, scheduledTime };
    await handler(scheduled);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith({ ...job, scheduledAt });
    expect(queue.parseJob(enqueue.mock.calls[0]![0])).toEqual({ ...job, scheduledAt });

    enqueue.mockClear();
    vi.setSystemTime(scheduledAt + 900000);
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await expect(handler(scheduled)).rejects.toThrow('NOTIFY_ENTRY_FAILED');
    expect(enqueue).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'window', errorCode: 'INACTIVE_NOTIFICATION' }),
    );
  });

  it('SSMの例外メッセージを含めず取得失敗を記録する', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const error = new Error(FAKE_U10_OPERATIONAL_SECRET);
    error.name = 'ParameterNotFound';
    vi.mocked(ops.operationalKey).mockRejectedValue(error);
    await expect(
      handler({
        operation: 'scheduled',
        kind: 'dailyReminder',
        scheduledTime: '2026-11-23T07:00:00Z',
      }),
    ).rejects.toThrow('NOTIFY_ENTRY_FAILED');
    expect(log).toHaveBeenCalledExactlyOnceWith({
      event: 'NOTIFY_ENTRY_DIAGNOSTIC',
      operation: 'scheduled',
      kind: 'dailyReminder',
      targetDate: '2026-11-23',
      stage: 'operationalKey',
      errorCode: 'ParameterNotFound',
    });
  });

  it('不正な種類を拒否', async () => {
    await expect(handler({ kind: 'push', targetDate: '2027-01-31' })).rejects.toThrow();
  });
});
