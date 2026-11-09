import { afterEach, describe, expect, it, vi } from 'vitest';
import { recordDuty } from '../../src/services/recordingService';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import { logger } from '../../src/lib/logger';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  setUnitPrice,
  storedDuty,
} from './helpers/seed';
import { FAKE_U6_DUTY_ID_A } from '../fixtures/fakeSecrets';

const TODAY = '2027-01-07';
const NOW = new Date('2027-01-07T07:42:00.000Z');
const DUTY_ID = FAKE_U6_DUTY_ID_A;

const ctx: FamilyContext = { familyId: FAMILY_ID, userId: childId('taro'), role: 'child' };

describe('recordDuty（C8。BR7.4〜BR7.8、BR7.17）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function world(): ReturnType<typeof setupWorld> {
    const w = setupWorld();
    process.env.ENTRY = 'line';
    seedHouseholdWithPrices(w);
    return w;
  }

  it('二重押しは判定の 3.（本人が記録済み）で止まり、version の比べより先に効く', async () => {
    const w = world();
    // version が古い（担当は version 2 だが、要求は version 1）。それでも「済」で本人なので成功
    seedDoneDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      recordedAt: NOW.toISOString(),
      recordedBy: childId('taro'),
      unitPrice: 100,
    });
    // version を 2 にしておく（古い version 1 で押す）
    const row = storedDuty(w.calendar, TODAY, choreId('dishes'));
    if (row)
      w.calendar.set(`${FAMILY_ID}#M#2027-01#D#${TODAY}#${choreId('dishes')}`, {
        ...row,
        version: 2,
      });

    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyRecorded).toBe(true);
    // 書き込みは起きない
    expect(w.hooks.transactionSizes).toHaveLength(0);
  });

  it('管理者が先に「済」にしていると DUTY_ALREADY_DONE', async () => {
    const w = world();
    seedDoneDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      recordedAt: NOW.toISOString(),
      recordedBy: PEOPLE.mother.userId,
      unitPrice: 100,
    });
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result).toEqual({ ok: false, reason: 'DUTY_ALREADY_DONE' });
  });

  it('ほかの子供の担当は NOT_OWN_DUTY（version より先）', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('hanako'),
      status: 'todo',
      version: 5,
    });
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result).toEqual({ ok: false, reason: 'NOT_OWN_DUTY' });
  });

  it('2 回続けて取引が断られると INTERNAL（書き込みは 2 回で止まる）', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    w.hooks.failTransaction(1, 'ConditionalCheckFailed');
    w.hooks.failTransaction(2, 'ConditionalCheckFailed');
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(w.hooks.transactionSizes).toHaveLength(2);
    expect(storedDuty(w.calendar, TODAY, choreId('dishes'))?.status).toBe('todo');
  });

  it('成功したら DUTY_RECORDED をログに残す（alreadyRecorded=false）', async () => {
    const w = world();
    const info = vi.spyOn(logger, 'info');
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    const recorded = info.mock.calls.map((c) => c[0]).find((d) => d.event === 'DUTY_RECORDED');
    expect(recorded).toMatchObject({
      event: 'DUTY_RECORDED',
      alreadyRecorded: false,
      route: 'line',
    });
  });

  it('単価が取引の直前に変わると読み直して新しい単価で記録（競合の c 型）', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    w.hooks.beforeTransaction(1, () => setUnitPrice(w.choreTypes, choreId('dishes'), 150));
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result.ok).toBe(true);
    expect(storedDuty(w.calendar, TODAY, choreId('dishes'))?.unitPrice).toBe(150);
    expect(w.hooks.transactionSizes).toHaveLength(2);
  });

  it('画面（todayOnly=false）は今日でない過去の担当も記録できる', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: '2026-12-20',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: false, now: NOW, route: 'api' });
    expect(result.ok).toBe(true);
  });

  it('LINE（todayOnly=true）は今日でない担当は NOT_TODAY_DUTY', async () => {
    const w = world();
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: '2026-12-20',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    const result = await recordDuty(ctx, DUTY_ID, 1, { todayOnly: true, now: NOW, route: 'line' });
    expect(result).toEqual({ ok: false, reason: 'NOT_TODAY_DUTY' });
  });
});
