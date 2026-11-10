import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as swap from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_DUTY_ID_B } from '../fixtures/fakeSecrets';
import { childId, choreId, seedDuty, seedHouseholdWithPrices } from './helpers/seed';
import { captureLogs, ctxOf } from './helpers/swapWorld';

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

describe('日本時間の境（NFR11.8・NFR11.9）', () => {
  const at = (iso: string): Date => new Date(iso);
  const cases: [string, string, string, string][] = [
    ['日付の境', '2027-01-08', '2027-01-08T14:59:59.999Z', '2027-01-08T15:00:00.000Z'],
    ['月末', '2027-01-31', '2027-01-31T14:59:59.999Z', '2027-01-31T15:00:00.000Z'],
    ['年またぎ', '2026-12-31', '2026-12-31T14:59:59.999Z', '2026-12-31T15:00:00.000Z'],
    ['うるう日 2/29', '2028-02-29', '2028-02-29T14:59:59.999Z', '2028-02-29T15:00:00.000Z'],
  ];
  for (const [label, date, before, after] of cases) {
    it(`${label}: 日本時間 23:59 までは申し出られ、0:00 を過ぎると DUTY_NOT_TODO`, async () => {
      duty(FAKE_U8_DUTY_ID_A, date);
      expect(
        reasonOf(await swap.offerSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, { now: at(before) })),
      ).toBe('ok');
      world.calendar.clear();
      seedHouseholdWithPrices(world);
      duty(FAKE_U8_DUTY_ID_A, date);
      expect(
        reasonOf(await swap.offerSwap(ctxOf('taro'), FAKE_U8_DUTY_ID_A, { now: at(after) })),
      ).toBe('DUTY_NOT_TODO');
    });
  }
  it('一覧: 日本時間で年が変わった日は、前日の担当を出さず新年の担当を出す', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2026-12-31');
    duty(FAKE_U8_DUTY_ID_B, '2027-01-01');
    const { jstDateOf } = await import('@housework/shared');
    const today = jstDateOf(at('2026-12-31T15:00:00.000Z'));
    expect(today).toBe('2027-01-01');
    const r = await swap.listSwappableDuties(ctxOf('taro'), today);
    expect(Array.isArray(r) && r.map((d) => d.dutyId)).toEqual([FAKE_U8_DUTY_ID_B]);
  });
  it('一覧: うるう日の翌月（3 月）の担当も、2/29 の今日から読む', async () => {
    duty(FAKE_U8_DUTY_ID_A, '2028-02-29');
    duty(FAKE_U8_DUTY_ID_B, '2028-03-01');
    const r = await swap.listSwappableDuties(ctxOf('taro'), '2028-02-29');
    expect(Array.isArray(r) && r.map((d) => d.dutyId)).toEqual([
      FAKE_U8_DUTY_ID_A,
      FAKE_U8_DUTY_ID_B,
    ]);
  });
});
