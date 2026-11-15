import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAnonymous } from './helpers/session';
import { setupAllowanceWorld, type AllowanceWorld } from './helpers/allowanceWorld';
describe('お小遣いの読み取りだけの振り分け', () => {
  let world: AllowanceWorld;
  beforeEach(() => {
    world = setupAllowanceWorld();
  });
  afterEach(() => {
    world.world.mock.reset();
    vi.restoreAllMocks();
  });
  it('GET だけが認証に進む', async () => {
    expect((await callAnonymous('GET', '/v1/months/current/allowances')).statusCode).toBe(401);
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s は存在しない', async (method) => {
    expect((await callAnonymous(method, '/v1/months/current/allowances')).statusCode).toBe(404);
  });
});
