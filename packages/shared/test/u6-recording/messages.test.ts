import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  MESSAGES,
  RECORD_CANCEL_BUTTON,
  RECORD_CONFIRM_BUTTON,
  RECORD_FAILED_MESSAGE,
  RECORD_LIST_HEADING,
  RECORD_OVERFLOW_NOTE,
  doneDutyLabel,
  getMessage,
  recordConfirmQuestion,
  recordedMessage,
  skippedDutyLabel,
} from '../../src/index';

describe('共有パッケージ: U6 で足す記録の印と文言（US5.1、C10）', () => {
  it('新しい理由の印が ALL_REASONS にあり、文言が設計のとおり', () => {
    for (const reason of [
      'DUTY_CHANGED',
      'DUTY_ALREADY_DONE',
      'NOT_TODAY_DUTY',
      'ADMIN_RECORD_GUIDE',
      'JOIN_FAMILY_FIRST',
    ]) {
      expect(ALL_REASONS).toContain(reason);
      expect(getMessage(reason).length).toBeGreaterThan(0);
    }
    expect(MESSAGES.DUTY_CHANGED).toBe('この担当は先に変更されました');
    expect(MESSAGES.DUTY_ALREADY_DONE).toBe('この担当はすでに『済』になっています');
    // NOT_TODAY_DUTY は LINE の中だけで、返事は DUTY_CHANGED と同じ文言
    expect(MESSAGES.NOT_TODAY_DUTY).toBe('この担当は先に変更されました');
    expect(MESSAGES.ADMIN_RECORD_GUIDE).toBe(
      'お手伝いの記録は子供のメニューです。記録の修正は画面からできます',
    );
    expect(MESSAGES.JOIN_FAMILY_FIRST).toBe('先に家族に参加してください');
  });

  it('見出し・ボタン・案内・エラーの文言がある', () => {
    expect(RECORD_LIST_HEADING).toBe('どのお手伝いを記録しますか');
    expect(RECORD_CONFIRM_BUTTON).toBe('記録する');
    expect(RECORD_CANCEL_BUTTON).toBe('やめる');
    expect(RECORD_OVERFLOW_NOTE).toBe('ほかの担当はアプリから記録してください');
    expect(RECORD_FAILED_MESSAGE).toBe('うまく記録できませんでした。もう一度お試しください');
    // 記録の INTERNAL の文言は、画面全般の INTERNAL とは別の文言
    expect(RECORD_FAILED_MESSAGE).not.toBe(MESSAGES.INTERNAL);
  });

  it('記録の返事の文言に、お手伝いの名前と時刻が入る', () => {
    expect(recordedMessage('皿洗い', '16:42')).toBe('皿洗いを記録しました（16:42）');
    expect(recordedMessage('洗濯物たたみ', '00:00')).toBe('洗濯物たたみを記録しました（00:00）');
  });

  it('画面の確認の問いかけに、月/日とお手伝いの名前が入る', () => {
    expect(recordConfirmQuestion('2027-01-05', '皿洗い')).toBe('1/5 皿洗いを記録しますか');
    expect(recordConfirmQuestion('2027-12-31', 'ゴミ出し')).toBe('12/31 ゴミ出しを記録しますか');
  });

  it('選べない担当の 1 行（済・×）の文言', () => {
    expect(doneDutyLabel('皿洗い', '16:42')).toBe('皿洗い（済 16:42）');
    expect(skippedDutyLabel('掃除機')).toBe('掃除機（×）');
  });

  it('U5 の既存の印と文言が消えていない', () => {
    for (const reason of [
      'MONTH_CONFIRMED',
      'NO_RECORDABLE_DUTY',
      'FUTURE_DUTY',
      'DUTY_SKIPPED_BY_ADMIN',
      'NOT_OWN_DUTY',
      'INVALID_MONTH',
      'MONTH_NOT_EDITABLE',
    ]) {
      expect(ALL_REASONS).toContain(reason);
    }
    expect(MESSAGES.MONTH_CONFIRMED).toBe('この月は確定済みです');
    expect(MESSAGES.NO_RECORDABLE_DUTY).toBe('今日記録できる担当はありません');
    expect(MESSAGES.FUTURE_DUTY).toBe('まだ来ていない日の担当は記録できません');
    expect(MESSAGES.DUTY_SKIPPED_BY_ADMIN).toBe('お母さんが『やらなかった』にしています');
  });
});
