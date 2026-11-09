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

  // U5（NFR9.5）: 全画面の色の組と押す場所
  it.each(['済', '未', '×', '確定済み', '無効のボタン', 'リンク', '入力欄の枠', '今日の印'])(
    '「%s」の色の組が確かめの対象に入っている（U5）',
    (label) => {
      expect(textBackgroundPairs.some(([name]) => name.includes(label))).toBe(true);
    },
  );

  it('色の組はどれも文字・背景とも 6 桁の色で書かれている（U5）', () => {
    for (const [, text, background] of textBackgroundPairs) {
      expect(text).toMatch(/^#[0-9a-f]{6}$/);
      expect(background).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('ボタン・リストの行・アイコンボタン・チェックボックス・メニューの項目の押す場所が 44×44 px 以上（U5）', () => {
    const components = theme.components as Record<
      string,
      { styleOverrides?: { root?: Record<string, number> } } | undefined
    >;
    for (const name of [
      'MuiButton',
      'MuiListItemButton',
      'MuiIconButton',
      'MuiCheckbox',
      'MuiMenuItem',
    ]) {
      const root = components[name]?.styleOverrides?.root;
      expect(root, `${name} の大きさの指定`).toBeDefined();
      if (['MuiButton', 'MuiIconButton', 'MuiCheckbox'].includes(name)) {
        expect(root?.minWidth).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
      }
      expect(root?.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
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
