import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@line/liff', () => ({
  default: {
    init: vi.fn().mockResolvedValue(undefined),
    isInClient: vi.fn().mockReturnValue(true),
    isLoggedIn: vi.fn().mockReturnValue(true),
    login: vi.fn(),
    getIDToken: vi.fn().mockReturnValue('id-token'),
  },
}));

afterEach(() => {
  document.body.innerHTML = '';
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('main', () => {
  it('root の要素に画面を描く', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    document.body.innerHTML = '<div id="root"></div>';
    await import('../../src/main');
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="loading"]')).not.toBeNull(),
    );
  });

  it('root の要素がなければ失敗する', async () => {
    await expect(import('../../src/main')).rejects.toThrow('root element not found');
  });
});
