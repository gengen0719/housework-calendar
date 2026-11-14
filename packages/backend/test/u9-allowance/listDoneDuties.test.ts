import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as calendarService from '../../src/services/calendarService';
import { CALENDAR_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { fakeU9DutyId } from '../fixtures/fakeSecrets';
import {
  CHILDREN,
  CHORES,
  FAMILY_ID,
  seedAllowanceHousehold,
  seedDone,
  seedDuty,
  seedMonthState,
} from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const scope = { familyId: FAMILY_ID };

beforeEach(() => {
  world = setupWorld();
  seedAllowanceHousehold(world);
});
afterEach(() => {
  world.mock.reset();
});

describe('listDoneDuties／isMonthConfirmed（BR10.19、NFR7.55）', () => {
  it('「済」だけを返し、「未」「×」は返さない', async () => {
    const base = { childUserId: CHILDREN.taro.userId, choreTypeId: CHORES.dishes.choreTypeId };
    seedDuty(world.calendar, { ...base, dutyId: fakeU9DutyId(1), date: '2027-01-03' });
    seedDuty(world.calendar, {
      ...base,
      dutyId: fakeU9DutyId(2),
      date: '2027-01-04',
      status: 'skipped',
    });
    seedDone(world.calendar, { dutyId: fakeU9DutyId(3), date: '2027-01-05' });
    const duties = await calendarService.listDoneDuties(scope, '2027-01');
    expect(duties.map((d) => d.dutyId)).toEqual([fakeU9DutyId(3)]);
  });

  it('単価のない「済」は返さない', async () => {
    seedDone(world.calendar, { dutyId: fakeU9DutyId(1), date: '2027-01-05', unitPrice: null });
    expect(await calendarService.listDoneDuties(scope, '2027-01')).toEqual([]);
  });

  it('単価 0 円の「済」は返す', async () => {
    seedDone(world.calendar, { dutyId: fakeU9DutyId(1), date: '2027-01-05', unitPrice: 0 });
    expect(await calendarService.listDoneDuties(scope, '2027-01')).toHaveLength(1);
  });

  it('月は担当の日付の月（12 月 31 日の担当を 1 月に記録しても 12 月）', async () => {
    seedDone(world.calendar, {
      dutyId: fakeU9DutyId(1),
      date: '2026-12-31',
      recordedAt: '2027-01-02T01:00:00.000Z',
    });
    expect(await calendarService.listDoneDuties(scope, '2026-12')).toHaveLength(1);
    expect(await calendarService.listDoneDuties(scope, '2027-01')).toHaveLength(0);
  });

  it('続きのページを最後まで読み、Query は強い整合性', async () => {
    for (let i = 1; i <= 5; i++) {
      seedDone(world.calendar, { dutyId: fakeU9DutyId(i), date: `2027-01-0${i}` });
    }
    world.hooks.queryPageSize = 2;
    expect(await calendarService.listDoneDuties(scope, '2027-01')).toHaveLength(5);
    const queries = world.hooks.readLog.filter(
      (e) => e.table === CALENDAR_TABLE && e.operation === 'Query',
    );
    expect(queries).toHaveLength(3);
    expect(queries.every((q) => q.consistent)).toBe(true);
  });

  it('月の状態の行がない月は isMonthConfirmed が偽、確定した月は真', async () => {
    seedMonthState(world.calendar, { month: '2027-01', confirmed: true });
    expect(await calendarService.isMonthConfirmed(scope, '2027-01')).toBe(true);
    expect(await calendarService.isMonthConfirmed(scope, '2027-02')).toBe(false);
  });
});
