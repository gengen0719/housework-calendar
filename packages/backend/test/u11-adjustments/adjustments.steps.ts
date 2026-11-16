import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../src/entries/api';
import { apiRequest } from '../u1-skeleton-family/helpers/world';
import {
  beginScenario,
  endScenario,
  seedToday,
  NOON,
} from '../u5-assignment-calendar/helpers/scenario';
import {
  CHILDREN,
  seedMonthState,
  sessionForUser,
  userIdOf,
} from '../u5-assignment-calendar/helpers/seed';
import { FAKE_CHORE_TYPE_ID_1 } from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u11-adjustments/adjustments.feature');
let state: ReturnType<typeof beginScenario>;
let response: APIGatewayProxyStructuredResultV2;
let first: APIGatewayProxyStructuredResultV2;
const input = () => ({
  childUserId: CHILDREN.taro.userId,
  kind: 'add',
  amount: 200,
  reason: '手伝いの追加',
});
async function create(body: unknown, actor: 'mother' | 'taro' = 'mother') {
  const event = apiRequest('POST', '/v1/months/2027-01/adjustments', {
    token: sessionForUser(userIdOf(actor)),
    body,
  });
  event.headers['idempotency-key'] = FAKE_CHORE_TYPE_ID_1;
  return handler(event);
}
describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    state = beginScenario();
  });
  AfterEachScenario(endScenario);
  const given = () => seedToday(state, NOON.jan13);
  Scenario('有効な加算と減額を一度だけ保存する', ({ Given, When, Then }) => {
    Given('未確定月の家族に管理者と子供がいる', given);
    When('管理者が同じキーで加算を二度登録する', async () => {
      first = await create(input());
      response = await create(input());
    });
    Then('どちらも201で同じ調整が返る', () => {
      expect(first.statusCode).toBe(201);
      expect(response.statusCode).toBe(201);
      expect(response.body).toBe(first.body);
    });
  });
  Scenario('不正な入力を保存しない', ({ Given, When, Then }) => {
    Given('未確定月の家族に管理者と子供がいる', given);
    When('管理者が空の理由で登録する', async () => {
      response = await create({ ...input(), reason: ' ' });
    });
    Then('422で理由REASON_REQUIREDを返す', () => {
      expect(response.statusCode).toBe(422);
      expect(JSON.parse(String(response.body)).error.reason).toBe('REASON_REQUIRED');
    });
  });
  Scenario('子供からの変更を拒否する', ({ Given, When, Then }) => {
    Given('未確定月の家族に管理者と子供がいる', given);
    When('子供が加算を登録する', async () => {
      response = await create(input(), 'taro');
    });
    Then('403で理由ADMIN_ONLYを返す', () => {
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(String(response.body)).error.reason).toBe('ADMIN_ONLY');
    });
  });
  Scenario('確定月へ登録しない', ({ Given, And, When, Then }) => {
    Given('未確定月の家族に管理者と子供がいる', given);
    And('その月が確定している', () => seedMonthState(state.world.calendar, '2027-01', true));
    When('管理者が加算を登録する', async () => {
      response = await create(input());
    });
    Then('409で理由MONTH_CONFIRMEDを返す', () => {
      expect(response.statusCode).toBe(409);
      expect(JSON.parse(String(response.body)).error.reason).toBe('MONTH_CONFIRMED');
    });
  });
});
