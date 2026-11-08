import { describe, expect, it } from 'vitest';
import {
  CHORE_TYPE_DESCRIPTION_MAX_LENGTH,
  CHORE_TYPE_NAME_MAX_LENGTH,
  normalizeChoreName,
  normalizeDescription,
  validateUnitPrice,
} from '../../src/index';

describe('normalizeChoreName（BR5.2）', () => {
  it('前後の空白（全角を含む）を除き、NFC にそろえる', () => {
    expect(normalizeChoreName('  皿洗い　')).toEqual({ ok: true, value: '皿洗い' });
    // 「か」+ 濁点（結合文字）→ 「が」（NFC）
    expect(normalizeChoreName('か\u3099')).toEqual({ ok: true, value: 'が' });
  });

  it('1 文字と 20 文字は通り、0 文字と 21 文字は断る（コードポイントで数える）', () => {
    expect(normalizeChoreName('あ').ok).toBe(true);
    expect(normalizeChoreName('あ'.repeat(CHORE_TYPE_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(normalizeChoreName('あ'.repeat(CHORE_TYPE_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'INVALID_CHORE_TYPE_NAME',
    });
    expect(normalizeChoreName('')).toEqual({ ok: false, reason: 'INVALID_CHORE_TYPE_NAME' });
    expect(normalizeChoreName(' 　 ')).toEqual({ ok: false, reason: 'INVALID_CHORE_TYPE_NAME' });
  });

  it('絵文字は 1 コードポイントとして数える', () => {
    expect(normalizeChoreName('🍽'.repeat(20)).ok).toBe(true);
    expect(normalizeChoreName('🍽'.repeat(21)).ok).toBe(false);
  });

  it('改行などの制御文字を含む名前は断る。文字でない値も断る', () => {
    expect(normalizeChoreName('皿\n洗い').ok).toBe(false);
    expect(normalizeChoreName('皿\t洗い').ok).toBe(false);
    expect(normalizeChoreName('皿\u0000洗い').ok).toBe(false);
    expect(normalizeChoreName(undefined as unknown as string).ok).toBe(false);
    expect(normalizeChoreName(123 as unknown as string).ok).toBe(false);
  });
});

describe('validateUnitPrice（BR5.5）', () => {
  it('0 と正の整数を通す', () => {
    expect(validateUnitPrice(0)).toEqual({ ok: true, value: 0 });
    expect(validateUnitPrice(100)).toEqual({ ok: true, value: 100 });
    expect(validateUnitPrice(Number.MAX_SAFE_INTEGER).ok).toBe(true);
  });

  it('-0 は 0 にそろえる', () => {
    const result = validateUnitPrice(-0);
    expect(result.ok && Object.is(result.value, 0)).toBe(true);
  });

  it('負の数、小数、文字列、空、null、扱える整数を超える値を断る', () => {
    for (const bad of [-1, 1.5, '100', '', undefined, null, NaN, Infinity, 2 ** 53, true]) {
      expect(validateUnitPrice(bad)).toEqual({ ok: false, reason: 'INVALID_UNIT_PRICE' });
    }
  });
});

describe('normalizeDescription（BR5.6）', () => {
  it('ないとき、空のときは説明なし', () => {
    expect(normalizeDescription(undefined)).toEqual({ ok: true, value: undefined });
    expect(normalizeDescription(null)).toEqual({ ok: true, value: undefined });
    expect(normalizeDescription('  　 ')).toEqual({ ok: true, value: undefined });
  });

  it('前後の空白を除き、改行は許す', () => {
    expect(normalizeDescription('  夕食のあと\n2 回目  ')).toEqual({
      ok: true,
      value: '夕食のあと\n2 回目',
    });
  });

  it('100 文字は通り、101 文字は断る（コードポイントで数える）', () => {
    expect(normalizeDescription('あ'.repeat(CHORE_TYPE_DESCRIPTION_MAX_LENGTH)).ok).toBe(true);
    expect(normalizeDescription('あ'.repeat(CHORE_TYPE_DESCRIPTION_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'INVALID_DESCRIPTION',
    });
    expect(normalizeDescription('🍽'.repeat(100)).ok).toBe(true);
  });

  it('改行以外の制御文字、文字でない値を断る', () => {
    expect(normalizeDescription('a\tb').ok).toBe(false);
    expect(normalizeDescription('a\r\nb').ok).toBe(false);
    expect(normalizeDescription('a\u0000b').ok).toBe(false);
    expect(normalizeDescription(5).ok).toBe(false);
  });
});
