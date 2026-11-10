import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DUTY_HOOK_CONCURRENCY,
  notifyDutyReassigned,
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
  type DutyReassignedHook,
} from '../../src/services/dutyReassignedHook';
import { FAKE_CHILD_USER_ID_1, FAKE_CHORE_TYPE_ID_1, fakeU8DutyId } from '../fixtures/fakeSecrets';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const events = (count: number): DutyReassignedEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    familyId: 'fam-yamada',
    dutyId: fakeU8DutyId(i),
    date: '2027-01-05',
    choreTypeId: FAKE_CHORE_TYPE_ID_1,
    kind: 'status-changed',
    fromChildUserId: FAKE_CHILD_USER_ID_1,
  }));

let lines: Record<string, unknown>[];

beforeEach(() => {
  lines = [];
  resetDutyReassignedHooks();
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    lines.push(JSON.parse(String(line)) as Record<string, unknown>);
  });
});
afterEach(() => {
  resetDutyReassignedHooks();
  vi.restoreAllMocks();
});

describe('notifyDutyReassigned の並行（BR9.11、NFR3.15）', () => {
  it('同時に動く関数の最大が DUTY_HOOK_CONCURRENCY を超えない', async () => {
    let running = 0;
    let max = 0;
    onDutyReassigned(async () => {
      running += 1;
      max = Math.max(max, running);
      await sleep(1);
      running -= 1;
    });
    await notifyDutyReassigned(events(40));
    expect(max).toBe(DUTY_HOOK_CONCURRENCY);
  });

  it('関数が複数あっても、全イベントに全関数が 1 回ずつ呼ばれる', async () => {
    const calls = new Map<string, number>();
    const hook =
      (name: string): DutyReassignedHook =>
      async (e) => {
        calls.set(`${name}:${e.dutyId}`, (calls.get(`${name}:${e.dutyId}`) ?? 0) + 1);
      };
    onDutyReassigned(hook('a'));
    onDutyReassigned(hook('b'));
    await notifyDutyReassigned(events(25));
    expect(calls.size).toBe(50);
    expect([...calls.values()].every((n) => n === 1)).toBe(true);
  });

  it('一部の関数が投げても、同じイベントの次の関数も呼ばれる', async () => {
    const second: string[] = [];
    onDutyReassigned(async () => {
      throw new Error('失敗');
    });
    onDutyReassigned(async (e) => void second.push(e.dutyId));
    await notifyDutyReassigned(events(6));
    expect(second).toHaveLength(6);
    const done = lines.find((l) => l.event === 'DUTY_HOOKS_DONE');
    expect(done).toMatchObject({ count: 6, failed: 6, concurrency: DUTY_HOOK_CONCURRENCY });
  });

  it('DUTY_HOOKS_DONE は 1 回の呼び出しにつき 1 件で、familyId と durationMs を持つ', async () => {
    onDutyReassigned(async () => undefined);
    await notifyDutyReassigned(events(12));
    const done = lines.filter((l) => l.event === 'DUTY_HOOKS_DONE');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ level: 'info', familyId: 'fam-yamada', count: 12 });
    expect(typeof done[0]?.durationMs).toBe('number');
  });

  it('型は変わっていない（events は読み取り専用の配列、戻りは Promise<void>）', async () => {
    onDutyReassigned(async () => undefined);
    const result: Promise<void> = notifyDutyReassigned(events(1) as readonly DutyReassignedEvent[]);
    await expect(result).resolves.toBeUndefined();
    // @ts-expect-error events は配列でなければならない（1 件だけを直接は渡せない）
    await notifyDutyReassigned(events(1)[0]).catch(() => undefined);
    // @ts-expect-error kind は決まった 3 つだけ
    const bad: DutyReassignedEvent['kind'] = 'unknown';
    expect(bad).toBe('unknown');
  });
});
