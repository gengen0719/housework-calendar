import { describeError, logger } from '../lib/logger';

/**
 * 担当が「済」になったことを伝える仕組み（C8 の中。BR7.14、NFR2.39、reliability-design.md）。
 * U8 が「代わりにやる」の申し出の取り下げに使う。U8 が入るまでは何も登録されず、何もしない。
 * U5 の dutyReassignedHook と同じ作り。
 */
export interface DutyRecordedEvent {
  familyId: string;
  dutyId: string;
  /** 日本時間の YYYY-MM-DD */
  date: string;
  choreTypeId: string;
  childUserId: string;
}

export type DutyRecordedHook = (event: DutyRecordedEvent) => Promise<void>;

let hooks: DutyRecordedHook[] = [];

/** 担当が「済」になったときに呼ぶ関数を登録する。 */
export function onDutyRecorded(hook: DutyRecordedHook): void {
  hooks = [...hooks, hook];
}

/** 登録した関数を空にする（テスト用）。 */
export function resetDutyRecordedHooks(): void {
  hooks = [];
}

/**
 * 登録された関数を順に await して呼ぶ。取引が written を返したあと、その 1 回だけ呼ぶこと。
 * 関数が投げても記録の結果は変えない。DUTY_RECORDED_HOOK_FAILED（警告。名前は書かない）を残す。
 */
export async function notifyDutyRecorded(event: DutyRecordedEvent): Promise<void> {
  for (const hook of hooks) {
    try {
      await hook(event);
    } catch (error) {
      logger.warn({
        event: 'DUTY_RECORDED_HOOK_FAILED',
        familyId: event.familyId,
        dutyId: event.dutyId,
        ...describeError(error),
      });
    }
  }
}
