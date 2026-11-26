import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { buildDailyMessage } from '../../src/services/notificationMessages';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-content.feature',
);
describeFeature(feature, ({ Scenario }) =>
  Scenario('状態を省かず一通へまとめる', ({ Given, When, Then, And }) => {
    const liffUrl = 'https://example.com/app';
    let text: string;
    Given('未と済とやらなかった担当がある', () => undefined);
    When('当日一覧を組み立てる', () => {
      text = buildDailyMessage(
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
        liffUrl,
      );
    });
    Then('三つの状態が残り名前の改行は整う', () => {
      expect(text).toContain('皿 洗い・太郎・未');
      expect(text).toContain('風呂・花子・済');
      expect(text).toContain('掃除・次郎・×');
    });
    And('通知の末尾にアプリを開くURLが付く', () => {
      expect(text.split('\n').at(-1)).toBe(liffUrl);
    });
  }),
);
