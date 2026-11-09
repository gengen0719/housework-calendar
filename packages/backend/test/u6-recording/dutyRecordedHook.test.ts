import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDutyRecorded,
  onDutyRecorded,
  resetDutyRecordedHooks,
  type DutyRecordedEvent,
} from '../../src/services/dutyRecordedHook';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_U6_DUTY_ID_A,
} from '../fixtures/fakeSecrets';

const event: DutyRecordedEvent = {
  familyId: 'fam-yamada',
  dutyId: FAKE_U6_DUTY_ID_A,
  date: '2027-01-07',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  childUserId: FAKE_CHILD_USER_ID_1,
};

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  resetDutyRecordedHooks();
});
afterEach(() => {
  resetDutyRecordedHooks();
  vi.restoreAllMocks();
});

const failures = (): Record<string, unknown>[] =>
  lines
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.event === 'DUTY_RECORDED_HOOK_FAILED');

describe('onDutyRecorded（記録を伝える仕組み。BR7.14、NFR2.39）', () => {
  it('何も登録されていなければ、何もしない', async () => {
    await expect(notifyDutyRecorded(event)).resolves.toBeUndefined();
    expect(lines).toEqual([]);
  });

  it('登録した関数を、担当の情報つきで呼ぶ', async () => {
    const received: DutyRecordedEvent[] = [];
    onDutyRecorded(async (e) => void received.push(e));
    await notifyDutyRecorded(event);
    expect(received).toEqual([event]);
  });

  it('複数の関数を登録した順に呼ぶ', async () => {
    const calls: string[] = [];
    onDutyRecorded(async () => void calls.push('first'));
    onDutyRecorded(async () => void calls.push('second'));
    await notifyDutyRecorded(event);
    expect(calls).toEqual(['first', 'second']);
  });

  it('関数が投げても結果を変えず、DUTY_RECORDED_HOOK_FAILED（警告）を残す', async () => {
    const calls: string[] = [];
    onDutyRecorded(async () => {
      throw new Error('取り下げに失敗');
    });
    onDutyRecorded(async (e) => void calls.push(e.dutyId));
    await expect(notifyDutyRecorded(event)).resolves.toBeUndefined();
    // 投げても後続のフックは呼ばれる
    expect(calls).toEqual([FAKE_U6_DUTY_ID_A]);
    expect(failures()).toHaveLength(1);
    expect(failures()[0]).toMatchObject({
      level: 'warn',
      dutyId: FAKE_U6_DUTY_ID_A,
      familyId: 'fam-yamada',
    });
  });

  it('警告に LINE のユーザー ID・種類の名前・子供の ID を書かない', async () => {
    onDutyRecorded(async () => {
      throw new Error('失敗');
    });
    await notifyDutyRecorded(event);
    const line = JSON.stringify(failures()[0]);
    expect(line).not.toContain(FAKE_CHILD_USER_ID_1);
    expect(line).not.toContain(FAKE_CHORE_TYPE_ID_1);
  });

  it('リセットすると登録が空になる（1 回だけ呼ぶの土台）', async () => {
    const hook = vi.fn(async () => undefined);
    onDutyRecorded(hook);
    resetDutyRecordedHooks();
    await notifyDutyRecorded(event);
    expect(hook).not.toHaveBeenCalled();
  });
});
