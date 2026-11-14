import type { DutyOrigin } from '../models';
import { describeError, logger } from '../lib/logger';
import { mapWithConcurrency } from '../lib/promise';

/**
 * 担当の子供が変わった・担当が消えたことを伝える仕組み（C8 の中。BR6.6、reliability-design.md）。
 * U8 が「代わりにやる」の申し出の取り下げに使う。U8 が入るまでは何も登録されず、何もしない。
 */
export interface DutyReassignedEvent {
  familyId: string;
  dutyId: string;
  /** 日本時間の YYYY-MM-DD */
  date: string;
  choreTypeId: string;
  /**
   * 何が起きて担当が変わったか。U7 で `status-changed`（状態の変更・月の確定で担当が「未」でなくなった）を足す。
   * 月の確定も「その月で『未』でなくなった担当ごとに status-changed の 1 件」に展開するので、月単位の種類は作らない
   * （reliability-design.md の R-01）。
   */
  kind: 'child-changed' | 'deleted' | 'status-changed';
  /** 1 つの担当の形を崩さないため、どの kind でも必須（R-01） */
  fromChildUserId: string;
  /** kind が child-changed のときだけ */
  toChildUserId?: string;
  /** kind が child-changed のときだけ（rule か manual） */
  newOrigin?: Extract<DutyOrigin, 'rule' | 'manual'>;
}

export type DutyReassignedHook = (event: DutyReassignedEvent) => Promise<void>;

let hooks: DutyReassignedHook[] = [];

/** 担当が変わったときに呼ぶ関数を登録する。 */
export function onDutyReassigned(hook: DutyReassignedHook): void {
  hooks = [...hooks, hook];
}

/** 登録した関数を空にする（テスト用）。 */
export function resetDutyReassignedHooks(): void {
  hooks = [];
}

/**
 * 同時に呼ぶイベントの数（BR9.11、NFR3.15、performance-design.md の ADR-U8-01）。変えてよい範囲は 2〜5。
 * 5 にしてよいのは、測定で Calendar の WriteThrottleEvents が 0 のままのときだけ。
 */
export const DUTY_HOOK_CONCURRENCY = 4;
export const DUTY_HOOK_CONCURRENCY_MIN = 2;
export const DUTY_HOOK_CONCURRENCY_MAX = 5;

/** 並行数を 2〜5 の範囲に丸める（整数でない・数でない値は既定の 4）。 */
export function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DUTY_HOOK_CONCURRENCY;
  return Math.min(
    DUTY_HOOK_CONCURRENCY_MAX,
    Math.max(DUTY_HOOK_CONCURRENCY_MIN, Math.trunc(value)),
  );
}

/** 並行数の制限つきの処理は lib/promise に移した（U9）。U8 のテストのため、同じ名前で再び公開する。 */
export { mapWithConcurrency };

/** DUTY_HOOKS_DONE の kind: 1 種類なら文字列、混ざるときは種類ごとの件数（合計は count と一致）。 */
function summarizeKind(
  events: readonly DutyReassignedEvent[],
): DutyReassignedEvent['kind'] | Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  const kinds = Object.keys(counts);
  return kinds.length === 1 ? (kinds[0] as DutyReassignedEvent['kind']) : counts;
}

/**
 * 登録された関数を、イベントを DUTY_HOOK_CONCURRENCY 件ずつ並行して呼ぶ。書けたあとに呼ぶこと。
 * 1 つのイベントの中では、登録の順に await する（順序の意味を変えない）。
 * 関数が投げても保存の結果は変えず、残りも続ける。投げた件ごとに DUTY_HOOK_FAILED（警告）を残す
 * （familyId・dutyId・kind だけ。名前・単価は書かない。NFR2.50）。
 * 完了後に DUTY_HOOKS_DONE を 1 回だけ残す（登録も件数もなければ何も残さない）。
 * 締め切りによる打ち切り（DUTY_HOOKS_TRUNCATED）は段階 2 で、測定の結果が出るまで入れない。
 */
export async function notifyDutyReassigned(events: readonly DutyReassignedEvent[]): Promise<void> {
  if (events.length === 0 || hooks.length === 0) return;
  const startedAt = Date.now();
  const registered = hooks;
  const concurrency = clampConcurrency(DUTY_HOOK_CONCURRENCY);
  let failed = 0;
  await mapWithConcurrency(events, concurrency, async (event) => {
    for (const hook of registered) {
      try {
        await hook(event);
      } catch (error) {
        failed += 1;
        logger.warn({
          event: 'DUTY_HOOK_FAILED',
          familyId: event.familyId,
          dutyId: event.dutyId,
          kind: event.kind,
          ...describeError(error),
        });
      }
    }
  });
  logger.info({
    event: 'DUTY_HOOKS_DONE',
    familyId: (events[0] as DutyReassignedEvent).familyId,
    kind: summarizeKind(events),
    count: events.length,
    failed,
    concurrency,
    durationMs: Date.now() - startedAt,
  });
}

/** 段階 2（締め切りで打ち切る）で出す警告の項目。段階 1 では出さない（performance-design.md）。 */
export interface DutyHooksTruncatedLog {
  event: 'DUTY_HOOKS_TRUNCATED';
  familyId: string;
  /** 打ち切って呼ばなかった数 */
  skipped: number;
}
