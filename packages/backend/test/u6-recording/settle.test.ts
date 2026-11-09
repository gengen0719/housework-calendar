import { afterEach, describe, expect, it, vi } from 'vitest';
import { settle } from '../../src/lib/promise';

describe('settle（U6。reliability-design.md の「名前の Query の置き方」）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('成功した Promise を { ok: true, value } にする', async () => {
    expect(await settle(Promise.resolve(42))).toEqual({ ok: true, value: 42 });
  });

  it('値がオブジェクトでもそのまま value に入る', async () => {
    const value = { names: ['皿洗い'] };
    expect(await settle(Promise.resolve(value))).toEqual({ ok: true, value });
  });

  it('失敗した Promise を { ok: false, error } にする（投げ直さない）', async () => {
    const error = new Error('読み取りに失敗');
    expect(await settle(Promise.reject(error))).toEqual({ ok: false, error });
  });

  it('Error でない理由でも error にそのまま入る', async () => {
    expect(await settle(Promise.reject('boom'))).toEqual({ ok: false, error: 'boom' });
  });

  it('待たずに保持しても「未処理の拒否」を起こさない（.catch 付き）', async () => {
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      // 包むだけで待たない。拒否する Promise を保持する
      const pending = settle(Promise.reject(new Error('待たれない失敗')));
      // マイクロタスクとタイマーを一巡させて、未処理の拒否が出ないことを確かめる
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onUnhandled).not.toHaveBeenCalled();
      // 最後に待っても失敗の形で受け取れる
      expect((await pending).ok).toBe(false);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
