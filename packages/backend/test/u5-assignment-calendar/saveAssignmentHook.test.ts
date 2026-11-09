import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onDutyReassigned, type DutyReassignedEvent } from '../../src/services/dutyReassignedHook';
import { CHILDREN, CHORES, seedAssignment, seedDuty } from './helpers/seed';
import {
  beginScenario,
  endScenario,
  MONDAY,
  NOON,
  rule,
  saveAs,
  seedToday,
  THURSDAY,
  type ScenarioState,
} from './helpers/scenario';

let state: ScenarioState;
let events: DutyReassignedEvent[];

beforeEach(() => {
  state = beginScenario();
  events = [];
  seedToday(state, NOON.jan14);
  seedAssignment(state.world.calendar, '2027-01', [rule('dishes', 'taro', [MONDAY, THURSDAY])]);
  for (const date of ['2027-01-18', '2027-01-21']) {
    seedDuty(state.world.calendar, {
      dutyId: randomUUID(),
      date,
      choreTypeId: CHORES.dishes.choreTypeId,
      childUserId: CHILDREN.taro.userId,
    });
  }
  onDutyReassigned(async (event) => void events.push(event));
});
afterEach(() => {
  endScenario();
});

describe('保存し直しが onDutyReassigned を呼ぶ（BR6.6）', () => {
  it('子供が変わった担当と消えた担当を、書けたあとに知らせる', async () => {
    const response = await saveAs('mother', '2027-01', [rule('dishes', 'hanako', [MONDAY])]);
    expect(response.statusCode).toBe(200);
    expect(events.map((e) => `${e.kind} ${e.date}`)).toEqual([
      'deleted 2027-01-21',
      'child-changed 2027-01-18',
    ]);
    expect(events[1]).toMatchObject({
      fromChildUserId: CHILDREN.taro.userId,
      toChildUserId: CHILDREN.hanako.userId,
      newOrigin: 'rule',
      familyId: 'fam-yamada',
    });
    expect(events[0]).not.toHaveProperty('toChildUserId');
  });

  it('作るだけ・何もしない保存では知らせない', async () => {
    const same = await saveAs('mother', '2027-01', [rule('dishes', 'taro', [MONDAY, THURSDAY])]);
    expect(same.statusCode).toBe(200);
    expect(events).toEqual([]);
  });

  it('書き込みが断られた保存では知らせない', async () => {
    state.world.hooks.failTransaction(1, 'ThrottlingError');
    const failed = await saveAs('mother', '2027-01', [rule('dishes', 'hanako', [MONDAY])]);
    expect(failed.statusCode).toBe(500);
    expect(events).toEqual([]);
  });
});
