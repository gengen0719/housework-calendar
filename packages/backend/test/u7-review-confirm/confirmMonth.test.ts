import { afterEach, describe, expect, it, vi } from 'vitest';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as calendarRepository from '../../src/repositories/calendarRepository';
import { confirmMonth, unconfirmMonth } from '../../src/services/calendarService';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import {
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  adminId,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  storedMonthState,
} from './helpers/seed';
import { FAKE_U7_DUTY_ID_A, FAKE_U7_DUTY_ID_B } from '../fixtures/fakeSecrets';

const MONTH = '2027-01';
const NOW = new Date('2027-02-01T11:00:00.000Z');
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: adminId(), role: 'admin' };

function world(): ReturnType<typeof setupWorld> {
  const w = setupWorld();
  process.env.ENTRY = 'api';
  seedHouseholdWithPrices(w);
  resetDutyReassignedHooks();
  return w;
}

describe('confirmMonth（C8。BR8.11、BR8.14〜BR8.16、NFR2.46）', () => {
  afterEach(() => {
    resetDutyReassignedHooks();
    vi.restoreAllMocks();
  });

  it('行のない月は version=1 の確定行を作る', async () => {
    const w = world();
    await confirmMonth(ctx, MONTH, { now: NOW });
    expect(storedMonthState(w.calendar, MONTH)).toMatchObject({
      confirmed: true,
      confirmedByUserId: adminId(),
      version: 1,
    });
  });

  it('行がある月は Update でそろえる', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: false, version: 2 });
    await confirmMonth(ctx, MONTH, { now: NOW });
    expect(storedMonthState(w.calendar, MONTH)).toMatchObject({ confirmed: true, version: 3 });
  });

  it('すでに確定済みでも同じ結果（冪等・二度押し）', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: true, version: 1 });
    await confirmMonth(ctx, MONTH, { now: NOW });
    expect(storedMonthState(w.calendar, MONTH)).toMatchObject({ confirmed: true, version: 2 });
  });

  describe('書き込みの呼び出し回数（偽の DynamoDB が受けた PutItem と UpdateItem を数える。NFR7.35）', () => {
    const writes = (
      w: ReturnType<typeof setupWorld>,
    ): { put: number; update: number; total: number } => {
      const put = w.mock.commandCalls(PutCommand).length;
      const update = w.mock.commandCalls(UpdateCommand).length;
      return { put, update, total: put + update };
    };

    it('行のない月の確定は Put 1 回だけ', async () => {
      const w = world();
      await confirmMonth(ctx, MONTH, { now: NOW });
      expect(writes(w)).toEqual({ put: 1, update: 0, total: 1 });
    });

    it('行がある月の確定は Put が競合して Update、合わせて 2 回', async () => {
      const w = world();
      seedMonthState(w.calendar, { month: MONTH, confirmed: false, version: 0 });
      await confirmMonth(ctx, MONTH, { now: NOW });
      expect(writes(w)).toEqual({ put: 1, update: 1, total: 2 });
      expect(writes(w).total).toBeLessThanOrEqual(2);
    });

    it('取り消し（行あり）は Update 1 回', async () => {
      const w = world();
      seedMonthState(w.calendar, { month: MONTH, confirmed: true, version: 1 });
      await unconfirmMonth(ctx, MONTH);
      expect(writes(w)).toEqual({ put: 0, update: 1, total: 1 });
    });

    it('取り消し（行なし）は Update を 1 回試みるだけで行は作られない（Put は 0 回）', async () => {
      const w = world();
      await unconfirmMonth(ctx, MONTH);
      expect(writes(w).put).toBe(0);
      expect(writes(w).update).toBeLessThanOrEqual(1);
      expect(storedMonthState(w.calendar, MONTH)).toBeUndefined();
    });

    it('数え方が効いている: 余分な書き込みを足すと「2 回以内」が落ちる', async () => {
      const w = world();
      seedMonthState(w.calendar, { month: MONTH, confirmed: false, version: 0 });
      await confirmMonth(ctx, MONTH, { now: NOW });
      await confirmMonth(ctx, MONTH, { now: NOW }); // 二度押し: 合わせて 4 回
      expect(writes(w).total).toBeGreaterThan(2);
    });
  });

  it('書き込みのあとの読み取りが例外でも、確定は成功し、警告に名前・単価を書かない（フックは呼ばない）', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: FAKE_U7_DUTY_ID_A,
      date: '2027-01-05',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
    });
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((l: unknown) => void lines.push(String(l)));
    }
    vi.spyOn(calendarRepository, 'loadMonth').mockRejectedValue(
      new Error('読み取りの失敗（太郎 120 円 皿洗い）'),
    );
    const events: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void events.push(e));
    await expect(confirmMonth(ctx, MONTH, { now: NOW })).resolves.toBeUndefined();
    expect(storedMonthState(w.calendar, MONTH)).toMatchObject({ confirmed: true });
    expect(events).toHaveLength(0);
    const warned = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === 'CONFIRM_POST_READ_FAILED');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ familyId: FAMILY_ID, month: MONTH });
    for (const line of lines) {
      expect(line).not.toContain('太郎');
      expect(line).not.toContain('皿洗い');
      expect(line).not.toContain('120');
    }
  });

  it('成功後、その月で「未」の担当を status-changed の 1 件ずつで notifyDutyReassigned を 1 回', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: FAKE_U7_DUTY_ID_A,
      date: '2027-01-05',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
    });
    seedDoneDuty(w.calendar, {
      dutyId: FAKE_U7_DUTY_ID_B,
      date: '2027-01-06',
      choreTypeId: choreId('laundry'),
      childUserId: childId('hanako'),
      recordedAt: '2027-01-06T10:00:00.000Z',
      recordedBy: childId('hanako'),
      unitPrice: 80,
    });
    const events: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void events.push(e));
    await confirmMonth(ctx, MONTH, { now: NOW });
    // 「未」の 1 件だけ（済の担当は渡さない）
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      dutyId: FAKE_U7_DUTY_ID_A,
      kind: 'status-changed',
      fromChildUserId: childId('taro'),
    });
  });

  it('「未」が無ければ notifyDutyReassigned を呼ばない', async () => {
    world();
    const events: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void events.push(e));
    await confirmMonth(ctx, MONTH, { now: NOW });
    expect(events).toHaveLength(0);
  });

  it('MONTH_CONFIRMED_SET（confirmed=true）を残す', async () => {
    world();
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: unknown) => void lines.push(String(l)));
    await confirmMonth(ctx, MONTH, { now: NOW });
    const set = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === 'MONTH_CONFIRMED_SET');
    expect(set[0]).toMatchObject({ month: MONTH, confirmed: true });
  });
});

