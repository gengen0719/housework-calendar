import { vi } from 'vitest';
import { ok, err } from '@housework/shared';
import type { NotificationDispatch, NotificationPayload } from '../../../src/models';
import * as store from '../../../src/repositories/notificationRepository';
import * as payloads from '../../../src/repositories/notificationPayloadRepository';
import * as family from '../../../src/services/familyMemberService';
import * as calendar from '../../../src/services/calendarService';
import * as content from '../../../src/services/notificationMessages';
import * as push from '../../../src/services/notificationPushService';
import * as alerts from '../../../src/services/operationalAlertService';
import {
  FAKE_U10_FAMILY_ID,
  FAKE_U10_GROUP_ID,
  FAKE_U10_OPERATIONAL_SECRET,
} from '../../fixtures/fakeSecrets';
export const job = {
  familyId: FAKE_U10_FAMILY_ID,
  kind: 'dailyReminder' as const,
  targetDate: '2027-01-31',
};
export function workflow() {
  const records = new Map<string, NotificationDispatch>();
  const bodies = new Map<string, NotificationPayload>();
  const accepted = new Set<string>();
  let now = Date.parse('2027-01-31T07:00:00Z');
  let failSent = false;
  vi.spyOn(store, 'getDispatch').mockImplementation(async (id) => {
    const r = records.get(id);
    return r ? { ...r } : undefined;
  });
  vi.spyOn(store, 'createDispatch').mockImplementation(async (r, p) => {
    if (records.has(r.familyId)) return false;
    records.set(r.familyId, { ...r });
    if (p) bodies.set(r.retryKey, { ...p });
    return true;
  });
  vi.spyOn(store, 'replaceDispatch').mockImplementation(async (before, after) => {
    const r = records.get(before.familyId);
    if (
      !r ||
      r.version !== before.version ||
      r.state !== before.state ||
      r.leaseOwner !== before.leaseOwner ||
      store.terminal(r.state)
    )
      return undefined;
    if (failSent && after.state === 'sent') {
      failSent = false;
      throw new Error('save failed after acceptance');
    }
    const next = { ...after, version: before.version + 1 };
    records.set(r.familyId, next);
    if (store.terminal(next.state)) bodies.delete(next.retryKey);
    return { ...next };
  });
  vi.spyOn(payloads, 'getPayload').mockImplementation(async (_date, key, time) => {
    const p = bodies.get(key);
    return p && time < p.scheduledAt + 86400000 ? { ...p } : undefined;
  });
  const group = vi.spyOn(family, 'getNotificationGroup').mockResolvedValue(ok(FAKE_U10_GROUP_ID));
  const confirmed = vi.spyOn(calendar, 'isMonthConfirmed').mockResolvedValue(false);
  const prepare = vi.spyOn(content, 'prepareContent').mockResolvedValue({ text: '固定した本文' });
  const provider = vi
    .spyOn(push, 'pushNotification')
    .mockImplementation(async (_dest, _text, key) => {
      accepted.add(key);
      return { accepted: true };
    });
  const alert = vi.spyOn(alerts, 'operationalAlert').mockResolvedValue();
  return {
    records,
    bodies,
    accepted,
    group,
    confirmed,
    prepare,
    provider,
    alert,
    options: {
      env: 'staging',
      operationalKey: FAKE_U10_OPERATIONAL_SECRET,
      now: () => now,
      random: () => 0,
    },
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (value: number) => {
      now = value;
    },
    failNextSent: () => {
      failSent = true;
    },
    unregister: () => group.mockResolvedValue(err('NOTIFICATION_GROUP_NOT_REGISTERED')),
  };
}
