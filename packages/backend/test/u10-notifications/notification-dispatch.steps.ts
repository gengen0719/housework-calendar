import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { dispatchFamily } from '../../src/services/notificationService';
import { workflow, job } from './helpers/workflow';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-dispatch.feature',
);
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });
  Scenario('受理後の保存失敗から同じキーで復旧する', ({ Given, When, Then }) => {
    Given('外部サービスが受理した直後に保存が失敗する', () => undefined);
    When('所有期限が過ぎて同じ仕事が配達される', () => undefined);
    Then('同じ本文とキーで照合して受理は一度だけになる', async () => {
      const w = workflow();
      w.failNextSent();
      await expect(dispatchFamily(job, w.options)).rejects.toThrow();
      w.advance(45001);
      expect(await dispatchFamily(job, w.options)).toEqual({ outcome: 'sent' });
      expect(w.accepted.size).toBe(1);
      expect(w.provider.mock.calls[0]).toEqual(w.provider.mock.calls[1]);
      expect(w.bodies.size).toBe(0);
    });
  });
  Scenario('早期配達と既知失敗で仕事を消さない', ({ Given, When, Then }) => {
    Given('一時的な失敗のあと再配達を待つ', () => undefined);
    When('早く届いた仕事と再試行時刻の仕事を処理する', () => undefined);
    Then('所有権を解放して正しい時刻まで仕事を残す', async () => {
      const w = workflow();
      w.provider.mockResolvedValueOnce({
        accepted: false,
        retryable: true,
        reason: 'rateLimit',
        ambiguous: false,
      });
      expect((await dispatchFamily(job, w.options)).outcome).toBe('retry');
      expect(w.records.get(job.familyId)?.leaseOwner).toBeUndefined();
      expect((await dispatchFamily(job, w.options)).outcome).toBe('retry');
      expect(w.provider).toHaveBeenCalledTimes(1);
      w.advance(5000);
      expect((await dispatchFamily(job, w.options)).outcome).toBe('sent');
    });
  });
});
