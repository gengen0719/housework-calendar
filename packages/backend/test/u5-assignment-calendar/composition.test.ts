import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import { CHILDREN, CHORES, seedAssignment, seedHousehold } from './helpers/seed';

const ctx: FamilyContext = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' };
let world: ReturnType<typeof setupWorld>;

beforeEach(() => {
  // entries/api を読み込み直して、読み込み時の取り付けを確かめる（ほかの試験の取り付けを持ち越さない）
  vi.resetModules();
  world = setupWorld();
  process.env.ENTRY = 'api';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  seedHousehold(world);
  seedAssignment(world.calendar, '2027-01', [
    { choreTypeId: CHORES.dishes.choreTypeId, childUserId: CHILDREN.taro.userId, weekdays: [1] },
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('C8 の窓口の取り付け（composition root）', () => {
  it('entries/api を読み込む前は仮の窓口で、いつも「使われていない」を返す', async () => {
    const port = await import('../../src/services/calendarPort');
    expect(await port.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(false);
  });

  it('entries/api を読み込むと本物が取り付けられる', async () => {
    await import('../../src/entries/api');
    const port = await import('../../src/services/calendarPort');
    expect(await port.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(true);
    expect(await port.isChoreTypeAssigned(ctx, CHORES.garbage.choreTypeId)).toBe(false);
  });

  it('取り付けたあと、choreTypeService.remove は本物を呼んで CHORE_TYPE_IN_USE を返す', async () => {
    await import('../../src/entries/api');
    const choreTypeService = await import('../../src/services/choreTypeService');
    const result = await choreTypeService.remove(ctx, CHORES.dishes.choreTypeId);
    expect(result).toEqual({ ok: false, reason: 'CHORE_TYPE_IN_USE' });
  });

  it('resetCalendarPort で仮の窓口に戻せる', async () => {
    await import('../../src/entries/api');
    const port = await import('../../src/services/calendarPort');
    port.resetCalendarPort();
    expect(await port.isChoreTypeAssigned(ctx, CHORES.dishes.choreTypeId)).toBe(false);
  });

  it('choreTypeService と calendarPort は calendarService を読み込まない（輪を作らない）', async () => {
    const calendarService = await import('../../src/services/calendarService');
    const spy = vi.spyOn(calendarService, 'isChoreTypeAssigned');
    const choreTypeService = await import('../../src/services/choreTypeService');
    await choreTypeService.remove(ctx, CHORES.laundry.choreTypeId);
    // entries/api を読み込んでいないので、仮の窓口が使われ、本物は呼ばれない
    expect(spy).not.toHaveBeenCalled();
  });
});
