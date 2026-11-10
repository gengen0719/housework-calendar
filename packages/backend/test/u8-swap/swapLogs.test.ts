import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptSwap,
  closeOffer,
  listSwappableDuties,
  offerSwap,
  withdrawSwap,
} from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_GROUP_ID,
  FAKE_U8_MARKER_DISPLAY_NAME,
  FAKE_U8_MARKER_LONG_CHORE_NAME,
  FAKE_U8_OFFER_ID_1,
} from '../fixtures/fakeSecrets';
import {
  FAMILY_ID,
  childId,
  choreId,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedOffer,
} from './helpers/seed';
import { captureLogs, ctxOf, NOW, TODAY } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

describe('swapService のログ（BR9.18）', () => {
  let world: ReturnType<typeof installFakeDynamo>;
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    world = installFakeDynamo();
    logs = captureLogs();
    seedHouseholdWithPrices(world);
    // 種類の名前を目印にして、ログに名前が出ないことを確かめる
    seedChoreType(world.choreTypes, {
      choreTypeId: choreId('dishes'),
      name: FAKE_U8_MARKER_LONG_CHORE_NAME,
      active: true,
    });
    seedMonthState(world.calendar, { month: '2027-01', confirmed: false });
    seedDuty(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      date: '2027-01-12',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version: 2,
    });
  });
  afterEach(() => {
    world.mock.reset();
    vi.restoreAllMocks();
  });

  const seedOpen = (): void =>
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
    });

  it('一覧: 候補ありは SWAP_LISTED が 1 件だけ出る（件数と表示した数）', async () => {
    await listSwappableDuties(ctxOf('taro'), TODAY);
    expect(logs.rows('SWAP_LISTED')).toHaveLength(1);
    expect(logs.rows('SWAP_LISTED')[0]).toMatchObject({ familyId: FAMILY_ID, count: 1, shown: 1 });
    expect(logs.rows('SWAP_REJECTED')).toHaveLength(0);
  });

  it('一覧: 候補なしは SWAP_REJECTED（op が list）が 1 件だけ出て、SWAP_LISTED は出ない', async () => {
    await listSwappableDuties(ctxOf('hanako'), TODAY);
    expect(logs.rows('SWAP_LISTED')).toHaveLength(0);
    expect(logs.rows('SWAP_REJECTED')).toEqual([
      expect.objectContaining({ op: 'list', reason: 'NO_SWAPPABLE_DUTY', familyId: FAMILY_ID }),
    ]);
  });

  it('申し出: 成功は SWAP_OFFERED が 1 件（ID だけ）、断りは SWAP_REJECTED が 1 件', async () => {
    const result = await offerSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, { now: NOW });
    await offerSwap(ctxOf('hanako'), FAKE_U8_DUTY_ID_A, { now: NOW });
    if (!result.ok) throw new Error(result.reason);
    expect(logs.rows('SWAP_OFFERED')).toEqual([
      expect.objectContaining({
        familyId: FAMILY_ID,
        dutyId: FAKE_U8_DUTY_ID_A,
        offerId: result.offerId,
      }),
    ]);
    expect(logs.rows('SWAP_REJECTED')).toEqual([
      expect.objectContaining({
        op: 'offer',
        reason: 'OFFER_OWNER_ONLY',
        dutyId: FAKE_U8_DUTY_ID_A,
      }),
    ]);
  });

  it('引き受け: 成功は SWAP_ACCEPTED が 1 件、断りは SWAP_REJECTED が 1 件', async () => {
    seedOpen();
    await acceptSwap(ctxOf('mother'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    await acceptSwap(ctxOf('hanako'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    expect(logs.rows('SWAP_ACCEPTED')).toHaveLength(1);
    expect(logs.rows('SWAP_REJECTED')).toEqual([
      expect.objectContaining({ op: 'accept', reason: 'CANNOT_ACCEPT_OWN_OFFER' }),
    ]);
  });

  it('取り下げ: 成功は SWAP_WITHDRAWN が 1 件、断りは SWAP_REJECTED が 1 件', async () => {
    seedOpen();
    await withdrawSwap(ctxOf('hanako'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    await withdrawSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    expect(logs.rows('SWAP_WITHDRAWN')).toHaveLength(1);
    expect(logs.rows('SWAP_REJECTED')).toEqual([
      expect.objectContaining({ op: 'withdraw', reason: 'OFFER_OWNER_ONLY' }),
    ]);
  });

  it('読み直し: 競合のたびに SWAP_RETRY が 1 件、2 回続けて断られると INTERNAL の SWAP_REJECTED', async () => {
    world.hooks.failTransaction(1, 'ConditionalCheckFailed');
    world.hooks.failTransaction(2, 'ConditionalCheckFailed');
    await offerSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, { now: NOW });
    expect(logs.rows('SWAP_RETRY')).toEqual([
      expect.objectContaining({ op: 'offer', dutyId: FAKE_U8_DUTY_ID_A }),
      expect.objectContaining({ op: 'offer', dutyId: FAKE_U8_DUTY_ID_A }),
    ]);
    expect(logs.rows('SWAP_REJECTED')).toEqual([expect.objectContaining({ reason: 'INTERNAL' })]);
  });

  it('成功のログ 4 種（一覧・申し出・引き受け・取り下げ）に durationMs が 0 以上の数で付く（NFR7.49）', async () => {
    await listSwappableDuties(ctxOf('taro'), TODAY);
    const offered = await offerSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, { now: NOW });
    if (!offered.ok) throw new Error(offered.reason);
    await acceptSwap(ctxOf('hanako'), FAKE_U8_DUTY_ID_A, offered.offerId, { now: NOW });
    for (const event of ['SWAP_LISTED', 'SWAP_OFFERED', 'SWAP_ACCEPTED']) {
      const row = logs.rows(event)[0];
      expect(typeof row?.durationMs, event).toBe('number');
      expect(row?.durationMs as number, event).toBeGreaterThanOrEqual(0);
    }
  });

  it('取り下げの成功のログにも durationMs が付き、断りのログには付かない（NFR7.49）', async () => {
    seedOpen();
    await withdrawSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    await withdrawSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    const row = logs.rows('SWAP_WITHDRAWN')[0];
    expect(typeof row?.durationMs).toBe('number');
    expect(row?.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(logs.rows('SWAP_REJECTED')[0]).not.toHaveProperty('durationMs');
  });

  it('掃除: 実際に cancelled にしたときだけ SWAP_OFFER_CLOSED が 1 件出る', async () => {
    seedOpen();
    await closeOffer(FAMILY_ID, FAKE_U8_DUTY_ID_A, 'recorded', NOW);
    await closeOffer(FAMILY_ID, FAKE_U8_DUTY_ID_A, 'recorded', NOW);
    expect(logs.rows('SWAP_OFFER_CLOSED')).toEqual([
      expect.objectContaining({ familyId: FAMILY_ID, dutyId: FAKE_U8_DUTY_ID_A, via: 'recorded' }),
    ]);
  });

  it('どのログ行にも、名前・LINE の ID・目印の文字列が含まれない', async () => {
    seedOpen();
    await listSwappableDuties(ctxOf('taro'), TODAY);
    await acceptSwap(ctxOf('hanako'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    await withdrawSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1, { now: NOW });
    await closeOffer(FAMILY_ID, FAKE_U8_DUTY_ID_A, 'status-changed', NOW);
    const text = JSON.stringify(logs.lines);
    expect(logs.lines.length).toBeGreaterThan(0);
    for (const secret of [
      FAKE_U8_MARKER_LONG_CHORE_NAME,
      FAKE_U8_MARKER_DISPLAY_NAME,
      FAKE_U8_GROUP_ID,
      '太郎',
      '花子',
      'U_taro',
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
