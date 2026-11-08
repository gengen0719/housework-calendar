import { beforeEach, describe, expect, it, vi } from 'vitest';

const liff = vi.hoisted(() => ({
  init: vi.fn(),
  isInClient: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  getIDToken: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

type Module = typeof import('../../src/liff/liffClient');
let mod: Module;

beforeEach(async () => {
  vi.resetModules();
  for (const fn of Object.values(liff)) fn.mockReset();
  liff.init.mockResolvedValue(undefined);
  mod = await import('../../src/liff/liffClient');
});

describe('liffClient', () => {
  it('LINE アプリの中では未ログインの確かめをせず ID トークンを返す', async () => {
    liff.isInClient.mockReturnValue(true);
    liff.getIDToken.mockReturnValue('id-in-client');
    await expect(mod.getIdToken()).resolves.toBe('id-in-client');
    expect(liff.login).not.toHaveBeenCalled();
  });

  it('外のブラウザで未ログインなら LINE ログインへ移る', async () => {
    liff.isInClient.mockReturnValue(false);
    liff.isLoggedIn.mockReturnValue(false);
    await expect(mod.getIdToken()).rejects.toBeInstanceOf(mod.LoginRedirect);
    expect(liff.login).toHaveBeenCalledTimes(1);
  });

  it('外のブラウザでもログイン済みなら ID トークンを返す', async () => {
    liff.isInClient.mockReturnValue(false);
    liff.isLoggedIn.mockReturnValue(true);
    liff.getIDToken.mockReturnValue('id-browser');
    await expect(mod.getIdToken()).resolves.toBe('id-browser');
  });

  it('初期化は 1 回だけで、失敗したら次の呼び出しでやり直す', async () => {
    liff.isInClient.mockReturnValue(true);
    liff.getIDToken.mockReturnValue('id');
    liff.init.mockRejectedValueOnce(new Error('init failed'));
    await expect(mod.getIdToken()).rejects.toThrow('init failed');
    await mod.getIdToken();
    await mod.getIdToken();
    expect(liff.init).toHaveBeenCalledTimes(2);
  });

  it('ID トークンが取れなければ失敗にする', async () => {
    liff.isInClient.mockReturnValue(true);
    liff.getIDToken.mockReturnValue(null);
    await expect(mod.getIdToken()).rejects.toThrow('ID token');
  });
});
