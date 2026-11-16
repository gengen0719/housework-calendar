import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@housework/shared';
import { dispatchFamily } from '../../src/services/notificationService';
import { workflow, job } from './helpers/workflow';
import { FAKE_U10_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
afterEach(() => vi.restoreAllMocks());
describe('家族ごとの配信', () => {
  it('一度送った通知は再生成も再送もしない', async () => {
    const w = workflow();
    expect((await dispatchFamily(job, w.options)).outcome).toBe('sent');
    expect((await dispatchFamily(job, w.options)).outcome).toBe('duplicate');
    expect(w.provider).toHaveBeenCalledTimes(1);
    expect(w.prepare).toHaveBeenCalledTimes(1);
  });
  it('共有AC1.2.4 お知らせ先なしは外部送信0回', async () => {
    const w = workflow();
    w.unregister();
    expect(await dispatchFamily(job, w.options)).toEqual({ outcome: 'skipped' });
    expect(w.provider).not.toHaveBeenCalled();
    expect(w.alert).not.toHaveBeenCalled();
  });
  it.each(['confirmed', 'empty'] as const)('%sは正常省略', async (reason) => {
    const w = workflow();
    w.prepare.mockResolvedValue({ reason });
    expect((await dispatchFamily(job, w.options)).outcome).toBe('skipped');
    expect(w.provider).not.toHaveBeenCalled();
    expect(w.alert).not.toHaveBeenCalled();
  });
  it('初回直前の確定で止まる', async () => {
    const w = workflow();
    w.confirmed.mockResolvedValue(true);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('skipped');
    expect(w.provider).not.toHaveBeenCalled();
  });
  it('一時失敗は最大3試行で止める', async () => {
    const w = workflow();
    w.provider.mockResolvedValue({
      accepted: false,
      retryable: true,
      reason: 'server',
      ambiguous: true,
    });
    await dispatchFamily(job, w.options);
    w.advance(5000);
    await dispatchFamily(job, w.options);
    w.advance(20000);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('failed');
    expect(w.provider).toHaveBeenCalledTimes(3);
    expect(w.bodies.size).toBe(0);
  });
  it('恒久失敗は再試行せずその場で知らせる', async () => {
    const w = workflow();
    w.provider.mockResolvedValue({
      accepted: false,
      retryable: false,
      reason: 'permanent',
      ambiguous: false,
    });
    expect((await dispatchFamily(job, w.options)).outcome).toBe('failed');
    expect(w.alert).toHaveBeenCalledTimes(1);
  });
  it('所有中の重複は仕事を残す', async () => {
    const w = workflow();
    w.failNextSent();
    await expect(dispatchFamily(job, w.options)).rejects.toThrow();
    expect((await dispatchFamily(job, w.options)).outcome).toBe('retry');
    expect(w.provider).toHaveBeenCalledTimes(1);
  });
  it('宛先変更後は別グループに複製しない', async () => {
    const w = workflow();
    w.provider.mockResolvedValueOnce({
      accepted: false,
      retryable: true,
      reason: 'connection',
      ambiguous: true,
    });
    await dispatchFamily(job, w.options);
    w.group.mockResolvedValue(ok(FAKE_U10_OTHER_FAMILY_ID));
    w.advance(5000);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('failed');
    expect(w.provider).toHaveBeenCalledTimes(1);
  });
  it('期限後に送らない', async () => {
    const w = workflow();
    w.advance(900000);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('expired');
    expect(w.provider).not.toHaveBeenCalled();
  });
  it('期限まで5秒未満なら送らない', async () => {
    const w = workflow();
    w.advance(895001);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('expired');
    expect(w.provider).not.toHaveBeenCalled();
  });
  it('読込失敗で一部だけを送らない', async () => {
    const w = workflow();
    w.prepare.mockRejectedValue(new Error('private body'));
    await expect(dispatchFamily(job, w.options)).rejects.toThrow('NOTIFICATION_FAILED');
    expect(w.provider).not.toHaveBeenCalled();
    expect(JSON.stringify(w.alert.mock.calls)).not.toContain('private body');
  });
  it('保存した本文を失っても作り直さない', async () => {
    const w = workflow();
    w.provider.mockResolvedValueOnce({
      accepted: false,
      retryable: true,
      reason: 'rateLimit',
      ambiguous: false,
    });
    await dispatchFamily(job, w.options);
    w.advance(5000);
    w.bodies.clear();
    expect((await dispatchFamily(job, w.options)).outcome).toBe('failed');
    expect(w.prepare).toHaveBeenCalledTimes(1);
  });
});
