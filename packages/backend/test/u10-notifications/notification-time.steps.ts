import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { parseTrigger, notificationWindow } from '../../src/services/notificationTime';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-time.feature',
);
describeFeature(feature, ({ Scenario }) => {
  Scenario('予定の日と有効期間だけを受け付ける', ({ Given, When, Then }) => {
    Given('日次16時と月末21時の予定がある', () => undefined);
    When('予定前と15分の境界を調べる', () => undefined);
    Then('日本時間の月末と期限が守られる', () => {
      const daily = parseTrigger({ kind: 'dailyReminder', targetDate: '2028-02-29' });
      expect(notificationWindow(daily, new Date('2028-02-29T06:59:59Z')).status).toBe('early');
      expect(notificationWindow(daily, new Date('2028-02-29T07:00:00Z')).status).toBe('active');
      expect(notificationWindow(daily, new Date('2028-02-29T07:15:00Z')).status).toBe('expired');
      expect(() =>
        parseTrigger({ kind: 'monthlySummary', targetDate: '2027-02-28' }),
      ).not.toThrow();
      expect(() => parseTrigger({ kind: 'monthlySummary', targetDate: '2028-02-28' })).toThrow();
      expect(() => parseTrigger({ kind: 'dailyReminder', targetDate: '2027-02-29' })).toThrow();
      expect(() =>
        parseTrigger({ kind: 'dailyReminder', targetDate: '2027-12-31', familyId: 'outside' }),
      ).toThrow();
    });
  });
});
