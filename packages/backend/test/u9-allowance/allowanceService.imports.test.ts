/**
 * allowanceService.ts が禁止された import を持たないこと、書き込みの命令が 0 回であること、
 * fetch が 0 回であることを確かめる（NFR4.89、NFR5.16）。
 * ソースを読んで確かめるテストと、実行時の見張りのテスト。
 */
import { describe, expect, it, vi } from 'vitest';
import { getAllowances } from '../../src/services/allowanceService';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asRead, ctxAdmin, dateOf, MONTH, setupAllowanceWorld } from './helpers/allowanceWorld';
import { totalWrites } from './helpers/writeGuard';

const SRC = readFileSync(
  join(import.meta.dirname, '../../src/services/allowanceService.ts'),
  'utf-8',
);

describe('allowanceService の import の制約（NFR4.89、NFR5.16）', () => {
  it('lineApiService を import していない', () => {
    expect(SRC).not.toMatch(/import.*lineApiService/);
  });

  it('swapService を import していない', () => {
    expect(SRC).not.toMatch(/import.*swapService/);
  });

  it('calendarService を import していない（calendarRepository は使ってよい）', () => {
    expect(SRC).not.toMatch(/import.*calendarService/);
  });

  it('書き込みの窓口・リポジトリを import していない（PutItem・UpdateItem などを使う関数）', () => {
    // calendarRepository の書き込み系の関数を直接 import しているかを確かめる
    expect(SRC).not.toMatch(/from '.*calendarRepository'.*(?:saveDuty|updateDuty|saveMonthState)/);
    expect(SRC).not.toMatch(/import.*recordingService/);
  });

  it('書き込みの命令は 0 回（実行時の見張り）', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    w.done({ date: dateOf(1) });
    await getAllowances(asRead(ctxAdmin()), MONTH);
    expect(totalWrites(w.world)).toBe(0);
    w.world.mock.reset();
  });

  it('fetch は 0 回（実行時の見張り）', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      w.world.mock.reset();
      vi.unstubAllGlobals();
    }
  });
});
