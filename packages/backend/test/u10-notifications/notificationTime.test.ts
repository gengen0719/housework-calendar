import { describe, expect, it } from 'vitest';
import {
  parseTrigger,
  notificationWindow,
  fromScheduledTime,
} from '../../src/services/notificationTime';
describe('通知の時刻', () => {
  it.each(['2027-01-31', '2027-04-30', '2027-02-28', '2028-02-29', '2027-12-31'])(
    '月末%sを受け付ける',
    (targetDate) => {
      expect(parseTrigger({ kind: 'monthlySummary', targetDate })).toEqual({
        kind: 'monthlySummary',
        targetDate,
      });
    },
  );
  it.each([
    '2027-01-30',
    '2027-04-29',
    '2028-02-28',
    '2027-12-30',
    '2027-02-29',
    '2027-13-01',
    'abc',
  ])('不正な月末%sを拒否', (targetDate) => {
    expect(() => parseTrigger({ kind: 'monthlySummary', targetDate })).toThrow();
  });
  it.each([-1, 0, 1, 899999, 900000, 900001])('予定との差%sミリ秒を分類', (offset) => {
    const t = parseTrigger({ kind: 'dailyReminder', targetDate: '2027-01-31' });
    const start = Date.parse('2027-01-31T07:00:00Z');
    expect(notificationWindow(t, new Date(start + offset)).status).toBe(
      offset < 0 ? 'early' : offset >= 900000 ? 'expired' : 'active',
    );
  });
  it('月末21時は日本時間の日付で解く', () => {
    expect(fromScheduledTime('monthlySummary', '2027-12-31T12:00:00Z')).toEqual({
      kind: 'monthlySummary',
      targetDate: '2027-12-31',
      scheduledAt: Date.parse('2027-12-31T12:00:00Z'),
    });
  });
  it('非月末21時は正常省略', () => {
    expect(fromScheduledTime('monthlySummary', '2027-12-30T12:00:00Z')).toBeUndefined();
  });
  it.each([-1, 0, 899999, 900000])('変更後の予定時刻との差%sミリ秒を分類', (offset) => {
    const scheduledTime = '2027-01-30T15:30:00Z';
    const scheduledAt = Date.parse(scheduledTime);
    const trigger = fromScheduledTime('dailyReminder', scheduledTime)!;
    expect(trigger.targetDate).toBe('2027-01-31');
    expect(notificationWindow(trigger, new Date(scheduledAt + offset))).toEqual({
      scheduledAt,
      expiresAt: scheduledAt + 900000,
      status: offset < 0 ? 'early' : offset >= 900000 ? 'expired' : 'active',
    });
  });
  it.each([
    null,
    {},
    { kind: 'backup', targetDate: '2027-01-31' },
    { kind: 'dailyReminder', targetDate: 3 },
  ])('不正な形を拒否', (value) => {
    expect(() => parseTrigger(value)).toThrow();
  });
});
