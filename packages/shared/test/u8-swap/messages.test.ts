import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  MESSAGES,
  SWAP_ACCEPT_FAILED_MESSAGE,
  SWAP_ADMIN_GUIDE,
  SWAP_LIST_HEADING,
  SWAP_OFFER_FAILED_MESSAGE,
  SWAP_ONE_TO_ONE_GUIDE,
  SWAP_OVERFLOW_NOTE,
  getMessage,
  swapAcceptedMessage,
  swapOfferedMessage,
  swapWithdrawnMessage,
} from '../../src/index';

describe('共有パッケージ: U8 で足す代わりにやるの文言（C10、BR9.14）', () => {
  it('理由の印 OFFER_OWNER_ONLY を足し、文言が決まったとおりである', () => {
    expect(ALL_REASONS).toContain('OFFER_OWNER_ONLY');
    expect(MESSAGES.OFFER_OWNER_ONLY).toBe('この操作は申し出た人だけができます');
    expect(getMessage('OFFER_OWNER_ONLY')).toBe('この操作は申し出た人だけができます');
  });

  it('既存の印の文言が機能設計の表のとおりで、消えていない', () => {
    expect(MESSAGES.NO_SWAPPABLE_DUTY).toBe('申し出られる担当はありません');
    expect(MESSAGES.MONTH_CONFIRMED).toBe('この月は確定済みです');
    expect(MESSAGES.ALREADY_OFFERED).toBe('この担当はもう申し出ています');
    expect(MESSAGES.OFFER_ALREADY_ACCEPTED).toBe('この申し出はもう引き受けられています');
    expect(MESSAGES.OFFER_GONE).toBe('この申し出はもうありません');
    expect(MESSAGES.CANNOT_ACCEPT_OWN_OFFER).toBe('この申し出には応えられません');
    expect(MESSAGES.DUTY_CHANGED).toBe('この担当は先に変更されました');
  });

  it('見出し・案内・失敗の文が決まったとおりである', () => {
    expect(SWAP_LIST_HEADING).toBe('代わってほしい担当を選んでください');
    expect(SWAP_OVERFLOW_NOTE).toBe(
      '近い日の担当だけ出しています。ほかの担当は、その日が近づいたらまた『家事交代』と送ってください',
    );
    expect(SWAP_ADMIN_GUIDE).toBe('代わってもらう申し出は子供だけができます');
    expect(SWAP_ONE_TO_ONE_GUIDE).toBe(
      '代わってほしいときは、家族のグループで『家事交代』と送ってください',
    );
    expect(SWAP_OFFER_FAILED_MESSAGE).toBe('うまく申し出られませんでした。もう一度お試しください');
    expect(SWAP_ACCEPT_FAILED_MESSAGE).toBe(
      'うまく引き受けられませんでした。もう一度お試しください',
    );
  });

  it('値を入れる文が、月・日を 0 埋めなしで出す', () => {
    expect(swapOfferedMessage('花子', '2027-01-08', '皿洗い')).toBe(
      '花子が 1月8日 の皿洗いを代わってくれる人を探しています',
    );
    expect(swapAcceptedMessage('太郎', '2027-11-09', '洗濯物たたみ')).toBe(
      '太郎が 11月9日 の洗濯物たたみを引き受けました',
    );
    expect(swapWithdrawnMessage('花子', '2027-01-08', '皿洗い')).toBe(
      '花子が 1月8日 の皿洗いの申し出をやめました',
    );
  });

  it('名前が引けないとき「だれか」「お手伝い」に言い換える', () => {
    expect(swapOfferedMessage(undefined, '2027-01-08', undefined)).toBe(
      'だれかが 1月8日 のお手伝いを代わってくれる人を探しています',
    );
    expect(swapAcceptedMessage('', '2027-01-08', '')).toBe(
      'だれかが 1月8日 のお手伝いを引き受けました',
    );
    expect(swapWithdrawnMessage(undefined, '2027-01-08', '皿洗い')).toBe(
      'だれかが 1月8日 の皿洗いの申し出をやめました',
    );
  });

  it('管理者への文に「家事交代」を入れず、1 対 1 と案内の文には入れる', () => {
    expect(SWAP_ADMIN_GUIDE).not.toContain('家事交代');
    expect(SWAP_ONE_TO_ONE_GUIDE).toContain('『家事交代』');
    expect(SWAP_OVERFLOW_NOTE).toContain('『家事交代』');
  });

  it('「代わって」「かわって」を始める言葉として使う文言がない', () => {
    const all = [
      ...Object.values(MESSAGES),
      SWAP_LIST_HEADING,
      SWAP_OVERFLOW_NOTE,
      SWAP_ADMIN_GUIDE,
      SWAP_ONE_TO_ONE_GUIDE,
      SWAP_OFFER_FAILED_MESSAGE,
      SWAP_ACCEPT_FAILED_MESSAGE,
      swapOfferedMessage('花子', '2027-01-08', '皿洗い'),
      swapAcceptedMessage('花子', '2027-01-08', '皿洗い'),
      swapWithdrawnMessage('花子', '2027-01-08', '皿洗い'),
    ];
    for (const text of all) {
      expect(text).not.toMatch(/[『「](代わって|かわって)[』」]/);
      expect(text).not.toMatch(/(代わって|かわって)と送/);
    }
  });
});
