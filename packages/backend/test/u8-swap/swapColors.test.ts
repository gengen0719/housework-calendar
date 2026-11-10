import { describe, expect, it } from 'vitest';
import { SWAP_BUTTON_COLOR, SWAP_BUTTON_TEXT_COLOR } from '../../src/services/lineApiService';

/** WCAG の相対輝度と色の差（NFR9.9）。 */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('ボタンの色の差（NFR9.9）', () => {
  it('ボタンの文字と背景の色の差は 4.5:1 以上', () => {
    expect(contrast(SWAP_BUTTON_COLOR, SWAP_BUTTON_TEXT_COLOR)).toBeGreaterThanOrEqual(4.5);
  });
  it('計算が正しい（黒と白は 21:1、同じ色は 1:1）', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#336699', '#336699')).toBeCloseTo(1, 5);
  });
  it('LINE の標準の緑（#17c950）に白い文字では足りない（だから色を指定する）', () => {
    expect(contrast('#17c950', '#ffffff')).toBeLessThan(4.5);
  });
});
