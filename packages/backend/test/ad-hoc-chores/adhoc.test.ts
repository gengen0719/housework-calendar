import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginScenario,
  endScenario,
  seedToday,
  NOON,
  saveAs,
} from '../u5-assignment-calendar/helpers/scenario';
import {
  callAs,
  CHILDREN,
  CHORES,
  dutyItems,
  seedMonthState,
} from '../u5-assignment-calendar/helpers/seed';
import { createChoreType } from '../../src/handlers/choreType/create';
import { PEOPLE, FAMILY_ID } from '../u2-invitation/helpers/seed';
import type { ChoreType, Duty, MonthCalendar } from '@housework/shared';
import { prepareContent } from '../../src/services/notificationMessages';

let state: ReturnType<typeof beginScenario>;
let type: ChoreType;
const auth = () => ({ userId: PEOPLE.mother.userId, familyId: FAMILY_ID, role: 'admin' as const });
const payload = () => ({
  date: '2027-01-14',
  choreTypeId: type.choreTypeId,
  childUserId: CHILDREN.taro.userId,
});
beforeEach(async () => {
  state = beginScenario();
  seedToday(state, NOON.jan13);
  type = await createChoreType(
    auth(),
    { name: 'お昼ご飯を作る', unitPrice: 100, purpose: 'adhoc' },
    { 'idempotency-key': crypto.randomUUID() },
  );
});
afterEach(endScenario);
describe('Given 臨時用マスタ / When 日付に依頼 / Then 通常割り当てと独立して扱う', () => {
  it('FR2: 臨時用マスタの用途を保持し変更・使用停止できる', async () => {
    expect(type.purpose).toBe('adhoc');
    const updated = await callAs('mother', 'PUT', `/v1/chore-types/${type.choreTypeId}`, {
      name: 'お昼ご飯',
      unitPrice: 120,
    });
    expect(JSON.parse(String(updated.body))).toMatchObject({ purpose: 'adhoc', unitPrice: 120 });
    expect(
      (await callAs('mother', 'PATCH', `/v1/chore-types/${type.choreTypeId}`, { active: false }))
        .statusCode,
    ).toBe(200);
  });
  it('FR1/FR3: 保存・再送で1件だけ作り、即時通知しない', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const first = await callAs('mother', 'POST', '/v1/duties', payload());
    expect(first.statusCode).toBe(201);
    expect(JSON.parse(String(first.body))).toMatchObject({ adhoc: true, status: 'todo' });
    expect((await callAs('mother', 'POST', '/v1/duties', payload())).statusCode).toBe(409);
    expect(dutyItems(state.world.calendar)).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('FR4: 月ルール再保存と担当変更後も臨時分は残る', async () => {
    const added = await callAs('mother', 'POST', '/v1/duties', payload());
    const duty = JSON.parse(String(added.body)) as Duty;
    await callAs('mother', 'PATCH', `/v1/duties/${duty.dutyId}`, {
      childUserId: CHILDREN.hanako.userId,
    });
    expect((await saveAs('mother', '2027-01', [])).statusCode).toBe(200);
    expect(dutyItems(state.world.calendar)).toHaveLength(1);
    expect(dutyItems(state.world.calendar)[0]).toMatchObject({
      adhoc: true,
      childUserId: CHILDREN.hanako.userId,
    });
  });
  it('FR1: 未割り当て月にも臨時担当を返す', async () => {
    await callAs('mother', 'POST', '/v1/duties', payload());
    const result = await callAs('mother', 'GET', '/v1/months/2027-01/calendar');
    const month = JSON.parse(String(result.body)) as MonthCalendar;
    expect(month.hasAssignment).toBe(false);
    expect(month.duties).toHaveLength(1);
  });
  it.each(['2027-01-12', '2027-03-01'])('FR1: 範囲外の日 %s は追加しない', async (date) => {
    expect((await callAs('mother', 'POST', '/v1/duties', { ...payload(), date })).statusCode).toBe(
      422,
    );
    expect(dutyItems(state.world.calendar)).toHaveLength(0);
  });
  it('NFR1: 子供・通常種類・確定月は拒否する', async () => {
    expect((await callAs('taro', 'POST', '/v1/duties', payload())).statusCode).toBe(403);
    expect(
      (
        await callAs('mother', 'POST', '/v1/duties', {
          ...payload(),
          choreTypeId: CHORES.dishes.choreTypeId,
        })
      ).statusCode,
    ).toBe(422);
    seedMonthState(state.world.calendar, '2027-01', true);
    expect((await callAs('mother', 'POST', '/v1/duties', payload())).statusCode).toBe(409);
  });
  it('FR3: 同時追加でも1件だけ保存する', async () => {
    const results = await Promise.all([
      callAs('mother', 'POST', '/v1/duties', payload()),
      callAs('mother', 'POST', '/v1/duties', payload()),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(dutyItems(state.world.calendar)).toHaveLength(1);
  });
  it.each(['month', 'type', 'child'] as const)(
    'FR3/NFR1: 保存直前の%s変更で何も保存しない',
    async (kind) => {
      state.world.hooks.beforeNextTransaction = () => {
        if (kind === 'month') seedMonthState(state.world.calendar, '2027-01', true);
        if (kind === 'type')
          state.world.choreTypes.get(`${FAMILY_ID}#TYPE#${type.choreTypeId}`)!.active = false;
        if (kind === 'child') state.world.users.get(CHILDREN.taro.userId)!.familyId = 'outside';
      };
      const result = await callAs('mother', 'POST', '/v1/duties', payload());
      expect(result.statusCode).toBe(kind === 'month' ? 409 : kind === 'type' ? 422 : 404);
      expect(dutyItems(state.world.calendar)).toHaveLength(0);
    },
  );
  it('FR2: 用途を更新で変えず、臨時用は月ルールに使えず物理削除しない', async () => {
    const update = await callAs('mother', 'PUT', `/v1/chore-types/${type.choreTypeId}`, {
      name: type.name,
      unitPrice: 100,
      purpose: 'regular',
    });
    expect(JSON.parse(String(update.body)).purpose).toBe('adhoc');
    expect(
      (
        await saveAs('mother', '2027-01', [
          { choreTypeId: type.choreTypeId, childUserId: CHILDREN.taro.userId, weekdays: [4] },
        ])
      ).statusCode,
    ).toBe(422);
    expect(
      (await callAs('mother', 'DELETE', `/v1/chore-types/${type.choreTypeId}`)).statusCode,
    ).toBe(409);
    expect(state.world.choreTypes.get(`${FAMILY_ID}#TYPE#${type.choreTypeId}`)).toBeDefined();
  });
  it('FR5/FR6: 臨時分を既存記録・金額・定時通知に含める', async () => {
    const added = await callAs('mother', 'POST', '/v1/duties', {
      ...payload(),
      date: '2027-01-13',
    });
    const duty = JSON.parse(String(added.body)) as Duty;
    const recorded = await callAs('taro', 'POST', `/v1/duties/${duty.dutyId}/record`, {
      version: 1,
    });
    expect(recorded.statusCode).toBe(200);
    expect(JSON.parse(String(recorded.body))).toMatchObject({
      adhoc: true,
      status: 'done',
      unitPrice: 100,
    });
    const notice = await prepareContent(
      { familyId: FAMILY_ID, role: 'system' },
      'dailyReminder',
      '2027-01-13',
    );
    expect(notice.text).toContain('お昼ご飯を作る');
    const amount = await callAs('mother', 'GET', '/v1/months/2027-01/allowances');
    expect(amount.statusCode).toBe(200);
    expect(String(amount.body)).toContain('100');
    await callAs('mother', 'PATCH', `/v1/chore-types/${type.choreTypeId}`, { active: false });
    expect((await callAs('mother', 'POST', '/v1/duties', payload())).statusCode).toBe(422);
    const month = await callAs('mother', 'GET', '/v1/months/2027-01/calendar');
    expect(String(month.body)).toContain('お昼ご飯を作る');
  });
});
