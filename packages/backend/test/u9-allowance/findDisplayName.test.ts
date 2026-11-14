import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAKE_U9_OUTSIDER_USER_ID } from '../fixtures/fakeSecrets';
import { CHILDREN, FAMILY_ID, seedAllowanceHousehold } from './helpers/seed';

let world: ReturnType<typeof setupWorld>;
const scope = { familyId: FAMILY_ID };

beforeEach(() => {
  world = setupWorld();
  seedAllowanceHousehold(world);
});
afterEach(() => {
  world.mock.reset();
});

describe('findDisplayName（BR10.6、ADR-U9-02）', () => {
  it('表示名の文字列だけを返す', async () => {
    expect(await familyMemberService.findDisplayName(scope, CHILDREN.taro.userId)).toEqual({
      ok: true,
      value: CHILDREN.taro.displayName,
    });
  });

  it('記録がなければ NOT_FOUND', async () => {
    expect(await familyMemberService.findDisplayName(scope, FAKE_U9_OUTSIDER_USER_ID)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  it('強い整合性の GetItem を 1 回だけ使う', async () => {
    await familyMemberService.findDisplayName(scope, CHILDREN.taro.userId);
    const reads = world.hooks.readLog.filter((e) => e.table === USERS_TABLE);
    expect(reads).toEqual([{ operation: 'Get', table: USERS_TABLE, consistent: true }]);
  });

  it('戻りに LINE のユーザー ID・役割・家族 ID が含まれない', async () => {
    const result = await familyMemberService.findDisplayName(scope, CHILDREN.taro.userId);
    expect(typeof (result.ok ? result.value : undefined)).toBe('string');
    expect(JSON.stringify(result)).not.toMatch(/lineUserId|familyId|role|friendStatus/);
  });

  it('getFamilyCreatedAt は作成時刻の文字列だけを返す', async () => {
    const createdAt = await familyMemberService.getFamilyCreatedAt(scope);
    expect(typeof createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(createdAt))).toBe(false);
  });
});
