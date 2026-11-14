import { describe, expect, it } from 'vitest';
import { formatYen } from '../../src/index';

describe('共有パッケージ: U9 の金額の表示 formatYen（BR10.5、NFR4.91）', () => {
  it('桁区切りをつけて「円」を後ろに付ける', () => {
    expect(formatYen(1400)).toBe('1,400円');
    expect(formatYen(100)).toBe('100円');
    expect(formatYen(1234567)).toBe('1,234,567円');
  });

  it('0 円は「0円」と出す', () => {
    expect(formatYen(0)).toBe('0円');
  });

  it('マイナスは半角のハイフンで出し、0 円にそろえない', () => {
    expect(formatYen(-200)).toBe('-200円');
    expect(formatYen(-1200)).toBe('-1,200円');
    expect(formatYen(-200)).not.toContain('\u2212');
  });

  it('大きい数（安全な整数の最大）も桁区切りで出す', () => {
    expect(formatYen(Number.MAX_SAFE_INTEGER)).toBe('9,007,199,254,740,991円');
    expect(formatYen(-Number.MAX_SAFE_INTEGER)).toBe('-9,007,199,254,740,991円');
  });

  it('小数・NaN・Infinity は整数ではないので受け付けない（実行時の確認）', () => {
    expect(() => formatYen(1.5)).toThrow(RangeError);
    expect(() => formatYen(Number.NaN)).toThrow(RangeError);
    expect(() => formatYen(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => formatYen(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });

  it('文字列は型で受け付けない（型の確認）', () => {
    // @ts-expect-error 金額は number だけ
    expect(() => formatYen('100')).toThrow(RangeError);
  });

  it('-0 は「0円」と出す（「-0円」にしない）', () => {
    expect(formatYen(-0)).toBe('0円');
  });
});
