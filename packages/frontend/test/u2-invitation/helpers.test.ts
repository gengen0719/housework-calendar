import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatExpiry } from '../../src/invitation/formatExpiry';
import { FAKE_INVITE_TOKEN } from '../fixtures/fakeSecrets';
import {
  readInvitationParam,
  removeInvitationParam,
} from '../../src/invitation/readInvitationParam';

const liff = vi.hoisted(() => ({
  isApiAvailable: vi.fn(),
  shareTargetPicker: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

const TOKEN = FAKE_INVITE_TOKEN;

describe('readInvitationParam', () => {
  it('22 文字の印を読む', () => {
    expect(readInvitationParam(`?invitation=${TOKEN}`)).toBe(TOKEN);
  });
  it('base64url の - と _ を含む印も読む', () => {
    expect(readInvitationParam('?invitation=ab-_efghijklmnopqrstuv')).toBe(
      'ab-_efghijklmnopqrstuv',
    );
  });
  it('短い・長い・使えない文字を含む印は読まない', () => {
    expect(readInvitationParam('?invitation=abc')).toBeUndefined();
    expect(readInvitationParam(`?invitation=${TOKEN}x`)).toBeUndefined();
    expect(readInvitationParam('?invitation=abcdefghijklmnopqrstu%2F')).toBeUndefined();
    expect(readInvitationParam('?invitation=')).toBeUndefined();
  });
  it('印がなければ undefined', () => {
    expect(readInvitationParam('')).toBeUndefined();
    expect(readInvitationParam('?other=1')).toBeUndefined();
  });
});

describe('removeInvitationParam', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));
  it('invitation だけを外し、ほかのクエリとハッシュは残す', () => {
    window.history.replaceState(null, '', `/app?invitation=${TOKEN}&x=1#top`);
    removeInvitationParam();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/app?x=1#top',
    );
  });
  it('invitation がなければ履歴を触らない', () => {
    window.history.replaceState(null, '', '/app?x=1');
    const before = window.history.length;
    removeInvitationParam();
    expect(window.location.search).toBe('?x=1');
    expect(window.history.length).toBe(before);
  });
});

describe('formatExpiry', () => {
  it('日本時間の「年月日 時:分」にする', () => {
    expect(formatExpiry('2026-11-02T01:30:00.000Z')).toBe('2026年11月2日 10:30');
  });
  it('日本時間で日付をまたぐ', () => {
    expect(formatExpiry('2026-12-31T15:05:00.000Z')).toBe('2027年1月1日 00:05');
  });
});

describe('shareText', () => {
  beforeEach(() => {
    liff.isApiAvailable.mockReset();
    liff.shareTargetPicker.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('送り先を選ぶ画面が閉じた・失敗したときも何も変えず例外を出さない', async () => {
    liff.isApiAvailable.mockReturnValue(true);
    liff.shareTargetPicker.mockRejectedValue(new Error('closed'));
    const { shareText } = await import('../../src/liff/share');
    await expect(shareText('こんにちは')).resolves.toBeUndefined();
  });
  it('使えなければ noopener つきでシェアの URL を開く', async () => {
    liff.isApiAvailable.mockReturnValue(false);
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const { shareText } = await import('../../src/liff/share');
    await shareText('a b&c');
    expect(open).toHaveBeenCalledWith(
      'https://line.me/R/share?text=a%20b%26c',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
