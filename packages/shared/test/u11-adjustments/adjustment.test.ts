import { describe, expect, it } from 'vitest';
import { validateAdjustment } from '../../src/adjustment';
import { FAKE_UUID_LOWER } from '../fixtures/fakeSecrets';
const childUserId = FAKE_UUID_LOWER;
const input = { childUserId, kind: 'add', amount: 1, reason: '理由' };
describe('調整入力の共通検証', () => {
  it.each([1, 200, Number.MAX_SAFE_INTEGER])('正整数%sは有効', (amount) =>
    expect(validateAdjustment({ ...input, amount }).ok).toBe(true),
  );
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', null, undefined])(
    '不正金額%sを断る',
    (amount) =>
      expect(validateAdjustment({ ...input, amount })).toEqual({
        ok: false,
        reason: 'INVALID_AMOUNT',
      }),
  );
  it.each(['', ' ', '\n', '\t'])('空白理由を断る', (reason) =>
    expect(validateAdjustment({ ...input, reason })).toEqual({
      ok: false,
      reason: 'REASON_REQUIRED',
    }),
  );
  it.each(['あ'.repeat(101), '\u0000x', 'a\tb', 123])('不正理由を断る', (reason) =>
    expect(validateAdjustment({ ...input, reason })).toEqual({
      ok: false,
      reason: 'INVALID_REASON',
    }),
  );
  it('NFCと前後空白をそろえる', () =>
    expect(validateAdjustment({ ...input, reason: '  か\u3099\n理由  ' })).toEqual({
      ok: true,
      value: { ...input, reason: 'が\n理由' },
    }));
  it('絵文字100コードポイントを受け付ける', () =>
    expect(validateAdjustment({ ...input, reason: '😀'.repeat(100) }).ok).toBe(true));
  it('絵文字101コードポイントは断る', () =>
    expect(validateAdjustment({ ...input, reason: '😀'.repeat(101) }).ok).toBe(false));
  it('HTMLを文字として保持する', () =>
    expect(validateAdjustment({ ...input, reason: '<img src=x>' })).toEqual({
      ok: true,
      value: { ...input, reason: '<img src=x>' },
    }));
  it.each([null, {}, { ...input, kind: 'bad' }, { ...input, childUserId: 'bad' }])(
    '不正本文を断る',
    (raw) => expect(validateAdjustment(raw).ok).toBe(false),
  );
});
