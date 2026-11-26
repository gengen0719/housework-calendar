import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { buildDailyMessage } from '../../src/services/notificationMessages';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-content.feature',
);
describeFeature(feature, ({ Scenario }) =>
  Scenario('状態を省かず一通へまとめる', ({ Given, When, Then }) => {
    Given('未と済とやらなかった担当がある', () => undefined);
    When('当日一覧を組み立てる', () => undefined);
    Then('三つの状態が残り名前の改行は整う', () => {
      const text = buildDailyMessage(
        '2027-01-31',
        [
          {
            dutyId: 'a',
            choreTypeId: 'a',
            choreName: '皿\n洗い',
            displayName: '太郎',
            status: 'todo',
          },
          { dutyId: 'b', choreTypeId: 'b', choreName: '風呂', displayName: '花子', status: 'done' },
          {
            dutyId: 'c',
            choreTypeId: 'c',
            choreName: '掃除',
            displayName: '次郎',
            status: 'skipped',
          },
        ],
        'https://example.com/app',
      );
      expect(text).toContain('皿 洗い・太郎・未');
      expect(text).toContain('風呂・花子・済');
      expect(text).toContain('掃除・次郎・×');
    });
  }),
);
