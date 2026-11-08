import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  MESSAGES,
  err,
  getMessage,
  isErr,
  isOk,
  ok,
  type Reason,
  type Result,
} from '../../src/index';

describe('共有パッケージ: 理由の印と文言（US1.1）', () => {
  it('すべての理由の印に文言がある', () => {
    for (const reason of ALL_REASONS) {
      expect(MESSAGES[reason], reason).toBeTypeOf('string');
      expect(MESSAGES[reason].length, reason).toBeGreaterThan(0);
    }
  });

  it('要件のとおりの文言を返す', () => {
    expect(getMessage('MONTH_CONFIRMED')).toBe('この月は確定済みです');
    expect(getMessage('ALREADY_IN_FAMILY')).toBe('すでに家族に入っています');
    expect(getMessage('ALREADY_IN_OTHER_FAMILY')).toBe('すでに別の家族に入っています');
    expect(getMessage('INVITATION_INVALID')).toBe(
      'この招待は使えません。管理者に新しい招待を頼んでください',
    );
    expect(getMessage('NOT_FAMILY_MEMBER')).toBe('このアプリは家族のメンバーだけが使えます');
    expect(getMessage('INVALID_FAMILY_NAME')).toBe('家族の名前を 1〜20 文字で入力してください');
    expect(getMessage('INTERNAL')).toBe('表示できませんでした。もう一度お試しください');
  });

  it('U1 で足した理由の印がある（NOT_FRIEND など）', () => {
    const added: Reason[] = [
      'NOT_FRIEND',
      'INVALID_FAMILY_NAME',
      'IDEMPOTENCY_KEY_REQUIRED',
      'SERVICE_TEMPORARILY_UNAVAILABLE',
    ];
    for (const reason of added) {
      expect(ALL_REASONS).toContain(reason);
    }
  });

  it('契約 C10 の理由の印がすべてある', () => {
    const c10 = [
      'UNAUTHENTICATED',
      'NOT_FAMILY_MEMBER',
      'ADMIN_ONLY',
      'NOT_FOUND',
      'INTERNAL',
      'ALREADY_IN_FAMILY',
      'ALREADY_IN_OTHER_FAMILY',
      'INVITATION_INVALID',
      'NOTIFICATION_GROUP_NOT_REGISTERED',
      'GROUP_NOT_REGISTERED',
      'INVALID_UNIT_PRICE',
      'CHORE_TYPE_IN_USE',
      'CHORE_TYPE_INACTIVE',
      'ASSIGNMENT_OVERLAP',
      'OVERWRITE_CONFIRMATION_REQUIRED',
      'MONTH_CONFIRMED',
      'DUTY_NOT_TODO',
      'NO_RECORDABLE_DUTY',
      'NOT_OWN_DUTY',
      'FUTURE_DUTY',
      'DUTY_SKIPPED_BY_ADMIN',
      'INVALID_TRANSITION',
      'NO_SWAPPABLE_DUTY',
      'ALREADY_OFFERED',
      'OFFER_ALREADY_ACCEPTED',
      'OFFER_GONE',
      'CANNOT_ACCEPT_OWN_OFFER',
      'REASON_REQUIRED',
      'INVALID_AMOUNT',
    ];
    for (const reason of c10) {
      expect(ALL_REASONS, reason).toContain(reason);
    }
  });

  it('未知の理由の印には「表示できませんでした」の文言を返す', () => {
    expect(getMessage('NOT_A_REASON')).toBe('表示できませんでした。もう一度お試しください');
  });

  it('Result: ok と err を作って見分けられる', () => {
    const success: Result<number> = ok(1);
    const failure: Result<number> = err('NOT_FOUND');
    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect(isErr(failure)).toBe(true);
    expect(isOk(failure)).toBe(false);
    expect(success).toEqual({ ok: true, value: 1 });
    expect(failure).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});
