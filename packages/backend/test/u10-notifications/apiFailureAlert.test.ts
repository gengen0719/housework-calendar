import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { handler, routes } from '../../src/entries/api';
import { ApiError } from '../../src/lib/errors';
import { apiRequest } from '../u1-skeleton-family/helpers/world';
import {
  beginScenario,
  endScenario,
  NOON,
  rule,
  saveAs,
  seedToday,
  type ScenarioState,
} from '../u5-assignment-calendar/helpers/scenario';

const sns = mockClient(SNSClient);
let state: ScenarioState;
beforeEach(() => {
  state = beginScenario();
  seedToday(state, NOON.jan13);
  process.env.ALERT_TOPIC_ARN = 'topic';
  sns.reset();
  sns.on(PublishCommand).resolves({});
});
afterEach(() => {
  delete routes['GET /v1/alert-regression'];
  delete process.env.ALERT_TOPIC_ARN;
  endScenario();
});
function expectSanitizedAlert() {
  expect(sns.commandCalls(PublishCommand)).toHaveLength(1);
  expect(JSON.parse(sns.commandCalls(PublishCommand)[0]!.args[0].input.Message!)).toEqual({
    event: 'OPERATIONAL_FAILURE',
    entry: 'api',
    reason: 'internal',
    runbook: 'docs/notification-runbook.md',
  });
}
describe('API障害の定型通知の回帰', () => {
  it('本物の割り当て保存が残り時間不足なら500の返事を保って通知する', async () => {
    const response = await saveAs(
      'mother',
      '2027-01',
      [rule('dishes', 'taro', [1])],
      {},
      {
        getRemainingTimeInMillis: () => 4000,
      },
    );
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(String(response.body))).toEqual({ error: { reason: 'INTERNAL' } });
    expect(state.world.hooks.transactionSizes).toEqual([]);
    expectSanitizedAlert();
  });
  it('本物の割り当て保存が競合上限なら通知する', async () => {
    state.world.hooks.failTransaction(1, 'TransactionConflict');
    state.world.hooks.failTransaction(2, 'TransactionConflict');
    const response = await saveAs('mother', '2027-01', [rule('dishes', 'taro', [1])]);
    expect(response.statusCode).toBe(500);
    expect(state.world.hooks.transactionSizes).toHaveLength(2);
    expectSanitizedAlert();
  });
  it.each([500, 503])('ApiError %sの応答を変更せず通知する', async (status) => {
    routes['GET /v1/alert-regression'] = async () => {
      throw new ApiError(status, 'INTERNAL');
    };
    const result = await handler(apiRequest('GET', '/v1/alert-regression'));
    expect(result.statusCode).toBe(status);
    expectSanitizedAlert();
  });
  it('通常のErrorも定型通知し、任意の例外本文を含めない', async () => {
    routes['GET /v1/alert-regression'] = async () => {
      throw new Error('private request body');
    };
    expect((await handler(apiRequest('GET', '/v1/alert-regression'))).statusCode).toBe(500);
    expectSanitizedAlert();
  });
  it.each([400, 401, 403, 404, 409, 422])('ApiError %sは障害通知しない', async (status) => {
    routes['GET /v1/alert-regression'] = async () => {
      throw new ApiError(status, 'INTERNAL');
    };
    expect((await handler(apiRequest('GET', '/v1/alert-regression'))).statusCode).toBe(status);
    expect(sns.commandCalls(PublishCommand)).toHaveLength(0);
  });
});
