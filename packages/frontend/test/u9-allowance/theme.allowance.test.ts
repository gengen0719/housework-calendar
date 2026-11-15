import { describe, expect, it } from 'vitest';
import { colors, theme, MIN_TOUCH_TARGET_PX } from '../../src/theme';
const luminance = (hex: string) => {
  const rgb = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
};
describe('S5の見やすさ', () => {
  it.each([colors.backgroundPaper, colors.backgroundDefault])(
    '本文と背景 %s の差は4.5以上',
    (bg) => {
      expect(contrast(colors.textPrimary, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each([colors.backgroundPaper, colors.backgroundDefault])(
    '自分の緑の枠と背景 %s の差は3以上',
    (bg) => {
      expect(contrast(colors.primaryMain, bg)).toBeGreaterThanOrEqual(3);
    },
  );
  it('補助の文字も紙に対して4.5以上', () => {
    expect(contrast(colors.textSecondary, colors.backgroundPaper)).toBeGreaterThanOrEqual(4.5);
  });
  it('ボタンは44ピクセル以上', () => {
    const root = theme.components!.MuiButton!.styleOverrides!.root as {
      minWidth: number;
      minHeight: number;
    };
    expect(root.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    expect(root.minHeight).toBeGreaterThanOrEqual(44);
  });
});
