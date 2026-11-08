import { describe, expect, it } from 'vitest';
import {
  MIN_CONTRAST_RATIO,
  MIN_TOUCH_TARGET_PX,
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

describe('テーマ（NFR9.1）', () => {
  it('色の差の計算が WCAG の既知の値と合う（黒と白は 21:1）', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(MIN_CONTRAST_RATIO);
  });

  it.each(textBackgroundPairs)(
    '文字と背景の色の差が 4.5:1 以上: %s',
    (_label, text, background) => {
      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
    },
  );

  it('テーマの文字・背景・主な色・エラーの色が、確かめた組と同じ値を使っている', () => {
    const { palette } = theme;
    const used = new Set(textBackgroundPairs.flatMap(([, a, b]) => [a, b]));
    for (const color of [
      palette.text.primary,
      palette.text.secondary,
      palette.background.default,
      palette.background.paper,
      palette.primary.main,
      palette.primary.contrastText,
      palette.error.main,
    ]) {
      expect(used.has(color)).toBe(true);
    }
  });

  it('ボタンの押す場所が 44×44 px 以上', () => {
    const button = theme.components?.MuiButton?.styleOverrides?.root as Record<string, number>;
    const iconButton = theme.components?.MuiIconButton?.styleOverrides?.root as Record<
      string,
      number
    >;
    for (const root of [button, iconButton]) {
      expect(root.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      expect(root.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });
});
