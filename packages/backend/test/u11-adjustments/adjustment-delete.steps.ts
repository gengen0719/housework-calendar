import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { setup, create, request, validInput, bodyOf } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { seedMonthState } from '../u5-assignment-calendar/helpers/seed';
const feature = await loadFeature(
  'packages/backend/test/u11-adjustments/adjustment-delete.feature',
);
let state: ReturnType<typeof setup>;
let id: string;
let key: string;
let status: number | undefined;
const list = () => request('GET', '/v1/months/2027-01/adjustments');
async function given() {
  state = setup();
  key = randomUUID();
  id = bodyOf(await create(validInput(), { key })).adjustmentId;
}
describeFeature(feature, ({ AfterEachScenario, Scenario }) => {
  AfterEachScenario(endScenario);
  Scenario('一覧から調整を削除し元の作成を再送しても復活しない', ({ Given, When, Then, And }) => {
    Given('未確定月に調整を登録した', given);
    When('管理者が一覧を取得してその調整を削除する', async () => {
      expect(bodyOf(await list()).adjustments).toHaveLength(1);
      status = (await request('DELETE', `/v1/adjustments/${id}`)).statusCode;
    });
    Then('削除は204で一覧は空になる', async () => {
      expect(status).toBe(204);
      expect(bodyOf(await list()).adjustments).toEqual([]);
    });
    And('元の作成を再送しても一覧は空のまま', async () => {
      expect((await create(validInput(), { key })).statusCode).toBe(201);
      expect(bodyOf(await list()).adjustments).toEqual([]);
    });
  });
  Scenario('確定が先なら削除しない', ({ Given, And, When, Then }) => {
    Given('未確定月に調整を登録した', given);
    And('その月を確定した', () => seedMonthState(state.world.calendar, '2027-01', true));
    When('管理者がその調整を削除する', async () => {
      status = (await request('DELETE', `/v1/adjustments/${id}`)).statusCode;
    });
    Then('削除は409で行が残る', () => {
      expect(status).toBe(409);
      expect(state.world.adjustments.size).toBe(2);
    });
  });
});
