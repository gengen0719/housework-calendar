import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  GROUP_JOIN_GUIDE,
  GROUP_REGISTER_BUTTON,
  GROUP_REGISTER_IN_GROUP_ONLY,
  MESSAGES,
  NOTIFICATION_GROUP_ADMIN_ONLY,
  NOTIFICATION_GROUP_HOWTO,
  NOTIFICATION_GROUP_REGISTERED,
  getMessage,
  type NotificationGroupView,
} from '../../src/index';

describe('共有パッケージ: U3 で足す印と文言（US1.2）', () => {
  it('GROUP_USED_BY_OTHER_FAMILY が理由の印にあり、文言がある', () => {
    expect(ALL_REASONS).toContain('GROUP_USED_BY_OTHER_FAMILY');
    expect(MESSAGES.GROUP_USED_BY_OTHER_FAMILY).toBe(
      'このグループはほかの家族のお知らせ先になっています',
    );
    expect(getMessage('GROUP_USED_BY_OTHER_FAMILY')).toBe(MESSAGES.GROUP_USED_BY_OTHER_FAMILY);
  });

  it('登録できない・登録されていないときの文言が要件のとおり', () => {
    expect(NOTIFICATION_GROUP_ADMIN_ONLY).toBe('お知らせ先を登録できるのは管理者だけです');
    expect(getMessage('GROUP_NOT_REGISTERED')).toBe(
      'このグループは家族のお知らせ先として登録されていません',
    );
    expect(getMessage('NOTIFICATION_GROUP_NOT_REGISTERED')).toBe(
      'お知らせ先のグループが登録されていません',
    );
    expect(GROUP_REGISTER_IN_GROUP_ONLY).toBe(
      'お知らせ先の登録は、家族のグループ LINE の中で行ってください',
    );
  });

  it('NOTIFICATION_GROUP_REGISTERED に家族の名前が入る', () => {
    const text = NOTIFICATION_GROUP_REGISTERED('田中家');
    expect(text).toContain('このグループを田中家のお知らせ先にしました');
    expect(text).toContain('毎日 16 時のリマインドと、月末のまとめがここに届きます');
  });

  it('案内とボタンと画面の手順の文言がある', () => {
    expect(GROUP_JOIN_GUIDE).toContain('公式アカウントを招待してくれてありがとうございます');
    expect(GROUP_JOIN_GUIDE).toContain('『登録』と送ってください');
    expect(GROUP_REGISTER_BUTTON).toBe('このグループをお知らせ先にする');
    expect(NOTIFICATION_GROUP_HOWTO).toBe(
      '公式アカウントを家族のグループ LINE に招待し、届いたボタンを押してください',
    );
  });

  it('U1・U2 の印が消えていない', () => {
    for (const reason of [
      'NOT_FRIEND',
      'INVALID_FAMILY_NAME',
      'IDEMPOTENCY_KEY_REQUIRED',
      'SERVICE_TEMPORARILY_UNAVAILABLE',
      'IDEMPOTENCY_KEY_REUSED',
      'ADMIN_ONLY',
    ]) {
      expect(ALL_REASONS).toContain(reason);
    }
  });

  it('API の型 NotificationGroupView が使える（名前は空もありうる）', () => {
    const view: NotificationGroupView = {
      groupName: null,
      registeredAt: '2026-11-01T00:00:00.000Z',
    };
    expect(view.groupName).toBeNull();
  });
});
