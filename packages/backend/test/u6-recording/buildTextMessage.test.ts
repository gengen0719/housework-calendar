import { describe, expect, it } from 'vitest';
import { getMessage } from '@housework/shared';
import { buildTextMessage } from '../../src/services/lineApiService';

describe('buildTextMessage（U6。案内・返事の 1 行）', () => {
  it('テキストメッセージの形（type: text）にする', () => {
    expect(buildTextMessage('こんにちは')).toEqual({ type: 'text', text: 'こんにちは' });
  });

  it('管理者・家族外への案内の文言をそのまま包む', () => {
    expect(buildTextMessage(getMessage('ADMIN_RECORD_GUIDE'))).toEqual({
      type: 'text',
      text: 'お手伝いの記録は子供のメニューです。記録の修正は画面からできます',
    });
    expect(buildTextMessage(getMessage('JOIN_FAMILY_FIRST'))).toEqual({
      type: 'text',
      text: '先に家族に参加してください',
    });
  });

  it('空文字でも text に入る（中身の判断は呼び出し側）', () => {
    expect(buildTextMessage('')).toEqual({ type: 'text', text: '' });
  });
});
