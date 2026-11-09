import type { DutyOrigin } from '../models';
import { describeError, logger } from '../lib/logger';

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
  kind: 'child-changed' | 'deleted';
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
 * 登録された関数を、担当ごとに順に await して呼ぶ。書けたあとに呼ぶこと。
 * 関数が投げても保存の結果は変えない。DUTY_HOOK_FAILED（警告）を残す。
 */
export async function notifyDutyReassigned(events: readonly DutyReassignedEvent[]): Promise<void> {
  for (const event of events) {
    for (const hook of hooks) {
      try {
        await hook(event);
      } catch (error) {
        logger.warn({
          event: 'DUTY_HOOK_FAILED',
          familyId: event.familyId,
          dutyId: event.dutyId,
          ...describeError(error),
        });
      }
    }
  }
}
