import { describe, expect, it } from 'vitest';
import * as promiseLib from '../../src/lib/promise';
import * as hook from '../../src/services/dutyReassignedHook';

describe('dutyReassignedHook の再公開（NFR7.56、ADR-U9-04）', () => {
  it('mapWithConcurrency を同じ名前で、lib/promise と同じ関数として再公開している', () => {
    expect(hook.mapWithConcurrency).toBe(promiseLib.mapWithConcurrency);
  });

  it('clampConcurrency と DUTY_HOOK_CONCURRENCY の名前と値が変わらない', () => {
    expect(hook.DUTY_HOOK_CONCURRENCY).toBe(4);
    expect(hook.clampConcurrency(100)).toBe(5);
    expect(hook.clampConcurrency(0)).toBe(2);
    expect(typeof hook.notifyDutyReassigned).toBe('function');
  });

  it('旗を渡さない呼び出しでは、投げない worker の全件を呼ぶ（U8 の使い方）', async () => {
    const seen: number[] = [];
    await hook.mapWithConcurrency([1, 2, 3], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });
});