describe('unconfirmMonth（C8。BR8.12、BR8.14）', () => {
  afterEach(() => {
    resetDutyReassignedHooks();
    vi.restoreAllMocks();
  });

  it('行がある月は confirmed=false にする', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: true, version: 3 });
    await unconfirmMonth(ctx, MONTH);
    const row = storedMonthState(w.calendar, MONTH)!;
    expect(row.confirmed).toBe(false);
    expect(row.confirmedAt).toBeUndefined();
    expect(row.version).toBe(4);
  });

  it('行のない月は何もしない（行を作らない）', async () => {
    const w = world();
    await unconfirmMonth(ctx, MONTH);
    expect(storedMonthState(w.calendar, MONTH)).toBeUndefined();
  });

  it('確定していなくても同じ結果（冪等）', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: false, version: 2 });
    await unconfirmMonth(ctx, MONTH);
    expect(storedMonthState(w.calendar, MONTH)).toMatchObject({ confirmed: false, version: 3 });
  });

  it('notifyDutyReassigned を呼ばない（取り下げるのは確定のときだけ）', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: true, version: 1 });
    seedDuty(w.calendar, {
      dutyId: FAKE_U7_DUTY_ID_A,
      date: '2027-01-05',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
    });
    const events: DutyReassignedEvent[] = [];
    onDutyReassigned(async (e) => void events.push(e));
    await unconfirmMonth(ctx, MONTH);
    expect(events).toHaveLength(0);
  });

  it('MONTH_CONFIRMED_SET（confirmed=false）を残す', async () => {
    const w = world();
    seedMonthState(w.calendar, { month: MONTH, confirmed: true, version: 1 });
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: unknown) => void lines.push(String(l)));
    await unconfirmMonth(ctx, MONTH);
    const set = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === 'MONTH_CONFIRMED_SET');
    expect(set[0]).toMatchObject({ month: MONTH, confirmed: false });
  });
});
