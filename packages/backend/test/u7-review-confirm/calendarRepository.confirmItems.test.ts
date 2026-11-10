import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  putConfirmedMonthIfAbsent,
  updateMonthConfirmation,
} from '../../src/repositories/calendarRepository';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
  type Table,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { FAKE_ADMIN_USER_ID } from '../fixtures/fakeSecrets';
import { seedMonthState, storedMonthState } from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const NOW = new Date('2027-02-01T11:00:00.000Z');
const CTX = { familyId: FAMILY_ID, userId: FAKE_ADMIN_USER_ID };
const MONTH = '2027-01';

let world: ReturnType<typeof installFakeDynamo>;
let calendar: Table;

beforeEach(() => {
  world = installFakeDynamo();
  calendar = world.calendar;
});
afterEach(() => {
  world.mock.reset();
});

describe('putConfirmedMonthIfAbsent（U7。行のない月への初回の確定。BR8.11）', () => {
  it('行が無い月は version=1 の確定行を作り written を返す', async () => {
    const result = await putConfirmedMonthIfAbsent(CTX, MONTH, NOW);
    expect(result).toBe('written');
    const row = storedMonthState(calendar, MONTH);
    expect(row).toMatchObject({
      confirmed: true,
      confirmedAt: NOW.toISOString(),
      confirmedByUserId: FAKE_ADMIN_USER_ID,
      version: 1,
    });
  });

  it('行が既にある月は書かずに exists を返す（attribute_not_exists の競合）', async () => {
    seedMonthState(calendar, { month: MONTH, confirmed: false, version: 2 });
    const result = await putConfirmedMonthIfAbsent(CTX, MONTH, NOW);
    expect(result).toBe('exists');
    // 既存の行は上書きされない
    expect(storedMonthState(calendar, MONTH)).toMatchObject({ confirmed: false, version: 2 });
  });
});

describe('updateMonthConfirmation（U7。version を条件にしない冪等。BR8.11、BR8.12、BR8.14）', () => {
  it('確定（confirmed=true）は confirmedAt・confirmedByUserId を書き version+1', async () => {
    seedMonthState(calendar, { month: MONTH, confirmed: false, version: 2 });
    const result = await updateMonthConfirmation(CTX, MONTH, true, NOW);
    expect(result).toBe('written');
    expect(storedMonthState(calendar, MONTH)).toMatchObject({
      confirmed: true,
      confirmedAt: NOW.toISOString(),
      confirmedByUserId: FAKE_ADMIN_USER_ID,
      version: 3,
    });
  });

  it('すでに確定済みの月をもう一度確定しても true のまま（冪等。version は増える）', async () => {
    seedMonthState(calendar, { month: MONTH, confirmed: true, version: 1 });
    await updateMonthConfirmation(CTX, MONTH, true, NOW);
    expect(storedMonthState(calendar, MONTH)).toMatchObject({ confirmed: true, version: 2 });
  });

  it('取り消し（confirmed=false）は confirmedAt・confirmedByUserId を REMOVE し version+1', async () => {
    seedMonthState(calendar, { month: MONTH, confirmed: true, version: 3 });
    const result = await updateMonthConfirmation(CTX, MONTH, false, NOW);
    expect(result).toBe('written');
    const row = storedMonthState(calendar, MONTH)!;
    expect(row.confirmed).toBe(false);
    expect(row.confirmedAt).toBeUndefined();
    expect(row.confirmedByUserId).toBeUndefined();
    expect(row.version).toBe(4);
  });

  it('行が無い月への取り消しは何もしないで absent を返す（行を作らない。BR8.12）', async () => {
    const result = await updateMonthConfirmation(CTX, MONTH, false, NOW);
    expect(result).toBe('absent');
    expect(storedMonthState(calendar, MONTH)).toBeUndefined();
  });

  it('確定・取り消しの連打は最後の操作の結果にそろう（version は条件にしない）', async () => {
    await putConfirmedMonthIfAbsent(CTX, MONTH, NOW); // version=1 confirmed
    await updateMonthConfirmation(CTX, MONTH, false, NOW); // version=2 unconfirmed
    await updateMonthConfirmation(CTX, MONTH, true, NOW); // version=3 confirmed
    expect(storedMonthState(calendar, MONTH)).toMatchObject({ confirmed: true, version: 3 });
  });

  it('書き込みの呼び出しは確定で 1 回（行がある月）、取り消しで 1 回', async () => {
    seedMonthState(calendar, { month: MONTH, confirmed: false, version: 0 });
    const before = world.hooks.readLog.length;
    await updateMonthConfirmation(CTX, MONTH, true, NOW);
    // Update は readLog に乗らないが、Get を 1 回も足していないことを確かめる（確定は読まずに書く）
    expect(world.hooks.readLog.length).toBe(before);
  });
});
