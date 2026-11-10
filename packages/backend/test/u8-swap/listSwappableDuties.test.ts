import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as choreTypeService from '../../src/services/choreTypeService';
import * as swap from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_DUTY_ID_B, FAKE_U8_DUTY_ID_C } from '../fixtures/fakeSecrets';
import {
  childId,
  choreId,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
} from './helpers/seed';
import { captureLogs, ctxOf, TODAY } from './helpers/swapWorld';

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
const duty = (id: string, date: string, extra: Record<string, unknown> = {}): void =>
  seedDuty(world.calendar, {
    dutyId: id,
    date,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    version: 2,
    ...extra,
  });

describe('listSwappableDuties', () => {
  it('日付→種類の順→担当の ID の順に並ぶ', async () => {
    duty(FAKE_U8_DUTY_ID_B, '2027-01-12');
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12', { choreTypeId: choreId('laundry') });
    duty(FAKE_U8_DUTY_ID_C, '2027-01-10', { choreTypeId: choreId('garbage') });
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r.map((d) => d.dutyId)).toEqual([
      FAKE_U8_DUTY_ID_C,
      FAKE_U8_DUTY_ID_B,
      FAKE_U8_DUTY_ID_A,
    ]);
  });
  it('同じ日は種類の並び順になり、dutyId の大小には左右されない', async () => {
    duty(FAKE_U8_DUTY_ID_C, '2027-01-12');
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12', { choreTypeId: choreId('laundry') });
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r.map((d) => d.dutyId)).toEqual([
      FAKE_U8_DUTY_ID_C,
      FAKE_U8_DUTY_ID_A,
    ]);
  });
  it('他の子供・過去・今日より前・「未」でない担当は出ない', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-07');
    duty(FAKE_U8_DUTY_ID_B, '2027-01-12', { childUserId: childId('hanako') });
    duty(FAKE_U8_DUTY_ID_C, '2027-01-13', { status: 'skipped' });
    expect(await swap.listSwappableDuties(ctxOf('taro'), TODAY)).toBe('NO_SWAPPABLE_DUTY');
  });
  it('今日の担当は含む', async () => {
    duty(FAKE_U8_DUTY_ID_A, TODAY);
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r).toHaveLength(1);
  });
  it('候補なしで今月が確定なら MONTH_CONFIRMED、確定していなければ NO_SWAPPABLE_DUTY', async () => {
    seedMonthState(world.calendar, { month: '2027-01', confirmed: true });
    expect(await swap.listSwappableDuties(ctxOf('taro'), TODAY)).toBe('MONTH_CONFIRMED');
    seedMonthState(world.calendar, { month: '2027-01', confirmed: false });
    expect(await swap.listSwappableDuties(ctxOf('taro'), TODAY)).toBe('NO_SWAPPABLE_DUTY');
  });
  it('確定した月の担当は出さず、来月の担当は出す', async () => {
    seedMonthState(world.calendar, { month: '2027-01', confirmed: true });
    duty(FAKE_U8_DUTY_ID_A, '2027-01-20');
    duty(FAKE_U8_DUTY_ID_B, '2027-02-03');
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r.map((d) => d.dutyId)).toEqual([FAKE_U8_DUTY_ID_B]);
  });
  it('11 件以上でも全件を返す（絞るのは受け口）', async () => {
    for (let i = 0; i < swap.SWAP_CHOICES_MAX + 2; i++) {
      duty(`00000000-0000-4000-8000-00000000090${i.toString(16)}`, `2027-01-${10 + i}`);
    }
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r).toHaveLength(swap.SWAP_CHOICES_MAX + 2);
    expect(logs.rows('SWAP_LISTED')[0]).toMatchObject({ shown: swap.SWAP_CHOICES_MAX });
  });
  it('種類の一覧が読めないときは言い換えて返し、familyId だけの warn を 1 件残す', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    vi.spyOn(choreTypeService, 'list').mockRejectedValue(new Error('boom'));
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r[0]?.choreName).toBe(swap.FALLBACK_CHORE_NAME);
    const rows = logs.rows('SWAP_CHORE_TYPES_FAILED');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ level: 'warn', familyId: ctxOf('taro').familyId });
    expect(rows[0]).not.toHaveProperty('dutyId');
    expect(JSON.stringify(rows[0])).not.toContain('皿洗い');
  });
  it('種類の名前を付けて返す', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2027-01-12');
    const r = await swap.listSwappableDuties(ctxOf('taro'), TODAY);
    expect(Array.isArray(r) && r[0]?.choreName).toBe('皿洗い');
  });
});
