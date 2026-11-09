import { describe, expect, it } from 'vitest';
import {
  MIN_CONTRAST_RATIO,
  MIN_TOUCH_TARGET_PX,
  colors,
  textBackgroundPairs,
  theme,
} from '../../src/theme';

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('テーマ（U6。記録の色と押す場所。NFR9.7）', () => {
  it('「やった」ボタンの文字と背景の色の差が 4.5:1 以上', () => {
    expect(contrastRatio(colors.recordButtonText, colors.recordButton)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO,
    );
  });

  it('確認ダイアログの文字とダイアログの背景の色の差が 4.5:1 以上', () => {
    expect(contrastRatio(colors.dialogText, colors.dialogBackground)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO,
    );
  });

  it.each(['「やった」ボタン', '確認ダイアログ'])(
    '「%s」の色の組が確かめの対象に入っている（U6）',
    (label) => {
      expect(textBackgroundPairs.some(([name]) => name.includes(label))).toBe(true);
    },
  );

  it('記録のエラーの文字（error.main）と紙の背景の色の差が 4.5:1 以上', () => {
    expect(contrastRatio(colors.errorMain, colors.backgroundPaper)).toBeGreaterThanOrEqual(
      MIN_CONTRAST_RATIO,
    );
  });

  it('「やった」ボタン（MUI の Button）の押す場所が 44×44 px 以上', () => {
    const root = theme.components?.MuiButton?.styleOverrides?.root as Record<string, number>;
    expect(root.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(root.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
});
