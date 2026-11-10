import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as swap from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, FAKE_U8_OFFER_ID_2 } from '../fixtures/fakeSecrets';
import {
  childId,
  choreId,
  seedDuty,
  seedHouseholdWithPrices,
  seedOffer,
  storedOffer,
} from './helpers/seed';
import { captureLogs, ctxOf, NOW, userIdOf } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

let world: ReturnType<typeof installFakeDynamo>;
let logs: ReturnType<typeof captureLogs>;
beforeEach(() => {
  world = installFakeDynamo();
  logs = captureLogs();
  seedHouseholdWithPrices(world);
});
afterEach(() => {
  world.mock.reset();
  vi.restoreAllMocks();
});
const reasonOf = (r: { ok: true } | { ok: false; reason: string }): string =>
  r.ok ? 'ok' : r.reason;
const duty = (id: string, date: string, extra: Record<string, unknown> = {}): void =>
  seedDuty(world.calendar, {
    dutyId: id,
    date,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    version: 2,
    ...extra,
  });
const open = (id: string = FAKE_U8_DUTY_ID_A, offerId: string = FAKE_U8_OFFER_ID_1): void =>
  seedOffer(world.calendar, {
    dutyId: id,
    offerId,
    offererUserId: childId('taro'),
    dutyVersion: 2,
  });

describe('withdrawSwap', () => {
  const withdraw = (actor: 'taro' | 'hanako' | 'mother', offerId = FAKE_U8_OFFER_ID_1) =>
    swap.withdrawSwap(ctxOf(actor), FAKE_U8_DUTY_ID_A, offerId, { now: NOW });
  beforeEach(() => duty(FAKE_U8_DUTY_ID_A, '2027-01-12'));
  it('申し出た本人は取り下げられ、担当は変わらない', async () => {
    open();
    const r = await withdraw('taro');
    expect(r.ok && r.offerId).toBe(FAKE_U8_OFFER_ID_1);
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)).toMatchObject({ status: 'withdrawn' });
    expect(r.ok && r.duty.childUserId).toBe(userIdOf('taro'));
  });
  it('申し出がない・ID 違いは OFFER_GONE', async () => {
    expect(reasonOf(await withdraw('taro'))).toBe('OFFER_GONE');
    open();
    expect(reasonOf(await withdraw('taro', FAKE_U8_OFFER_ID_2))).toBe('OFFER_GONE');
  });
  it('取り下げ済み・自動でなくなったは OFFER_GONE（本人の判定より先）', async () => {
    for (const status of ['withdrawn', 'cancelled'] as const) {
      seedOffer(world.calendar, {
        dutyId: FAKE_U8_DUTY_ID_A,
        offerId: FAKE_U8_OFFER_ID_1,
        offererUserId: childId('taro'),
        dutyVersion: 2,
        status,
      });
      expect(reasonOf(await withdraw('hanako'))).toBe('OFFER_GONE');
    }
  });
  it('本人以外（管理者を含む）は OFFER_OWNER_ONLY', async () => {
    open();
    expect(reasonOf(await withdraw('hanako'))).toBe('OFFER_OWNER_ONLY');
    expect(reasonOf(await withdraw('mother'))).toBe('OFFER_OWNER_ONLY');
  });
  it('引き受けられたあとは OFFER_ALREADY_ACCEPTED', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
      status: 'accepted',
      acceptedByUserId: childId('hanako'),
    });
    expect(reasonOf(await withdraw('taro'))).toBe('OFFER_ALREADY_ACCEPTED');
  });
  it('担当が変わって無効になった open は OFFER_GONE', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
    expect(reasonOf(await withdraw('taro'))).toBe('OFFER_GONE');
  });
  it('書き込みの直前に引き受けられたら、読み直して OFFER_ALREADY_ACCEPTED', async () => {
    open();
    world.hooks.beforeNextUpdate = () =>
      seedOffer(world.calendar, {
        dutyId: FAKE_U8_DUTY_ID_A,
        offerId: FAKE_U8_OFFER_ID_1,
        offererUserId: childId('taro'),
        dutyVersion: 2,
        status: 'accepted',
        acceptedByUserId: childId('hanako'),
      });
    expect(reasonOf(await withdraw('taro'))).toBe('OFFER_ALREADY_ACCEPTED');
    expect(logs.rows('SWAP_RETRY')).toHaveLength(1);
  });
});
