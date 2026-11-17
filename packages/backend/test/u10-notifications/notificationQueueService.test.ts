import { beforeEach, describe, it, expect } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { parseJob, enqueue, defer } from '../../src/services/notificationQueueService';
import { job } from './helpers/workflow';
const sqs = mockClient(SQSClient);
beforeEach(() => {
  sqs.reset();
  process.env.NOTIFICATION_QUEUE_URL = 'queue';
});
describe('通知のキュー', () => {
  it('本文や送信先を仕事に含めない', async () => {
    sqs.on(SendMessageCommand).resolves({});
    await enqueue(job);
    expect(JSON.parse(sqs.commandCalls(SendMessageCommand)[0]!.args[0].input.MessageBody!)).toEqual(
      job,
    );
  });
  it.each([{}, null, { ...job, text: 'private' }, { ...job, familyId: 'invalid' }])(
    '不正な仕事を拒否',
    (input) => {
      expect(() => parseJob(input)).toThrow();
    },
  );
  it('正しい仕事を読む', () => {
    expect(parseJob(job)).toEqual(job);
  });
  it('既知の待ち時刻まで可視性を延ばす', async () => {
    sqs.on(ChangeMessageVisibilityCommand).resolves({});
    await defer('receipt', 5500, 0);
    expect(
      sqs.commandCalls(ChangeMessageVisibilityCommand)[0]!.args[0].input.VisibilityTimeout,
    ).toBe(6);
  });
  it('キューへの保存失敗を知らせる', async () => {
    sqs.on(SendMessageCommand).rejects(new Error('offline'));
    await expect(enqueue(job)).rejects.toThrow();
  });
});
