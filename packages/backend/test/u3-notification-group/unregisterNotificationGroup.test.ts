import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as familyRepository from '../../src/repositories/familyRepository';
import * as familyMemberService from '../../src/services/familyMemberService';
import * as groupCommandGate from '../../src/services/groupCommandGate';
import { setupWorld, stubLineFetch } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE, seedFamily, seedUser } from '../u2-invitation/helpers/seed';

const GROUP = 'C_group_1';
const REGISTERED_AT = '2026-11-02T00:00:00.000Z';

function canceled(...codes: string[]) {
  return new TransactionCanceledException({
    message: 'cancelled',
    $metadata: {},
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('解除の取引の組み立てと読み分け', () => {
  beforeEach(() => {
    setupWorld();
  });

  it('グループの Delete（家族の条件）と、家族の REMOVE（グループの条件）を組む', () => {
    const items = familyRepository.buildUnregisterNotificationGroupItems({
      groupId: GROUP,
      familyId: FAMILY_ID,
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.Delete).toMatchObject({
      Key: { groupId: GROUP },
      ConditionExpression: 'familyId = :myFamily',
      ExpressionAttributeValues: { ':myFamily': FAMILY_ID },
    });
    expect(items[1]?.Update).toMatchObject({
      Key: { familyId: FAMILY_ID },
      UpdateExpression: 'REMOVE notificationGroupId',
      ConditionExpression: 'notificationGroupId = :groupId',
      ExpressionAttributeValues: { ':groupId': GROUP },
    });
  });

  it('条件の外れと競合だけなら stale', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(
      familyRepository.classifyUnregisterCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'TransactionConflict' },
      ]),
    ).toBe('stale');
    expect(
      familyRepository.classifyUnregisterCancellation([
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('stale');
    vi.restoreAllMocks();
  });

  it('思いがけない Code が混じる、または理由がなければ undefined', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(
      familyRepository.classifyUnregisterCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ValidationError' },
      ]),
    ).toBeUndefined();
    expect(familyRepository.classifyUnregisterCancellation([{ Code: 'None' }])).toBeUndefined();
    expect(familyRepository.classifyUnregisterCancellation(undefined)).toBeUndefined();
    vi.restoreAllMocks();
  });

  it('思いがけない Code の失敗は投げ直される', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const world = setupWorld();
    world.mock.on(TransactWriteCommand).rejects(canceled('ValidationError', 'None'));
    await expect(
      familyRepository.unregisterNotificationGroup({ groupId: GROUP, familyId: FAMILY_ID }),
    ).rejects.toBeInstanceOf(TransactionCanceledException);
    vi.restoreAllMocks();
  });
});

