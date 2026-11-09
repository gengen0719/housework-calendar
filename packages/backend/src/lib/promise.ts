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
