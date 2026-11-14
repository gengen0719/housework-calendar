import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '../../src/lib/promise';

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

describe('lib/promise の mapWithConcurrency（NFR3.18、ADR-U9-04）', () => {
  it.each([1, 2, 4, 10])('上限 %i のとき、同時に動く数が上限を超えない', async (limit) => {
    const { max, seen } = await run(12, limit);
    expect(max).toBeLessThanOrEqual(limit);
    expect(seen).toHaveLength(12);
  });

  it('件数が上限より少ないときは、件数まで同時に動く', async () => {
    const { max } = await run(3, 10);
    expect(max).toBe(3);
  });

  it('空の一覧では worker を呼ばずに終わる', async () => {
    let called = 0;
    await mapWithConcurrency([], 4, async () => {
      called += 1;
    });
    expect(called).toBe(0);
  });

  it('上限 1 のときは入力の順に 1 件ずつ処理する', async () => {
    const { seen } = await run(5, 1);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('旗を立てないとき、worker が投げない限り全件が呼ばれる（従来の動き）', async () => {
    const calls: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      calls.push(n);
    });
    expect(calls.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('stopAfterFailure を立てると、1 件が投げたあと、まだ始めていない項目を始めない', async () => {
    const started: number[] = [];
    await expect(
      mapWithConcurrency(
        [1, 2, 3, 4, 5, 6],
        1,
        async (n) => {
          started.push(n);
          if (n === 2) throw new Error('失敗');
        },
        { stopAfterFailure: true },
      ),
    ).rejects.toThrow('失敗');
    expect(started).toEqual([1, 2]);
  });

  it('stopAfterFailure を立てても、成功のうちは全件を処理する', async () => {
    const started: number[] = [];
    await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (n) => {
        started.push(n);
      },
      { stopAfterFailure: true },
    );
    expect(started.sort()).toEqual([1, 2, 3]);
  });
});
