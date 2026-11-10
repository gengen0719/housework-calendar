/**
 * U8 のサービスの筋書き・単体テストで共通に使う小さな道具。
 * 呼び出し元（文脈）の作り方、固定の「今」、ログの集め方だけを置く。
 */
import { vi } from 'vitest';
import type { FamilyContext } from '../../../src/middleware/requireMembership';
import { FAMILY_ID, PEOPLE, childId } from './seed';

/** 固定の「今」。2027-01-08 12:00（日本時間）。 */
export const NOW = new Date('2027-01-08T03:00:00.000Z');
/** NOW の日本時間の今日。 */
export const TODAY = '2027-01-08';

export type SwapActor = 'taro' | 'hanako' | 'jiro' | 'mother';

/** 呼び出し元の文脈（家族・利用者・役割）。 */
export function ctxOf(actor: SwapActor, familyId: string = FAMILY_ID): FamilyContext {
  if (actor === 'mother') return { familyId, userId: PEOPLE.mother.userId, role: 'admin' };
  return { familyId, userId: childId(actor), role: 'child' };
}

/** 利用者の ID。 */
export const userIdOf = (actor: SwapActor): string =>
  actor === 'mother' ? PEOPLE.mother.userId : childId(actor);

/** console.log に出る JSON のログ行を集める。 */
export function captureLogs(): {
  lines: Record<string, unknown>[];
  rows: (event: string) => Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    try {
      lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    } catch {
      // JSON でない行は集めない
    }
  });
  return { lines, rows: (event) => lines.filter((l) => l.event === event) };
}
