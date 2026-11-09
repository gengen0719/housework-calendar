import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentView } from '@housework/shared';
import { bodyOf } from '../u2-invitation/helpers/seed';
import { CHILDREN, CHORES, seedAssignment, seedHousehold } from './helpers/seed';
import {
  beginScenario,
  endScenario,
  errorOf,
  rule,
  MONDAY,
  THURSDAY,
  type ScenarioState,
} from './helpers/scenario';
import { callAs, calendarKey, assignmentSk } from './helpers/seed';
import { FAKE_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';

let state: ScenarioState;

beforeEach(() => {
  state = beginScenario();
  seedHousehold(state.world);
});
afterEach(() => {
  endScenario();
  vi.restoreAllMocks();
});

const path = (month: string) => `/v1/months/${month}/assignment`;

describe('GET /v1/months/:month/assignment（今の割り当て）', () => {
  it('割り当てがない月は exists が false で行は空', async () => {
    const response = await callAs('mother', 'GET', path('2027-01'));
    expect(response.statusCode).toBe(200);
    expect(bodyOf<AssignmentView>(response)).toEqual({
      month: '2027-01',
      rules: [],
      exists: false,
    });
  });

  it('保存された割り当てを、整えた形で返す（子供も読める）', async () => {
    seedAssignment(state.world.calendar, '2027-01', [
      rule('dishes', 'taro', [THURSDAY, MONDAY]),
      rule('laundry', 'hanako', [MONDAY]),
    ]);
    const response = await callAs('taro', 'GET', path('2027-01'));
    expect(response.statusCode).toBe(200);
    expect(bodyOf<AssignmentView>(response)).toEqual({
      month: '2027-01',
      exists: true,
      rules: [
        {
          choreTypeId: CHORES.dishes.choreTypeId,
          childUserId: CHILDREN.taro.userId,
          weekdays: [MONDAY, THURSDAY],
        },
        {
          choreTypeId: CHORES.laundry.choreTypeId,
          childUserId: CHILDREN.hanako.userId,
          weekdays: [MONDAY],
        },
      ],
    });
  });

  it('行が 0 行の割り当ては exists が true', async () => {
    seedAssignment(state.world.calendar, '2027-01', []);
    const response = await callAs('mother', 'GET', path('2027-01'));
    expect(bodyOf<AssignmentView>(response)).toEqual({ month: '2027-01', rules: [], exists: true });
  });

  it('ほかの家族の割り当ては読めず、月の形が違えば 422 INVALID_MONTH', async () => {
    seedAssignment(
      state.world.calendar,
      '2027-01',
      [rule('dishes', 'taro', [MONDAY])],
      FAKE_OTHER_FAMILY_ID,
    );
    expect(state.world.calendar.get(calendarKey(assignmentSk('2027-01')))).toBeUndefined();
    const other = await callAs('mother', 'GET', path('2027-01'));
    expect(bodyOf<AssignmentView>(other).exists).toBe(false);
    const invalid = await callAs('mother', 'GET', path('2027-13'));
    expect(invalid.statusCode).toBe(422);
    expect(errorOf(invalid).reason).toBe('INVALID_MONTH');
  });
});
