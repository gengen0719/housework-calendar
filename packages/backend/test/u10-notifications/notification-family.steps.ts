import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import * as repository from '../../src/repositories/familyRepository';
import { listNotificationFamilies } from '../../src/services/familyMemberService';
import { FAKE_U10_FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-family.feature',
);
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });
  Scenario('ページとその日の全担当を読む', ({ Given, When, Then }) => {
    Given('家族の一覧が二ページある', () => undefined);
    When('通知用の窓口を呼ぶ', () => undefined);
    Then('家族の続きと担当の範囲が守られる', async () => {
      vi.spyOn(repository, 'listNotificationFamilies')
        .mockResolvedValueOnce({
          familyIds: [FAKE_U10_FAMILY_ID],
          cursor: { familyId: FAKE_U10_FAMILY_ID },
        })
        .mockResolvedValueOnce({ familyIds: [FAKE_U10_OTHER_FAMILY_ID] });
      const ids: string[] = [];
      for await (const page of listNotificationFamilies()) ids.push(...page);
      expect(ids).toEqual([FAKE_U10_FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID]);
    });
  });
});
