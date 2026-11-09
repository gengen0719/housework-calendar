import { describe, expect, it } from 'vitest';
import {
  datesOfMonth,
  isEditableMonth,
  jstDateOf,
  monthOfDate,
  parseMonth,
  shiftMonth,
  weekdayOf,
} from '../../src/index';

describe('共有パッケージ: 日本時間の日付（NFR11.4、NFR8.10）', () => {
  it('UTC の 15:00 の 1 ミリ秒前までは同じ日、ちょうどで日本時間の翌日になる', () => {
    expect(jstDateOf(new Date('2027-01-01T14:59:59.999Z'))).toBe('2027-01-01');
    expect(jstDateOf(new Date('2027-01-01T15:00:00.000Z'))).toBe('2027-01-02');
  });

  it('年の終わりと月の終わりをまたぐ', () => {
    expect(jstDateOf(new Date('2026-12-31T15:00:00.000Z'))).toBe('2027-01-01');
    expect(jstDateOf(new Date('2028-02-28T15:00:00.000Z'))).toBe('2028-02-29');
    expect(jstDateOf(new Date('2028-02-29T15:00:00.000Z'))).toBe('2028-03-01');
  });

  it('2028 年の 2 月は 29 日、2027 年の 2 月は 28 日、30 日の月と 31 日の月がある', () => {
    expect(datesOfMonth('2028-02')).toHaveLength(29);
    expect(datesOfMonth('2027-02')).toHaveLength(28);
    expect(datesOfMonth('2027-04')).toHaveLength(30);
    expect(datesOfMonth('2027-01')).toHaveLength(31);
  });

  it('datesOfMonth は 1 日から月末まで、日付の順に並ぶ', () => {
    const dates = datesOfMonth('2027-02');
    expect(dates[0]).toBe('2027-02-01');
    expect(dates[dates.length - 1]).toBe('2027-02-28');
    expect([...dates].sort()).toEqual(dates);
  });

  it('12 月の次は翌年 1 月、1 月の前は前年 12 月', () => {
    expect(shiftMonth('2027-12', 1)).toBe('2028-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2027-05', 0)).toBe('2027-05');
    expect(shiftMonth('2027-05', 14)).toBe('2028-07');
  });

  it('parseMonth は 2000-01 と 2100-12 を通す', () => {
    expect(parseMonth('2000-01')).toEqual({ year: 2000, month: 1 });
    expect(parseMonth('2100-12')).toEqual({ year: 2100, month: 12 });
    expect(parseMonth('2027-09')).toEqual({ year: 2027, month: 9 });
  });

  it('parseMonth は形の違う月と範囲の外を断る', () => {
    for (const bad of [
      '2027-13',
      '2027-00',
      '2027-1',
      '0050-01',
      '2101-01',
      '1999-12',
      'abc',
      '',
    ]) {
      expect(parseMonth(bad)).toBeNull();
    }
    expect(parseMonth(' 2027-01')).toBeNull();
    expect(parseMonth('2027-01-01')).toBeNull();
  });

  it('weekdayOf は日曜 0 から土曜 6', () => {
    expect(weekdayOf('2027-01-03')).toBe(0);
    expect(weekdayOf('2027-01-04')).toBe(1);
    expect(weekdayOf('2027-01-09')).toBe(6);
    expect(weekdayOf('2028-02-29')).toBe(2);
  });

  it('monthOfDate は日付の月を返す', () => {
    expect(monthOfDate('2027-01-31')).toBe('2027-01');
  });

  it('今月と来月だけ入力できる。12 月の来月は翌年 1 月', () => {
    expect(isEditableMonth('2027-01', '2027-01-15')).toBe(true);
    expect(isEditableMonth('2027-02', '2027-01-15')).toBe(true);
    expect(isEditableMonth('2026-12', '2027-01-15')).toBe(false);
    expect(isEditableMonth('2027-03', '2027-01-15')).toBe(false);
    expect(isEditableMonth('2028-01', '2027-12-31')).toBe(true);
    expect(isEditableMonth('2027-12', '2027-12-31')).toBe(true);
    expect(isEditableMonth('2028-02', '2027-12-31')).toBe(false);
  });
});
