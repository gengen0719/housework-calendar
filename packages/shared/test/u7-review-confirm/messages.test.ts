import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  MESSAGES,
  MONTH_RECONFIRM_RETRY,
  MONTH_CONFIRMED_LABEL,
  STATUS_CANCEL_BUTTON,
  STATUS_CONFIRM_BUTTON,
  STATUS_DROP_FROM_COUNT_NOTE,
  getMessage,
  monthConfirmPreviewText,
  statusChangePreviewLine,
  unitPriceCountNote,
  type MonthConfirmPreview,
  type StatusChangePreview,
} from '../../src/index';

/** 確認の 1 行の素: 太郎の 1/5 皿洗い。状態は 5 とおりで差し替える。 */
const base: Omit<StatusChangePreview, 'fromStatus' | 'toStatus' | 'countNote'> = {
  date: '2027-01-05',
  choreName: '皿洗い',
  childName: '太郎',
};

describe('共有パッケージ: U7 で足す状態の変更・確定の文言（C10、BR8.3、BR8.10）', () => {
  it('取り消し（済→未）の 1 行（BR8.3）', () => {
    const preview: StatusChangePreview = {
      ...base,
      fromStatus: 'done',
      toStatus: 'todo',
      countNote: null,
    };
    expect(statusChangePreviewLine(preview)).toBe('1/5 皿洗い 太郎: 済 → 未 に戻します');
  });

  it('やらなかった（済→×）の 1 行', () => {
    const preview: StatusChangePreview = {
      ...base,
      fromStatus: 'done',
      toStatus: 'skipped',
      countNote: null,
    };
    expect(statusChangePreviewLine(preview)).toBe('1/5 皿洗い 太郎: 済 → × にします');
  });

  it('やらなかった（未→×）の 1 行', () => {
    const preview: StatusChangePreview = {
      ...base,
      fromStatus: 'todo',
      toStatus: 'skipped',
      countNote: null,
    };
    expect(statusChangePreviewLine(preview)).toBe('1/5 皿洗い 太郎: 未 → × にします');
  });

  it('やらなかったを外す（×→未）の 1 行', () => {
    const preview: StatusChangePreview = {
      ...base,
      fromStatus: 'skipped',
      toStatus: 'todo',
      countNote: null,
    };
    expect(statusChangePreviewLine(preview)).toBe('1/5 皿洗い 太郎: × → 未 に戻します');
  });

  it('済にする（未→済・×→済）は『済』にします（BR8.3）', () => {
    const fromTodo: StatusChangePreview = {
      ...base,
      fromStatus: 'todo',
      toStatus: 'done',
      countNote: null,
    };
    expect(statusChangePreviewLine(fromTodo)).toBe('1/5 皿洗い 太郎 を『済』にします');
    const fromSkipped: StatusChangePreview = { ...fromTodo, fromStatus: 'skipped' };
    expect(statusChangePreviewLine(fromSkipped)).toBe('1/5 皿洗い 太郎 を『済』にします');
  });

  it('注意の文言: お小遣いの回数から外れる・単価で数える（BR8.3）', () => {
    expect(STATUS_DROP_FROM_COUNT_NOTE).toBe('お小遣いの回数から外れます');
    expect(unitPriceCountNote(120)).toBe('120 円で数えます');
    expect(unitPriceCountNote(0)).toBe('0 円で数えます');
  });

  it('月の確定の確認: 未が 0 件なら件数なし（BR8.10）', () => {
    const preview: MonthConfirmPreview = { month: '2027-01', action: 'confirm', todoCount: 0 };
    expect(monthConfirmPreviewText(preview)).toBe(
      '2027-01を確定しますか？ 確定すると変更できなくなります',
    );
  });

  it('月の確定の確認: 未が N 件（N≥1）なら件数の注意を添える（BR8.10）', () => {
    const preview: MonthConfirmPreview = { month: '2027-01', action: 'confirm', todoCount: 3 };
    expect(monthConfirmPreviewText(preview)).toBe(
      '2027-01を確定しますか？ 確定すると変更できなくなります。未の担当が 3 件あります。' +
        '確定すると、これらは記録もやらなかったにもできなくなります',
    );
  });

  it('月の確定の確認: todoCount を渡さなければ件数の注意は出ない', () => {
    const preview: MonthConfirmPreview = { month: '2027-01', action: 'confirm' };
    expect(monthConfirmPreviewText(preview)).toBe(
      '2027-01を確定しますか？ 確定すると変更できなくなります',
    );
  });

  it('確定の取り消しの確認（BR8.12）', () => {
    const preview: MonthConfirmPreview = { month: '2027-01', action: 'unconfirm' };
    expect(monthConfirmPreviewText(preview)).toBe(
      '2027-01の確定を取り消しますか？ 取り消すと、また変更できるようになります',
    );
  });

  it('ボタン・読み込み直しの文言', () => {
    expect(STATUS_CONFIRM_BUTTON).toBe('はい');
    expect(STATUS_CANCEL_BUTTON).toBe('やめる');
    expect(MONTH_RECONFIRM_RETRY).toBe('読み込み直す');
  });

  it('U7 が流用する既存の印と文言が消えていない', () => {
    for (const reason of [
      'MONTH_CONFIRMED',
      'INVALID_TRANSITION',
      'ADMIN_ONLY',
      'NOT_FOUND',
      'NOT_FAMILY_MEMBER',
      'INVALID_MONTH',
      'INTERNAL',
      'DUTY_CHANGED',
      'INVALID_REQUEST',
    ]) {
      expect(ALL_REASONS).toContain(reason);
      expect(getMessage(reason).length).toBeGreaterThan(0);
    }
    // 失敗の文言（functional-spec の表）
    expect(MESSAGES.MONTH_CONFIRMED).toBe('この月は確定済みです');
    expect(MESSAGES.INVALID_TRANSITION).toBe('今の状態からはその操作はできません');
    expect(MESSAGES.DUTY_CHANGED).toBe('この担当は先に変更されました');
    expect(MESSAGES.INVALID_REQUEST).toBe('操作の内容が正しくありません。もう一度お試しください');
    expect(MESSAGES.INTERNAL).toBe('表示できませんでした。もう一度お試しください');
    // 「確定済み」のラベルを流用する
    expect(MONTH_CONFIRMED_LABEL).toBe('確定済み');
  });
});
