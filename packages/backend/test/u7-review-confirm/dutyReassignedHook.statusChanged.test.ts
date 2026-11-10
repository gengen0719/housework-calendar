import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDutyReassigned,
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_U7_DUTY_ID_A,
} from '../fixtures/fakeSecrets';

/** status-changed のイベント（U7）。1 つの担当の形（fromChildUserId 必須）を崩さない。 */
const event: DutyReassignedEvent = {
  familyId: 'fam-yamada',
  dutyId: FAKE_U7_DUTY_ID_A,
  date: '2027-01-05',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  kind: 'status-changed',
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

const failures = (): Record<string, unknown>[] =>
  lines
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((l) => l.event === 'DUTY_HOOK_FAILED');

describe('onDutyReassigned の kind: status-changed（U7。BR8.15、NFR2.50）', () => {
  it('status-changed のイベントは fromChildUserId を必須で持つ（1 つの担当の形）', () => {
    // 型で確かめる: fromChildUserId を欠くと型エラー
    // @ts-expect-error fromChildUserId は status-changed でも必須（R-01）
    const missing: DutyReassignedEvent = {
      familyId: 'fam',
      dutyId: FAKE_U7_DUTY_ID_A,
      date: '2027-01-05',
      choreTypeId: FAKE_CHORE_TYPE_ID_1,
      kind: 'status-changed',
    };
    void missing;
    expect(event.fromChildUserId).toBe(FAKE_CHILD_USER_ID_1);
  });

  it('何も登録されていなければ、何もしない', async () => {
    await expect(notifyDutyReassigned([event])).resolves.toBeUndefined();
    expect(lines).toEqual([]);
  });

  it('登録した関数を status-changed のイベントつきで呼ぶ', async () => {
    const received: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void received.push(e));
    await notifyDutyReassigned([event]);
    expect(received).toEqual([event]);
    expect(received[0]?.kind).toBe('status-changed');
  });

  it('一覧（複数の担当）を順に渡せる（月の確定で担当ごとに 1 件）', async () => {
    const received: string[] = [];
    onDutyReassigned(async (e) => void received.push(e.dutyId));
    const second: DutyReassignedEvent = { ...event, dutyId: 'd2' };
    await notifyDutyReassigned([event, second]);
    expect(received).toEqual([FAKE_U7_DUTY_ID_A, 'd2']);
  });

  it('関数が投げても結果を変えず、DUTY_HOOK_FAILED（警告）を残す', async () => {
    const calls: string[] = [];
    onDutyReassigned(async () => {
      throw new Error('取り下げに失敗');
    });
    onDutyReassigned(async (e) => void calls.push(e.dutyId));
    await expect(notifyDutyReassigned([event])).resolves.toBeUndefined();
    expect(calls).toEqual([FAKE_U7_DUTY_ID_A]);
    expect(failures()).toHaveLength(1);
    expect(failures()[0]).toMatchObject({
      level: 'warn',
      dutyId: FAKE_U7_DUTY_ID_A,
      kind: 'status-changed',
      familyId: 'fam-yamada',
    });
  });

  it('警告には dutyId・kind だけで、名前・子供の ID・単価を書かない（NFR2.50）', async () => {
    onDutyReassigned(async () => {
      throw new Error('失敗');
    });
    await notifyDutyReassigned([event]);
    const line = JSON.stringify(failures()[0]);
    expect(line).not.toContain(FAKE_CHILD_USER_ID_1);
    expect(line).not.toContain(FAKE_CHORE_TYPE_ID_1);
    expect(line).toContain('status-changed');
  });

  it('登録がなければ、投げるイベントでも何も起きない', async () => {
    await expect(notifyDutyReassigned([event])).resolves.toBeUndefined();
    expect(failures()).toHaveLength(0);
  });

  it('既存の child-changed・deleted の形は変わらない（U5 の互換）', async () => {
    const received: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void received.push(e));
    const childChanged: DutyReassignedEvent = {
      ...event,
      kind: 'child-changed',
      toChildUserId: 'u2',
      newOrigin: 'manual',
    };
    const deleted: DutyReassignedEvent = { ...event, kind: 'deleted' };
    await notifyDutyReassigned([childChanged, deleted]);
    expect(received[0]?.kind).toBe('child-changed');
    expect(received[0]?.toChildUserId).toBe('u2');
    expect(received[1]?.kind).toBe('deleted');
  });
});
