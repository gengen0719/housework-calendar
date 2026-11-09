import { afterEach, describe, expect, it, vi } from 'vitest';
import { listTodayRecordableDuties } from '../../src/services/recordingService';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_U6_DUTY_ID_B,
  FAKE_U6_DUTY_ID_C,
  FAKE_U6_DUTY_ID_D,
  FAKE_U6_DUTY_ID_E,
  fakeU6DutyId,
} from '../fixtures/fakeSecrets';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  MONTH,
} from './helpers/seed';

const TODAY = '2027-01-07';
const RECORDED_AT = '2027-01-07T07:42:00.000Z';

/** 置いた担当と同じ家族の、その子供としての文脈。 */
const familyCtx = (child: 'taro' | 'hanako'): FamilyContext => ({
  familyId: FAMILY_ID,
  userId: childId(child),
  role: 'child',
});

describe('listTodayRecordableDuties（C8。BR7.2）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function worldWithTaro(): ReturnType<typeof setupWorld> {
    const world = setupWorld();
    process.env.ENTRY = 'line';
    seedHouseholdWithPrices(world);
    return world;
  }

  it('今日の担当がないときは selectable も notSelectable も空', async () => {
    worldWithTaro();
    const result = await listTodayRecordableDuties(familyCtx('taro'), TODAY);
    expect(result).toEqual({ selectable: [], notSelectable: [] });
  });

  it('「未」があるときは selectable に入り、名前と version を持つ', async () => {
    const world = worldWithTaro();
    seedDuty(world.calendar, {
      dutyId: FAKE_U6_DUTY_ID_A,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 3,
    });
    const result = await listTodayRecordableDuties(familyCtx('taro'), TODAY);
    if (result === 'MONTH_CONFIRMED') throw new Error('MONTH_CONFIRMED は返らない');
    expect(result.selectable).toHaveLength(1);
    expect(result.selectable[0]).toMatchObject({ choreName: '皿洗い', version: 3 });
  });

  it('「済」「×」は notSelectable に入り、「済」は時刻を持つ', async () => {
    const world = worldWithTaro();
    seedDoneDuty(world.calendar, {
      dutyId: FAKE_U6_DUTY_ID_B,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      recordedAt: RECORDED_AT,
      recordedBy: childId('taro'),
      unitPrice: 100,
    });
    seedDuty(world.calendar, {
      dutyId: FAKE_U6_DUTY_ID_C,
      date: TODAY,
      choreTypeId: choreId('laundry'),
      childUserId: childId('taro'),
      status: 'skipped',
    });
    const result = await listTodayRecordableDuties(familyCtx('taro'), TODAY);
    if (result === 'MONTH_CONFIRMED') throw new Error('MONTH_CONFIRMED は返らない');
    expect(result.selectable).toHaveLength(0);
    expect(result.notSelectable).toEqual(
      expect.arrayContaining([
        { choreName: '皿洗い', status: 'done', recordedTime: '16:42' },
        { choreName: '洗濯物たたみ', status: 'skipped' },
      ]),
    );
  });

  it('月が確定していれば MONTH_CONFIRMED を返す（担当は読まない）', async () => {
    const world = worldWithTaro();
    seedMonthState(world.calendar, MONTH, true);
    seedDuty(world.calendar, {
      dutyId: FAKE_U6_DUTY_ID_D,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
    });
    const result = await listTodayRecordableDuties(familyCtx('taro'), TODAY);
    expect(result).toBe('MONTH_CONFIRMED');
  });

  it('ctx.userId 以外の担当は含まれない', async () => {
    const world = worldWithTaro();
    seedDuty(world.calendar, {
      dutyId: FAKE_U6_DUTY_ID_E,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
    });
    seedDuty(world.calendar, {
      dutyId: fakeU6DutyId(0),
      date: TODAY,
      choreTypeId: choreId('laundry'),
      childUserId: childId('hanako'),
      status: 'todo',
    });
    const result = await listTodayRecordableDuties(familyCtx('taro'), TODAY);
    if (result === 'MONTH_CONFIRMED') throw new Error('MONTH_CONFIRMED は返らない');
    expect(result.selectable).toHaveLength(1);
    expect(result.selectable[0]?.choreName).toBe('皿洗い');
  });
});
