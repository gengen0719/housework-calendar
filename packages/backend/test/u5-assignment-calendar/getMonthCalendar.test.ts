import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import * as calendarService from '../../src/services/calendarService';
import { CALENDAR_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import {
  CHILDREN,
  CHORES,
  seedAssignment,
  seedDuty,
  seedHousehold,
  seedMonthState,
} from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: CHILDREN.taro.userId, role: 'child' };

beforeEach(() => {
  world = setupWorld();
  process.env.ENTRY = 'api';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  seedHousehold(world);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const addDuty = (date: string, chore: keyof typeof CHORES, options = {}) =>
  seedDuty(world.calendar, {
    dutyId: randomUUID(),
    date,
    choreTypeId: CHORES[chore].choreTypeId,
    childUserId: CHILDREN.taro.userId,
    ...options,
  });

describe('getMonthCalendar', () => {
  it('割り当ても担当もない月は、割り当てなしで空の担当を返す', async () => {
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-02', '2027-01-14');
    expect(calendar).toMatchObject({
      month: '2027-02',
      confirmed: false,
      hasAssignment: false,
      today: '2027-01-14',
      duties: [],
      choreTypes: [],
    });
    expect(calendar.children).toHaveLength(3);
  });

  it('担当を日付と種類の順に、種類の名前と記録した人の表示名つきで返す', async () => {
    addDuty('2027-01-18', 'dishes');
    addDuty('2027-01-10', 'laundry', {
      status: 'done',
      recordedAt: '2027-01-10T09:00:00.000Z',
      recordedBy: PEOPLE.mother.userId,
      unitPrice: 50,
    });
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    expect(calendar.duties.map((d) => `${d.date} ${d.choreName}`)).toEqual([
      '2027-01-10 洗濯物たたみ',
      '2027-01-18 皿洗い',
    ]);
    expect(calendar.duties[0]).toMatchObject({
      recordedByName: PEOPLE.mother.displayName,
      unitPrice: 50,
    });
    expect(calendar.duties[1]).toMatchObject({ recordedAt: null, recordedByName: null });
  });

  it('確定した月は confirmed、割り当てを保存した月は hasAssignment になる', async () => {
    seedAssignment(world.calendar, '2027-01', []);
    seedMonthState(world.calendar, '2027-01', true);
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    expect(calendar).toMatchObject({ confirmed: true, hasAssignment: true, duties: [] });
  });

  it('担当に出る種類だけを、使わない種類も含めて返す', async () => {
    addDuty('2027-01-18', 'bath');
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    expect(calendar.choreTypes).toEqual([
      { choreTypeId: CHORES.bath.choreTypeId, name: 'お風呂洗い', active: false },
    ]);
  });

  it('消えた種類の担当は、種類の名前が空で返る', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: randomUUID(), name: '別の種類' });
    addDuty('2027-01-18', 'dishes');
    world.choreTypes.delete(`${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`);
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    expect(calendar.duties[0]?.choreName).toBe('');
    expect(calendar.choreTypes).toEqual([]);
  });

  it('索引に出ていない子供も、担当にいれば強い整合性で補って返す', async () => {
    addDuty('2027-01-18', 'dishes');
    world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
    const calendar = await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    expect(calendar.children.map((child) => child.userId)).toContain(CHILDREN.taro.userId);
  });

  it('Calendar の読み取りは Query 1 回だけで、強い整合性である', async () => {
    for (let day = 1; day <= 20; day++)
      addDuty(`2027-01-${String(day).padStart(2, '0')}`, 'dishes');
    world.hooks.readLog.length = 0;
    await calendarService.getMonthCalendar(ctx, '2027-01', '2027-01-14');
    const reads = world.hooks.readLog.filter((entry) => entry.table === CALENDAR_TABLE);
    expect(reads).toEqual([{ operation: 'Query', table: CALENDAR_TABLE, consistent: true }]);
  });
});
