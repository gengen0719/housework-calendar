import { describe, expect, it } from 'vitest';
import { deriveRange } from '../../src/services/allowanceService';

describe('deriveRange（BR10.8、NFR11.10）', () => {
  it('作成が UTC 15:00 より前なら同じ日、15:00 以降なら日本時間では翌日になる', () => {
    expect(deriveRange('2026-11-30T14:59:59.999Z', '2027-01-20').firstMonth).toBe('2026-11');
    expect(deriveRange('2026-11-30T15:00:00.000Z', '2027-01-20').firstMonth).toBe('2026-12');
  });

  it('月末の作成も日本時間で月が決まる（UTC では 1 月 31 日でも日本時間では 2 月）', () => {
    expect(deriveRange('2027-01-31T15:00:00.000Z', '2027-02-10').firstMonth).toBe('2027-02');
    expect(deriveRange('2027-01-31T14:59:00.000Z', '2027-02-10').firstMonth).toBe('2027-01');
  });

  it('年またぎ（UTC の 12 月 31 日 15:00 は日本時間の 1 月 1 日）', () => {
    expect(deriveRange('2026-12-31T15:00:00.000Z', '2027-01-01').firstMonth).toBe('2027-01');
    expect(deriveRange('2026-12-31T14:59:59.000Z', '2027-01-01').firstMonth).toBe('2026-12');
  });

  it('うるう年の 2 月末でも月がずれない', () => {
    expect(deriveRange('2028-02-29T03:00:00.000Z', '2028-02-29')).toEqual({
      firstMonth: '2028-02',
      lastMonth: '2028-03',
    });
    expect(deriveRange('2028-02-29T15:00:00.000Z', '2028-03-01').firstMonth).toBe('2028-03');
  });

  it('lastMonth は今日の月の翌月、今日が 12 月なら翌年 1 月', () => {
    expect(deriveRange('2026-11-01T00:00:00.000Z', '2027-01-20').lastMonth).toBe('2027-02');
    expect(deriveRange('2026-11-01T00:00:00.000Z', '2026-12-31').lastMonth).toBe('2027-01');
  });

  it('firstMonth は今日の月と同じでもよい（作った月に開く）', () => {
    expect(deriveRange('2027-01-20T00:00:00.000Z', '2027-01-20')).toEqual({
      firstMonth: '2027-01',
      lastMonth: '2027-02',
    });
  });

  it('時計を使わない（同じ入力は、いつ呼んでも同じ）', () => {
    const first = deriveRange('2026-11-01T00:00:00.000Z', '2027-01-20');
    const second = deriveRange('2026-11-01T00:00:00.000Z', '2027-01-20');
    expect(second).toEqual(first);
  });
});
