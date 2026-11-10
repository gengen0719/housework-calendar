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
beforeEach(() => {
  world = installFakeDynamo();
  captureLogs();
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

describe('acceptSwap', () => {
  const accept = (actor: 'taro' | 'hanako' | 'jiro' | 'mother', offerId = FAKE_U8_OFFER_ID_1) =>
    swap.acceptSwap(ctxOf(actor), FAKE_U8_DUTY_ID_A, offerId, { now: NOW });
  beforeEach(() => duty(FAKE_U8_DUTY_ID_A, '2027-01-12'));
  it('成功すると担当が引き受けた子供に変わり、origin が swap・version が +1', async () => {
    open();
    const r = await accept('hanako');
    expect(r.ok && r.duty).toMatchObject({
      childUserId: userIdOf('hanako'),
      origin: 'swap',
      version: 3,
    });
    expect(r.ok && r.offererUserId).toBe(userIdOf('taro'));
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)).toMatchObject({ status: 'accepted' });
  });
  it('申し出がない・ID 違い・取り下げ・自動でなくなったは OFFER_GONE', async () => {
    expect(reasonOf(await accept('hanako'))).toBe('OFFER_GONE');
    open();
    expect(reasonOf(await accept('hanako', FAKE_U8_OFFER_ID_2))).toBe('OFFER_GONE');
    for (const status of ['withdrawn', 'cancelled'] as const) {
      seedOffer(world.calendar, {
        dutyId: FAKE_U8_DUTY_ID_A,
        offerId: FAKE_U8_OFFER_ID_1,
        offererUserId: childId('taro'),
        dutyVersion: 2,
        status,
      });
      expect(reasonOf(await accept('hanako'))).toBe('OFFER_GONE');
    }
  });
  it('担当の version が変わった open の申し出は OFFER_GONE', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
    expect(reasonOf(await accept('hanako'))).toBe('OFFER_GONE');
  });
  it('申し出た本人と管理者は CANNOT_ACCEPT_OWN_OFFER', async () => {
    open();
    expect(reasonOf(await accept('taro'))).toBe('CANNOT_ACCEPT_OWN_OFFER');
    expect(reasonOf(await accept('mother'))).toBe('CANNOT_ACCEPT_OWN_OFFER');
  });
  it('判定の順: 本人の判定は引き受け済みの判定より先', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
      status: 'accepted',
      acceptedByUserId: childId('hanako'),
    });
    expect(reasonOf(await accept('taro'))).toBe('CANNOT_ACCEPT_OWN_OFFER');
    expect(reasonOf(await accept('jiro'))).toBe('OFFER_ALREADY_ACCEPTED');
  });
  it('先着 1 人だけが成功する', async () => {
    open();
    expect(reasonOf(await accept('hanako'))).toBe('ok');
    expect(reasonOf(await accept('jiro'))).toBe('OFFER_ALREADY_ACCEPTED');
  });
  it('競合は 1 回やり直し、2 回続くと INTERNAL', async () => {
    open();
    world.hooks.failTransaction(1, 'ConditionalCheckFailed');
    expect(reasonOf(await accept('hanako'))).toBe('ok');
    world.calendar.clear();
    seedHouseholdWithPrices(world);
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    open();
    world.hooks.failTransaction(3, 'ConditionalCheckFailed');
    world.hooks.failTransaction(4, 'ConditionalCheckFailed');
    expect(reasonOf(await accept('hanako'))).toBe('INTERNAL');
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)).toMatchObject({ status: 'open' });
  });
});
