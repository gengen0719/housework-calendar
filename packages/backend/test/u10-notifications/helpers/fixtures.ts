import type { NotificationDispatch } from '../../../src/models';
import { FAKE_U10_FAMILY_ID, FAKE_U10_RETRY_KEY } from '../../fixtures/fakeSecrets';
export function dispatchFixture(over: Partial<NotificationDispatch> = {}): NotificationDispatch {
  return {
    familyId: FAKE_U10_FAMILY_ID,
    kind: 'dailyReminder',
    targetDate: '2027-01-31',
    scheduledAt: 1801378800000,
    expiresAt: 1801379700000,
    state: 'prepared',
    version: 0,
    attempts: 0,
    retryKey: FAKE_U10_RETRY_KEY,
    ...over,
  };
}
