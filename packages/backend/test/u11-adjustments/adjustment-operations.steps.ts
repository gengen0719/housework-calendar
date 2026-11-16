import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { handler } from '../../src/entries/notify';
import * as ops from '../../src/services/notificationMaintenanceService';
import * as notify from '../../src/services/notificationService';
import * as alerts from '../../src/services/operationalAlertService';
const feature = await loadFeature(
  'packages/backend/test/u11-adjustments/adjustment-operations.feature',
);
let calls = { backup: 0, family: 0, trigger: 0 };
function captureCalls() {
  calls = {
    backup: vi.mocked(ops.backup).mock.calls.length,
    family: vi.mocked(notify.dispatchFamily).mock.calls.length,
    trigger: vi.mocked(notify.dispatchTrigger).mock.calls.length,
  };
}
describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    process.env.NOTIFICATIONS_ENABLED = 'false';
    process.env.BACKUPS_ENABLED = 'true';
    vi.spyOn(ops, 'backup').mockResolvedValue();
    vi.spyOn(notify, 'dispatchFamily');
    vi.spyOn(notify, 'dispatchTrigger');
    vi.spyOn(alerts, 'operationalAlert').mockResolvedValue();
  });
  AfterEachScenario(() => {
    delete process.env.NOTIFICATIONS_ENABLED;
    delete process.env.BACKUPS_ENABLED;
    vi.restoreAllMocks();
  });
  const given = () => undefined;
  Scenario('通知無効でもバックアップだけ有効にできる', ({ Given, When, Then }) => {
    Given('通知は無効でバックアップだけ有効である', given);
    When('バックアップの起動を受ける', async () => {
      await handler({ operation: 'backup' });
      captureCalls();
    });
    Then('バックアップだけを実行する', () => {
      expect(calls).toEqual({ backup: 1, family: 0, trigger: 0 });
    });
  });
  Scenario('通知起動とSQSは拒否する', ({ Given, When, Then }) => {
    Given('通知は無効でバックアップだけ有効である', given);
    When('日次通知とSQSの起動を受ける', async () => {
      await expect(
        handler({
          operation: 'scheduled',
          kind: 'dailyReminder',
          scheduledTime: '2027-01-31T07:00:00Z',
        }),
      ).rejects.toThrow('NOTIFICATIONS_DISABLED');
      await expect(handler({ Records: [] })).rejects.toThrow('NOTIFICATIONS_DISABLED');
      captureCalls();
    });
    Then('外向きの送信は始めない', () => {
      expect(calls.family).toBe(0);
      expect(calls.trigger).toBe(0);
    });
  });
});
