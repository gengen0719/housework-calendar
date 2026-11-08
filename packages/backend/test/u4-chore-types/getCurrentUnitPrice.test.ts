import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as calendarPort from '../../src/services/calendarPort';
import * as choreTypeService from '../../src/services/choreTypeService';
import { FAKE_CHORE_TYPE_ID_1 } from '../fixtures/fakeSecrets';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import { OTHER_FAMILY_ID, seedChoreType } from './helpers/seed';

const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' } as const;
const ID = FAKE_CHORE_TYPE_ID_1;

describe('C7 getCurrentUnitPrice（BR5.7、BR5.10）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('「使う」種類の今の単価を返す', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い', unitPrice: 120 });
    expect(await choreTypeService.getCurrentUnitPrice(ctx, ID)).toEqual({ ok: true, value: 120 });
  });

  it('「使わない」種類にも単価を返す', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い', active: false });
    expect(await choreTypeService.getCurrentUnitPrice(ctx, ID)).toEqual({ ok: true, value: 100 });
  });

  it('単価 0 の種類は 0 を返す（なしと区別する）', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い', unitPrice: 0 });
    expect(await choreTypeService.getCurrentUnitPrice(ctx, ID)).toEqual({ ok: true, value: 0 });
  });

  it('種類がない・ほかの家族の種類は NOT_FOUND', async () => {
    expect(await choreTypeService.getCurrentUnitPrice(ctx, ID)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    seedChoreType(world.choreTypes, {
      choreTypeId: ID,
      name: '風呂掃除',
      familyId: OTHER_FAMILY_ID,
    });
    expect(await choreTypeService.getCurrentUnitPrice(ctx, ID)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('get: 自分の家族の種類だけを返す', async () => {
    seedChoreType(world.choreTypes, { choreTypeId: ID, name: '皿洗い' });
    expect((await choreTypeService.get(ctx, ID))?.name).toBe('皿洗い');
    expect(await choreTypeService.get({ ...ctx, familyId: OTHER_FAMILY_ID }, ID)).toBeUndefined();
  });
});

describe('C8 calendarPort の仮の窓口', () => {
  afterEach(() => calendarPort.resetCalendarPort());

  it('既定では、どの種類も「使われていない」を返す', async () => {
    expect(await calendarPort.isChoreTypeAssigned(ctx, ID)).toBe(false);
  });

  it('差し替えると、差し替えた窓口が呼ばれる（家族と種類の ID を渡す）', async () => {
    const seen: string[] = [];
    calendarPort.setCalendarPort({
      isChoreTypeAssigned: async (c, id) => {
        seen.push(`${c.familyId}:${id}`);
        return true;
      },
    });
    expect(await calendarPort.isChoreTypeAssigned(ctx, ID)).toBe(true);
    expect(seen).toEqual([`${FAMILY_ID}:${ID}`]);
  });

  it('resetCalendarPort で仮の窓口に戻る', async () => {
    calendarPort.setCalendarPort({ isChoreTypeAssigned: async () => true });
    calendarPort.resetCalendarPort();
    expect(await calendarPort.isChoreTypeAssigned(ctx, ID)).toBe(false);
  });
});
