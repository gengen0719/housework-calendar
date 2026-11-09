import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  ASSIGNMENT_MAX_CHORE_TYPES,
  ASSIGNMENT_MAX_RULES,
  ASSIGNMENT_SAVE_FAILED,
  ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE,
  CALENDAR_LOAD_FAILED_RETRY,
  COPY_LAST_MONTH_LABEL,
  COPY_LAST_MONTH_NONE,
  COPY_LAST_MONTH_SKIPPED_INACTIVE,
  MESSAGES,
  MONTH_CONFIRMED_LABEL,
  NO_ASSIGNMENT_MESSAGE,
  NO_DUTY_LABEL,
  OVERWRITE_CONFIRM_HEADING,
  assignmentOverlapMessage,
  getMessage,
  overwriteChangeMessage,
  type AssignmentRule,
  type Duty,
  type MonthCalendar,
  type OverlapItem,
  type OverwriteChange,
  type SaveAssignmentRequest,
} from '../../src/index';
import { FAKE_UUID_LOWER } from '../fixtures/fakeSecrets';

describe('共有パッケージ: U5 で足す印と文言（US3.1、US4.1）', () => {
  it('新しい理由の印が ALL_REASONS にあり、文言が設計のとおり', () => {
    for (const reason of [
      'INVALID_MONTH',
      'INVALID_ASSIGNMENT',
      'MONTH_NOT_EDITABLE',
      'PAYLOAD_TOO_LARGE',
    ]) {
      expect(ALL_REASONS).toContain(reason);
      expect(getMessage(reason).length).toBeGreaterThan(0);
    }
    expect(MESSAGES.MONTH_NOT_EDITABLE).toBe('割り当てを入力できるのは今月と来月だけです');
    expect(MESSAGES.INVALID_ASSIGNMENT).toBe('割り当ての入力に誤りがあります');
    expect(getMessage('INVALID_MONTH')).toBe(MESSAGES.INVALID_MONTH);
    expect(getMessage('PAYLOAD_TOO_LARGE')).toBe(MESSAGES.PAYLOAD_TOO_LARGE);
  });

  it('重なりの文言に月・日・曜日・種類の名前が入る', () => {
    expect(assignmentOverlapMessage('2027-01-04', '皿洗い')).toBe(
      '1月4日(月) の皿洗いに担当が 2 人います',
    );
    expect(assignmentOverlapMessage('2027-12-31', 'ゴミ出し')).toBe(
      '12月31日(金) のゴミ出しに担当が 2 人います',
    );
    expect(MESSAGES.ASSIGNMENT_OVERLAP).toBe('同じ日の同じお手伝いに担当が 2 人います');
  });

  it('上書きの一覧の文言に月・日・種類・前の子供・後の子供が入る', () => {
    expect(overwriteChangeMessage('2027-01-22', '皿洗い', '太郎', '花子')).toBe(
      '1月22日 皿洗い: 太郎 → 花子',
    );
    expect(overwriteChangeMessage('2027-02-03', '洗濯物たたみ', '次郎', '太郎')).toBe(
      '2月3日 洗濯物たたみ: 次郎 → 太郎',
    );
    expect(OVERWRITE_CONFIRM_HEADING).toBe('次の担当が上書きされます');
    expect(MESSAGES.OVERWRITE_CONFIRMATION_REQUIRED.length).toBeGreaterThan(0);
  });

  it('カレンダーと割り当ての画面の文言がある', () => {
    expect(NO_ASSIGNMENT_MESSAGE).toBe('この月の割り当てはまだありません');
    expect(NO_DUTY_LABEL).toBe('担当なし');
    expect(MONTH_CONFIRMED_LABEL).toBe('確定済み');
    expect(COPY_LAST_MONTH_LABEL).toBe('先月と同じにする');
    expect(CALENDAR_LOAD_FAILED_RETRY).toBe('読み込み直す');
  });

  it('「先月と同じにする」の結果の文言が 2 つある', () => {
    expect(COPY_LAST_MONTH_SKIPPED_INACTIVE).toBe('使わないお手伝いは入れませんでした');
    expect(COPY_LAST_MONTH_NONE).toBe('先月の割り当てはありません');
  });

  it('保存が失敗したときの文言（500）と、一部が書き換わっている旨がある', () => {
    expect(ASSIGNMENT_SAVE_FAILED).toBe('保存できませんでした。もう一度保存してください');
    expect(ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE).toContain('一部');
  });

  it('入力の上限が設計のとおり（行 200、種類 90）', () => {
    expect(ASSIGNMENT_MAX_RULES).toBe(200);
    expect(ASSIGNMENT_MAX_CHORE_TYPES).toBe(90);
  });

  it('U1〜U4 の印と文言が消えていない', () => {
    for (const reason of [
      'NOT_FRIEND',
      'INVALID_FAMILY_NAME',
      'IDEMPOTENCY_KEY_REUSED',
      'GROUP_USED_BY_OTHER_FAMILY',
      'INVALID_CHORE_TYPE_NAME',
      'CHORE_TYPE_STATE_CHANGED',
      'ASSIGNMENT_OVERLAP',
      'MONTH_CONFIRMED',
    ]) {
      expect(ALL_REASONS).toContain(reason);
    }
    expect(MESSAGES.MONTH_CONFIRMED).toBe('この月は確定済みです');
    expect(MESSAGES.DUTY_NOT_TODO).toBe('記録を取り消してから変更してください');
    expect(MESSAGES.INVALID_CHORE_TYPE_NAME).toBe('名前を 1〜20 文字で入力してください');
  });

  it('型 Duty・MonthCalendar・AssignmentRule・SaveAssignmentRequest などが使える', () => {
    const rule: AssignmentRule = {
      choreTypeId: FAKE_UUID_LOWER,
      childUserId: FAKE_UUID_LOWER,
      weekdays: [1, 4],
    };
    const request: SaveAssignmentRequest = { rules: [rule] };
    const duty: Duty = {
      dutyId: FAKE_UUID_LOWER,
      date: '2027-01-04',
      choreTypeId: FAKE_UUID_LOWER,
      choreName: '皿洗い',
      childUserId: FAKE_UUID_LOWER,
      status: 'todo',
      origin: 'rule',
      version: 1,
      recordedAt: null,
      recordedBy: null,
      recordedByName: null,
      unitPrice: null,
    };
    const calendar: MonthCalendar = {
      month: '2027-01',
      confirmed: false,
      hasAssignment: true,
      today: '2027-01-03',
      duties: [duty],
      children: [{ userId: FAKE_UUID_LOWER, displayName: '太郎' }],
      choreTypes: [{ choreTypeId: FAKE_UUID_LOWER, name: '皿洗い', active: true }],
    };
    const change: OverwriteChange = {
      date: '2027-01-22',
      choreTypeId: FAKE_UUID_LOWER,
      fromChildUserId: FAKE_UUID_LOWER,
      toChildUserId: FAKE_UUID_LOWER,
    };
    const overlap: OverlapItem = {
      date: '2027-01-04',
      weekday: 1,
      choreTypeId: FAKE_UUID_LOWER,
      childUserIds: [FAKE_UUID_LOWER],
    };
    expect(request.confirmedChangesHash).toBeUndefined();
    expect(calendar.duties[0]?.status).toBe('todo');
    expect(change.date).toBe('2027-01-22');
    expect(overlap.weekday).toBe(1);
  });
});
