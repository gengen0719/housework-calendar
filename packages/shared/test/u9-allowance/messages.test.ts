import { describe, expect, it } from 'vitest';
import {
  ALLOWANCE_EMPTY_OTHER_MONTH,
  ALLOWANCE_EMPTY_THIS_MONTH,
  ALLOWANCE_LOAD_FAILED_MESSAGE,
  ALLOWANCE_NO_CHILDREN,
  ALLOWANCE_UNCONFIRMED_LABEL,
  ALLOWANCE_UNKNOWN_CHILD,
  ALLOWANCE_UNKNOWN_CHORE,
  ALLOWANCE_YOU_SUFFIX,
  MESSAGES,
  MONTH_CONFIRMED_LABEL,
  MONTH_RECONFIRM_RETRY,
  allowanceHeading,
  getMessage,
} from '../../src/index';

describe('共有パッケージ: U9 で足すお小遣いの文言（C10、BR10.9〜BR10.11）', () => {
  it('見出し「{年}年{月}月のお小遣い」は月を 0 埋めしない', () => {
    expect(allowanceHeading('2027-01')).toBe('2027年1月のお小遣い');
    expect(allowanceHeading('2027-12')).toBe('2027年12月のお小遣い');
    expect(allowanceHeading('2028-02')).toBe('2028年2月のお小遣い');
  });

  it('確定していない月の文言と、確定済みの文言（U5 のもの）が決まったとおりである', () => {
    expect(ALLOWANCE_UNCONFIRMED_LABEL).toBe('確定していません');
    expect(MONTH_CONFIRMED_LABEL).toBe('確定済み');
  });

  it('記録のない子供の文言は、今日の月とほかの月で分かれる', () => {
    expect(ALLOWANCE_EMPTY_THIS_MONTH).toBe('今月の記録はまだありません（0 円）');
    expect(ALLOWANCE_EMPTY_OTHER_MONTH).toBe('この月の記録はまだありません（0 円）');
  });

  it('子供がいないときの案内と「（あなた）」が決まったとおりである', () => {
    expect(ALLOWANCE_NO_CHILDREN).toBe('お小遣いを表示する子供がまだいません');
    expect(ALLOWANCE_YOU_SUFFIX).toBe('（あなた）');
  });

  it('名前が読めない子供と種類が見つからない行の文言が決まったとおりである', () => {
    expect(ALLOWANCE_UNKNOWN_CHILD).toBe('名前が分からない子供');
    expect(ALLOWANCE_UNKNOWN_CHORE).toBe('不明なお手伝い');
  });

  it('失敗の文言と「読み込み直す」が決まったとおりである', () => {
    expect(ALLOWANCE_LOAD_FAILED_MESSAGE).toBe('表示できませんでした。もう一度お試しください');
    expect(MONTH_RECONFIRM_RETRY).toBe('読み込み直す');
  });

  it('既存の文言が消えていない', () => {
    expect(MESSAGES.NOT_FAMILY_MEMBER).toBeTruthy();
    expect(getMessage('NOT_FAMILY_MEMBER')).toBe(MESSAGES.NOT_FAMILY_MEMBER);
    expect(MESSAGES.INVALID_MONTH).toBeTruthy();
    expect(MESSAGES.MONTH_CONFIRMED).toBe('この月は確定済みです');
  });
});
