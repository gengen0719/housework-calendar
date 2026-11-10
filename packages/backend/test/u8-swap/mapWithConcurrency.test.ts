import { describe, expect, it } from 'vitest';
import {
  clampConcurrency,
  DUTY_HOOK_CONCURRENCY,
  mapWithConcurrency,
} from '../../src/services/dutyReassignedHook';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 同時に動いた最大数を数えながら、全件を処理する */
async function run(count: number, limit: number): Promise<{ max: number; seen: number[] }> {
  let running = 0;
  let max = 0;
  const seen: number[] = [];
  await mapWithConcurrency(
    Array.from({ length: count }, (_, i) => i),
    limit,
    async (item) => {
      running += 1;
      max = Math.max(max, running);
      await sleep(1);
      seen.push(item);
      running -= 1;
    },
  );
  return { max, seen };
}

describe('mapWithConcurrency（BR9.11、NFR3.15）', () => {
  it.each([1, 2, 4, 5])('上限 %i のとき、同時に動く数が上限を超えない', async (limit) => {
    const { max, seen } = await run(20, limit);
    expect(max).toBe(limit);
    expect(seen).toHaveLength(20);
  });

  it('件数が上限より少ないときは、件数だけ並行する', async () => {
    expect((await run(3, 5)).max).toBe(3);
  });

  it('空の一覧では worker を呼ばない', async () => {
    const { max, seen } = await run(0, 4);
    expect(max).toBe(0);
    expect(seen).toEqual([]);
  });

  it('全件が 1 回ずつ処理される（順序は並行なので問わない）', async () => {
    const { seen } = await run(30, 4);
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it('worker が自分で失敗を扱えば、ほかの件は止まらない', async () => {
    const done: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      try {
        if (n === 2) throw new Error('失敗');
        done.push(n);
      } catch {
        // 呼び出し側で扱う形
      }
    });
    expect(done.sort()).toEqual([1, 3, 4, 5]);
  });

  it('上限が 0 や数でないときも、少なくとも 1 件ずつ全件を処理する', async () => {
    expect((await run(5, 0)).seen).toHaveLength(5);
    expect((await run(5, Number.NaN)).seen).toHaveLength(5);
  });
});

describe('clampConcurrency（範囲は 2〜5）', () => {
  it('範囲の中はそのまま、外は 2〜5 に丸める', () => {
    expect(clampConcurrency(2)).toBe(2);
    expect(clampConcurrency(4)).toBe(4);
    expect(clampConcurrency(5)).toBe(5);
    expect(clampConcurrency(0)).toBe(2);
    expect(clampConcurrency(1)).toBe(2);
    expect(clampConcurrency(6)).toBe(5);
    expect(clampConcurrency(100)).toBe(5);
    expect(clampConcurrency(3.9)).toBe(3);
  });

  it('数でない値は既定の 4 になり、既定の定数は範囲の中にある', () => {
    expect(clampConcurrency(Number.NaN)).toBe(DUTY_HOOK_CONCURRENCY);
    expect(DUTY_HOOK_CONCURRENCY).toBe(4);
  });
});
