import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  INVITATION_NOT_FRIEND_HINT,
  INVITATION_SHARE_TEXT,
  MESSAGES,
  getMessage,
  type InvitationPreview,
  type InvitationView,
  type Member,
} from '../../src/index';

describe('共有パッケージ: U2 で足す印と文言（US1.1）', () => {
  it('IDEMPOTENCY_KEY_REUSED が理由の印にあり、文言がある', () => {
    expect(ALL_REASONS).toContain('IDEMPOTENCY_KEY_REUSED');
    expect(MESSAGES.IDEMPOTENCY_KEY_REUSED.length).toBeGreaterThan(0);
  });

  it('INVITATION_NOT_FRIEND_HINT は要件のとおり', () => {
    expect(INVITATION_NOT_FRIEND_HINT).toBe('友だち登録したら、もう一度このリンクを開いてください');
  });

  it('INVITATION_SHARE_TEXT に家族の名前・期限・リンクが入る', () => {
    const text = INVITATION_SHARE_TEXT({
      familyName: '田中家',
      expiresAtText: '11月2日 9:00',
      url: 'https://example.test/?invitation=AbCdEfGhIjKlMnOpQrStUv',
    });
    expect(text).toContain('田中家');
    expect(text).toContain('11月2日 9:00');
    expect(text).toContain('https://example.test/?invitation=AbCdEfGhIjKlMnOpQrStUv');
  });

  it('参加まわりの文言が要件のとおり', () => {
    expect(getMessage('ALREADY_IN_FAMILY')).toBe('すでに家族に入っています');
    expect(getMessage('ALREADY_IN_OTHER_FAMILY')).toBe('すでに別の家族に入っています');
    expect(getMessage('INVITATION_INVALID')).toBe(
      'この招待は使えません。管理者に新しい招待を頼んでください',
    );
  });

  it('U1 の印が消えていない', () => {
    for (const reason of [
      'NOT_FRIEND',
      'INVALID_FAMILY_NAME',
      'IDEMPOTENCY_KEY_REQUIRED',
      'SERVICE_TEMPORARILY_UNAVAILABLE',
    ]) {
      expect(ALL_REASONS).toContain(reason);
    }
  });

  it('API の型 Member・InvitationView・InvitationPreview が使える', () => {
    const member: Member = { userId: 'u1', displayName: 'お母さん', role: 'admin' };
    const view: InvitationView = {
      url: 'https://example.test/',
      expiresAt: '2026-11-02T00:00:00.000Z',
    };
    const preview: InvitationPreview = { familyName: '田中家', expiresAt: view.expiresAt };
    expect([member.role, view.url, preview.familyName]).toEqual([
      'admin',
      'https://example.test/',
      '田中家',
    ]);
  });
});