describe('古い leave の判定とやり直し', () => {
  let world: ReturnType<typeof setupWorld>;

  beforeEach(() => {
    world = setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    seedFamily(world.families, { notificationGroupId: GROUP });
    world.notificationGroups.set(GROUP, {
      groupId: GROUP,
      familyId: FAMILY_ID,
      registeredByUserId: PEOPLE.mother.userId,
      registeredAt: REGISTERED_AT,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('登録より後の時刻の leave なら解除する', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup(
      GROUP,
      Date.parse(REGISTERED_AT) + 1,
    );
    expect(world.notificationGroups.has(GROUP)).toBe(false);
    expect(world.families.get(FAMILY_ID)?.notificationGroupId).toBeUndefined();
  });

  it('登録と同じ時刻の leave も解除する（古いとは言えない）', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup(GROUP, Date.parse(REGISTERED_AT));
    expect(world.notificationGroups.has(GROUP)).toBe(false);
  });

  it('登録より 5 秒を超えて前の時刻の leave は何もしない', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup(
      GROUP,
      Date.parse(REGISTERED_AT) - 5001,
    );
    expect(world.notificationGroups.has(GROUP)).toBe(true);
    expect(world.families.get(FAMILY_ID)?.notificationGroupId).toBe(GROUP);
  });

  it('境界: 登録のちょうど 5 秒前の leave は、時計のずれとみなして解除する', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup(
      GROUP,
      Date.parse(REGISTERED_AT) - 5000,
    );
    expect(world.notificationGroups.has(GROUP)).toBe(false);
    expect(world.families.get(FAMILY_ID)?.notificationGroupId).toBeUndefined();
  });

  it('時刻がないイベントは解除する', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup(GROUP);
    expect(world.notificationGroups.has(GROUP)).toBe(false);
  });

  it('グループの記録がなければ何もしない', async () => {
    await familyMemberService.unregisterNotificationGroupByGroup('C_unknown');
    expect(world.notificationGroups.has(GROUP)).toBe(true);
  });

  it('家族の指す先が別のグループに食い違うときは、グループの記録だけを消して終える（家族は触らない）', async () => {
    world.families.set(FAMILY_ID, { ...world.families.get(FAMILY_ID), notificationGroupId: 'C_x' });
    await familyMemberService.unregisterNotificationGroupByGroup(GROUP);
    expect(world.notificationGroups.has(GROUP)).toBe(false);
    expect(world.families.get(FAMILY_ID)?.notificationGroupId).toBe('C_x');
  });

  it('家族の指す先が空のときも、グループの記録だけを消して終える', async () => {
    const family = { ...world.families.get(FAMILY_ID) };
    delete family.notificationGroupId;
    world.families.set(FAMILY_ID, family);
    await familyMemberService.unregisterNotificationGroupByGroup(GROUP);
    expect(world.notificationGroups.has(GROUP)).toBe(false);
  });

  it('競合だけが続くと（家族はこのグループを指したまま）、やり直しても断られて投げる', async () => {
    world.mock.on(TransactWriteCommand).rejects(canceled('None', 'TransactionConflict'));
    await expect(familyMemberService.unregisterNotificationGroupByGroup(GROUP)).rejects.toThrow();
    expect(world.notificationGroups.has(GROUP)).toBe(true);
  });
});

describe('groupCommandGate.runGroupOperation（家族の確かめ）', () => {
  let world: ReturnType<typeof setupWorld>;
  const operation = vi.fn(async () => 'ok');

  beforeEach(() => {
    world = setupWorld();
    stubLineFetch();
    operation.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    seedFamily(world.families, { notificationGroupId: GROUP });
    world.notificationGroups.set(GROUP, {
      groupId: GROUP,
      familyId: FAMILY_ID,
      registeredByUserId: PEOPLE.mother.userId,
      registeredAt: REGISTERED_AT,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('登録されていないグループは GROUP_NOT_REGISTERED', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const outcome = await groupCommandGate.runGroupOperation('C_none', 'U_mother', operation);
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'GROUP_NOT_REGISTERED' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('家族のメンバーなら、家族・利用者・役割つきで操作を呼ぶ', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const outcome = await groupCommandGate.runGroupOperation(GROUP, 'U_mother', operation);
    expect(outcome).toEqual({ status: 'done', value: 'ok' });
    // U8 で、読んだ利用者の記録の表示名を第 2 引数に足した（ctx は変わらない）
    expect(operation).toHaveBeenCalledWith(
      { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' },
      PEOPLE.mother.displayName,
    );
  });

  it('別の家族の人は NOT_FAMILY_MEMBER', async () => {
    seedUser(world.users, 'hanako', { familyId: 'fam-other', role: 'admin' });
    const outcome = await groupCommandGate.runGroupOperation(GROUP, 'U_hanako', operation);
    expect(outcome).toMatchObject({ status: 'rejected', reason: 'NOT_FAMILY_MEMBER' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('ブロック中・家族なし・送り主なしは NOT_FAMILY_MEMBER', async () => {
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child', friendStatus: 'blocked' });
    seedUser(world.users, 'jiro');
    for (const id of ['U_taro', 'U_jiro', undefined]) {
      const outcome = await groupCommandGate.runGroupOperation(GROUP, id, operation);
      expect(outcome).toMatchObject({ status: 'rejected', reason: 'NOT_FAMILY_MEMBER' });
    }
    expect(operation).not.toHaveBeenCalled();
  });

  it('断る message に家族の名前を入れない', async () => {
    const outcome = await groupCommandGate.runGroupOperation(GROUP, undefined, operation);
    expect(JSON.stringify(outcome)).not.toContain('山田');
  });
});
