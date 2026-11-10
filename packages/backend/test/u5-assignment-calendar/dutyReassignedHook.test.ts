import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDutyReassigned,
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_DUTY_ID_1,
  FAKE_DUTY_ID_2,
} from '../fixtures/fakeSecrets';

const changed: DutyReassignedEvent = {
  familyId: 'fam-yamada',
  dutyId: FAKE_DUTY_ID_1,
  date: '2027-01-18',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  kind: 'child-changed',
  fromChildUserId: FAKE_CHILD_USER_ID_1,
  toChildUserId: FAKE_CHILD_USER_ID_2,
  newOrigin: 'rule',
};
const deleted: DutyReassignedEvent = {
  familyId: 'fam-yamada',
  dutyId: FAKE_DUTY_ID_2,
  date: '2027-01-21',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  kind: 'deleted',
  fromChildUserId: FAKE_CHILD_USER_ID_1,
};

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  resetDutyReassignedHooks();
});
afterEach(() => {
  resetDutyReassignedHooks();
  vi.restoreAllMocks();
});

describe('onDutyReassigned（担当が変わったことを伝える仕組み）', () => {
  it('何も登録されていなければ、何もしない', async () => {
    await expect(notifyDutyReassigned([changed, deleted])).resolves.toBeUndefined();
    expect(lines).toEqual([]);
  });

  it('登録した関数を、担当ごとに await して呼ぶ（U8 から、別の担当どうしは並行してよい）', async () => {
    const order: string[] = [];
    onDutyReassigned(async (event) => {
      order.push(`start ${event.kind}`);
      await Promise.resolve();
      order.push(`end ${event.kind}`);
    });
    await notifyDutyReassigned([changed, deleted]);
    // 1 つの担当の中は start → end の順。別の担当どうしの前後は決めない（BR9.11）
    expect(order).toHaveLength(4);
    for (const kind of ['child-changed', 'deleted']) {
      expect(order.indexOf(`start ${kind}`)).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(`start ${kind}`)).toBeLessThan(order.indexOf(`end ${kind}`));
    }
  });

  it('複数の関数を登録した順に呼ぶ', async () => {
    const calls: string[] = [];
    onDutyReassigned(async () => void calls.push('first'));
    onDutyReassigned(async () => void calls.push('second'));
    await notifyDutyReassigned([deleted]);
    expect(calls).toEqual(['first', 'second']);
  });

  it('関数が投げても続けて、DUTY_HOOK_FAILED を残す', async () => {
    const calls: string[] = [];
    onDutyReassigned(async () => {
      throw new Error('取り下げに失敗');
    });
    onDutyReassigned(async (event) => void calls.push(event.dutyId));
    await expect(notifyDutyReassigned([changed, deleted])).resolves.toBeUndefined();
    expect(calls).toEqual([FAKE_DUTY_ID_1, FAKE_DUTY_ID_2]);
    const failures = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === 'DUTY_HOOK_FAILED');
    expect(failures).toHaveLength(2);
    expect(failures[0]).toMatchObject({ level: 'warn', dutyId: FAKE_DUTY_ID_1 });
  });

  it('リセットすると登録が空になる', async () => {
    const hook = vi.fn(async () => undefined);
    onDutyReassigned(hook);
    resetDutyReassignedHooks();
    await notifyDutyReassigned([changed]);
    expect(hook).not.toHaveBeenCalled();
  });
});
