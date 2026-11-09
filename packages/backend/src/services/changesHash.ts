import { createHash } from 'node:crypto';
import type { HashedChange } from './assignmentPlanner';

/**
 * 上書きの確かめの印（NFR4.51、security-design.md）。
 * 入力をコピーして、日付の順、同じ日は種類の ID の順（文字列の辞書順）に並べ、
 * 各行を `[date, choreTypeId, fromChildUserId, toChildUserId, version]` の配列にして、
 * `[familyId, month, rows]` を JSON にした文字列の SHA-256 を 16 進数 64 文字で返す。入力の順番には左右されない。
 * 鍵のない計算なので、改ざんを防ぐものではなく、管理者が見ていない一覧で上書きするのを防ぐための確認の印。
 */
export function computeChangesHash(
  familyId: string,
  month: string,
  changes: readonly HashedChange[],
): string {
  const rows = [...changes]
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? -1
          : 1
        : a.choreTypeId < b.choreTypeId
          ? -1
          : a.choreTypeId > b.choreTypeId
            ? 1
            : 0,
    )
    .map((change) => [
      change.date,
      change.choreTypeId,
      change.fromChildUserId,
      change.toChildUserId,
      change.version,
    ]);
  return createHash('sha256')
    .update(JSON.stringify([familyId, month, rows]))
    .digest('hex');
}
