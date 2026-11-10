import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as swap from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_NONEXISTENT_DUTY_ID,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
} from '../fixtures/fakeSecrets';
import {
  childId,
  choreId,
  offerCount,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
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

describe('offerSwap', () => {
  const offer = (actor: 'taro' | 'hanako' | 'mother' = 'taro', id = FAKE_U8_DUTY_ID_A) =>
    swap.offerSwap(ctxOf(actor), id, { now: NOW });
  it('成功すると open の申し出が 1 件でき、担当は変わらない', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    const r = await offer();
    expect(r.ok && r.choreName).toBe('皿洗い');
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)).toMatchObject({
      status: 'open',
      offererUserId: userIdOf('taro'),
      dutyVersion: 2,
    });
  });
  it('担当がなければ NOT_FOUND', async () => {
    expect(reasonOf(await offer('taro', FAKE_U8_NONEXISTENT_DUTY_ID))).toBe('NOT_FOUND');
    expect(offerCount(world.calendar)).toBe(0);
  });
  it('他人の担当は OFFER_OWNER_ONLY、元の持ち主の古いボタンは DUTY_CHANGED', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12', { childUserId: childId('hanako') });
    expect(reasonOf(await offer('taro'))).toBe('OFFER_OWNER_ONLY');
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
      status: 'accepted',
      acceptedByUserId: childId('hanako'),
    });
    expect(reasonOf(await offer('taro'))).toBe('DUTY_CHANGED');
  });
  it('確定した月は MONTH_CONFIRMED（持ち主の判定より後、「未」の判定より先）', async () => {
    seedMonthState(world.calendar, { month: '2027-01', confirmed: true });
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12', { status: 'done' });
    expect(reasonOf(await offer())).toBe('MONTH_CONFIRMED');
  });
  it('「未」でない担当・過ぎた日の担当は DUTY_NOT_TODO', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12', { status: 'skipped' });
    duty(FAKE_U8_DUTY_ID_B, '2027-01-07');
    expect(reasonOf(await offer('taro'))).toBe('DUTY_NOT_TODO');
    expect(reasonOf(await offer('taro', FAKE_U8_DUTY_ID_B))).toBe('DUTY_NOT_TODO');
  });
  it('有効な申し出があれば ALREADY_OFFERED、無効（version 違い）なら作り直せる', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    open();
    expect(reasonOf(await offer())).toBe('ALREADY_OFFERED');
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_2,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
    const r = await offer();
    expect(r.ok && r.offerId).not.toBe(FAKE_U8_OFFER_ID_2);
  });
  it('競合は 1 回だけやり直し、1 回目の失敗なら成功する', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    world.hooks.failTransaction(1, 'ConditionalCheckFailed');
    expect(reasonOf(await offer())).toBe('ok');
    expect(logs.rows('SWAP_RETRY')).toHaveLength(1);
  });
  it('2 回続けて競合すると INTERNAL で何も書かれない', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    world.hooks.failTransaction(1, 'ConditionalCheckFailed');
    world.hooks.failTransaction(2, 'ConditionalCheckFailed');
    expect(reasonOf(await offer())).toBe('INTERNAL');
    expect(offerCount(world.calendar)).toBe(0);
  });
});
