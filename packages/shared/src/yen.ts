/**
 * 金額の表示（U9。BR10.5）。標準の `Intl.NumberFormat('ja-JP')` だけを使い、新しい依存は足さない。
 * マイナスは `Intl` の記号に頼らず、半角のハイフンを前に付ける（環境で別の記号になることを避ける）。
 */

/** 整形のインスタンスはモジュールの先頭で 1 つだけ作る（呼ぶたびに作らない） */
const YEN_FORMAT = new Intl.NumberFormat('ja-JP', { useGrouping: true, maximumFractionDigits: 0 });

/** 円の整数を「1,400円」「-200円」の形にする。整数でないとき（小数・NaN・Infinity）は投げる */
export function formatYen(amount: number): string {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
    throw new RangeError('金額は整数で指定してください');
  }
  const absolute = YEN_FORMAT.format(Math.abs(amount));
  return `${amount < 0 ? '-' : ''}${absolute}円`;
}
