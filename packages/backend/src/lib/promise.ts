/**
 * Promise を待たずに走らせ、結果を「成功か失敗か」の形で受け取る小さな道具（U6）。
 *
 * reliability-design.md の「名前の Query の置き方」で使う。担当の探索と並行して
 * choreTypeService.list を始め、待つのは返事を作る直前だけにする。待たずに終わる経路
 * （MONTH_CONFIRMED など）で、失敗が「未処理の拒否（unhandled rejection）」にならないよう、
 * あらかじめ .catch を付けた Promise にして保持する。
 */

/** settle が返す結果。失敗の中身（error）は投げ直す側が判断するので unknown。 */
export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Promise を「成功か失敗か」の形に包む。包んだ Promise は必ず解決し、拒否にはならない
 * （内側で .catch 済み）ので、結果をすぐ待たなくても「未処理の拒否」が出ない。
 */
export function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value): Settled<T> => ({ ok: true, value }),
    (error: unknown): Settled<T> => ({ ok: false, error }),
  );
}

export interface MapWithConcurrencyOptions {
  /**
   * 真のとき、worker が 1 件でも投げたら、まだ始めていない項目を取り出さない（投げたエラーは呼び出し側へ）。
   * 既定は偽（従来どおり。worker が投げない U8 のフックの動きは変わらない）。
   */
  stopAfterFailure?: boolean;
}

/**
 * items を最大 limit 件ずつ並行して処理する（U8 の dutyReassignedHook から移した。ADR-U9-04）。
 * 既定では 1 件の失敗は worker の中で扱い、ほかを止めない。依存は入れない（自前の小さな関数。NFR8.16）。
 */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  options: MapWithConcurrencyOptions = {},
): Promise<void> {
  let next = 0;
  let failed = false;
  const lane = async (): Promise<void> => {
    while (next < items.length && !(options.stopAfterFailure && failed)) {
      const item = items[next++] as T; // 単一スレッドなので取り合いは起きない
      try {
        await worker(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const lanes = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
  await Promise.all(Array.from({ length: lanes }, lane));
}
