import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import * as line from '../../src/services/lineApiService';
import { pushNotification } from '../../src/services/notificationPushService';
import {
  FAKE_U10_GROUP_ID,
  FAKE_U10_RETRY_KEY,
  FAKE_U10_REQUEST_ID,
} from '../fixtures/fakeSecrets';
const feature = await loadFeature(
  'packages/backend/test/u10-notifications/notification-push.feature',
);
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    vi.restoreAllMocks();
  });
  Scenario('409だけでは受理済みとしない', ({ Given, When, Then }) => {
    Given('外部配信が409を返す', () => undefined);
    When('受理済み要求識別子の有無を比べる', () => undefined);
    Then('識別子がある同じキーだけ成功とする', async () => {
      const call = vi
        .spyOn(line, 'callLine')
        .mockResolvedValueOnce(new Response('', { status: 409 }))
        .mockResolvedValueOnce(
          new Response('', {
            status: 409,
            headers: { 'x-line-accepted-request-id': FAKE_U10_REQUEST_ID },
          }),
        );
      expect((await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).accepted).toBe(
        false,
      );
      expect((await pushNotification(FAKE_U10_GROUP_ID, '本文', FAKE_U10_RETRY_KEY)).accepted).toBe(
        true,
      );
      expect(call.mock.calls[1]?.[1].headers).toEqual({ 'X-Line-Retry-Key': FAKE_U10_RETRY_KEY });
    });
  });
});
