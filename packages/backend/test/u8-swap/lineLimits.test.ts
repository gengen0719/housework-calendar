import { describe, expect, it } from 'vitest';
import {
  DATE_LABEL_MAX_LENGTH,
  LINE_LIMITS,
  SWAP_CHORE_NAME_MAX,
  SWAP_NOTICE_NAME_MAX,
  swapButtonLabel,
  swapNoticeLength,
  truncateForLine,
} from '../../src/services/lineApiService';

const length = (text: string): number => Array.from(text).length;

describe('LINE の上限の定数と文字数の計算（BR9.6、BR9.7、NFR8.15、NFR9.9）', () => {
  it('LINE_LIMITS が docs/contract-changes-u8.md の確認結果と同じである', () => {
    expect(LINE_LIMITS).toMatchObject({
      FLEX_BUTTON_LABEL_MAX: 40,
      TEMPLATE_BUTTON_LABEL_MAX: 20,
      TEMPLATE_BODY_MAX: 160,
      ALT_TEXT_MAX: 400,
      ALT_TEXT_OFFICIAL_MAX: 1500,
      CAROUSEL_BUBBLES_MAX: 12,
      REPLY_MESSAGES_MAX: 5,
      POSTBACK_DATA_MAX: 300,
    });
    expect(DATE_LABEL_MAX_LENGTH).toBe('12/31'.length);
  });

  it('SWAP_CHORE_NAME_MAX が上限から計算され、20 を超えない', () => {
    const computed = LINE_LIMITS.FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1;
    expect(SWAP_CHORE_NAME_MAX).toBe(Math.min(computed, 20));
    expect(SWAP_CHORE_NAME_MAX).toBeLessThanOrEqual(20);
  });

  it('ボタンの文字が、どんな名前でも上限を超えず、切るときは末尾が「…」である', () => {
    const names = [
      '',
      '皿',
      'あ'.repeat(SWAP_CHORE_NAME_MAX),
      'あ'.repeat(SWAP_CHORE_NAME_MAX + 1),
      '𩸽'.repeat(SWAP_CHORE_NAME_MAX + 5),
      '👨‍👩‍👧'.repeat(10),
      '<b>皿\n洗い</b>'.repeat(5),
    ];
    for (const name of names) {
      const label = swapButtonLabel('12/31', name);
      expect(length(label)).toBeLessThanOrEqual(LINE_LIMITS.FLEX_BUTTON_LABEL_MAX);
      expect(label.startsWith('12/31 ')).toBe(true);
    }
    const cut = swapButtonLabel('1/8', 'あ'.repeat(SWAP_CHORE_NAME_MAX + 1));
    expect(cut).toBe(`1/8 ${'あ'.repeat(SWAP_CHORE_NAME_MAX - 1)}…`);
    expect(swapButtonLabel('1/8', '皿洗い')).toBe('1/8 皿洗い');
  });

  it('truncateForLine が文字を割らず、上限ちょうどはそのまま返す', () => {
    expect(truncateForLine('あいう', 3)).toBe('あいう');
    expect(truncateForLine('あいうえ', 3)).toBe('あい…');
    const emoji = '😀😀😀😀';
    const out = truncateForLine(emoji, 3);
    expect(out).toBe('😀😀…');
    expect(length(out)).toBe(3);
    expect(truncateForLine('', 3)).toBe('');
  });

  it('SWAP_NOTICE_NAME_MAX が本文の上限から計算され、20 を超えない', () => {
    expect(SWAP_NOTICE_NAME_MAX).toBeLessThanOrEqual(20);
    expect(SWAP_NOTICE_NAME_MAX).toBeGreaterThan(0);
  });

  it('知らせの本文が、名前が最長でも本文の上限を超えない', () => {
    const name = 'あ'.repeat(200);
    const text = swapNoticeLength(name, name);
    expect(text).toBeLessThanOrEqual(LINE_LIMITS.TEMPLATE_BODY_MAX);
    expect(text).toBeGreaterThan(0);
  });
});
