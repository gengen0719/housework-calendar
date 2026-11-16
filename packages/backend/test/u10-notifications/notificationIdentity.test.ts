import { describe, expect, it } from 'vitest';
import { notificationKey, familyRef } from '../../src/services/notificationIdentity';
import {
  FAKE_U10_FAMILY_ID,
  FAKE_U10_OTHER_FAMILY_ID,
  FAKE_U10_OPERATIONAL_SECRET,
} from '../fixtures/fakeSecrets';
const trigger = { kind: 'dailyReminder' as const, targetDate: '2027-01-31' };
describe('通知の一意性と運用識別', () => {
  it('同じ通知で同じUUIDになる', () => {
    expect(notificationKey('staging', FAKE_U10_FAMILY_ID, trigger)).toBe(
      notificationKey('staging', FAKE_U10_FAMILY_ID, trigger),
    );
  });
  it('UUIDの形式を満たす', () => {
    expect(notificationKey('staging', FAKE_U10_FAMILY_ID, trigger)).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-5[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
  });
  it('家族が違えば別のキー', () => {
    expect(notificationKey('staging', FAKE_U10_FAMILY_ID, trigger)).not.toBe(
      notificationKey('staging', FAKE_U10_OTHER_FAMILY_ID, trigger),
    );
  });
  it('環境が違えば別のキー', () => {
    expect(notificationKey('production', FAKE_U10_FAMILY_ID, trigger)).not.toBe(
      notificationKey('staging', FAKE_U10_FAMILY_ID, trigger),
    );
  });
  it('種類と日付を区別', () => {
    const key = notificationKey('staging', FAKE_U10_FAMILY_ID, trigger);
    expect(
      notificationKey('staging', FAKE_U10_FAMILY_ID, { ...trigger, kind: 'monthlySummary' }),
    ).not.toBe(key);
    expect(
      notificationKey('staging', FAKE_U10_FAMILY_ID, { ...trigger, targetDate: '2027-02-01' }),
    ).not.toBe(key);
  });
  it('運用識別は通知のキーと違い鍵を要する', () => {
    expect(familyRef(FAKE_U10_FAMILY_ID, FAKE_U10_OPERATIONAL_SECRET)).not.toContain(
      FAKE_U10_FAMILY_ID,
    );
    expect(() => familyRef(FAKE_U10_FAMILY_ID, '')).toThrow();
  });
});
