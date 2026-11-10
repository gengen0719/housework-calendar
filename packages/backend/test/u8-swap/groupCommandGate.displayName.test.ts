import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as groupCommandGate from '../../src/services/groupCommandGate';
import { setupWorld, stubLineFetch } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE, seedFamily, seedUser } from '../u2-invitation/helpers/seed';
import {
  FAKE_U8_GROUP_ID,
  FAKE_U8_MARKER_DISPLAY_NAME,
  FAKE_U8_UNREGISTERED_GROUP_ID,
} from '../fixtures/fakeSecrets';

describe('runGroupOperation の表示名とログ（BR9.18、NFR2.65）', () => {
  let world: ReturnType<typeof setupWorld>;
  let logs: string[];

  beforeEach(() => {
    world = setupWorld();
    stubLineFetch();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
    seedFamily(world.families, { notificationGroupId: FAKE_U8_GROUP_ID });
    world.notificationGroups.set(FAKE_U8_GROUP_ID, {
      groupId: FAKE_U8_GROUP_ID,
      familyId: FAMILY_ID,
      registeredByUserId: PEOPLE.mother.userId,
      registeredAt: '2026-11-02T00:00:00.000Z',
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('利用者の記録の表示名を、そのまま第 2 引数で渡す', async () => {
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    const operation = vi.fn(async () => 'ok');
    await groupCommandGate.runGroupOperation(FAKE_U8_GROUP_ID, 'U_taro', operation);
    expect(operation).toHaveBeenCalledWith(
      { familyId: FAMILY_ID, userId: PEOPLE.taro.userId, role: 'child' },
      PEOPLE.taro.displayName,
    );
  });

  it('引数が 1 つの操作も呼べる', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const outcome = await groupCommandGate.runGroupOperation(
      FAKE_U8_GROUP_ID,
      'U_mother',
      async (ctx) => ctx.role,
    );
    expect(outcome).toEqual({ status: 'done', value: 'admin' });
  });

  it('GROUP_NOT_REGISTERED のログに groupId がない', async () => {
    await groupCommandGate.runGroupOperation(
      FAKE_U8_UNREGISTERED_GROUP_ID,
      'U_mother',
      async () => 1,
    );
    const row = JSON.parse(logs.find((l) => l.includes('GROUP_COMMAND_REJECTED')) ?? '{}');
    expect(row).toMatchObject({ event: 'GROUP_COMMAND_REJECTED', reason: 'GROUP_NOT_REGISTERED' });
    expect(row).not.toHaveProperty('groupId');
    expect(logs.join('')).not.toContain(FAKE_U8_UNREGISTERED_GROUP_ID);
  });

  it('NOT_FAMILY_MEMBER のログには理由とアプリの利用者 ID だけがある', async () => {
    seedUser(world.users, 'jiro', { familyId: 'fam-other', role: 'child' });
    await groupCommandGate.runGroupOperation(FAKE_U8_GROUP_ID, 'U_jiro', async () => 1);
    const row = JSON.parse(logs.find((l) => l.includes('GROUP_COMMAND_REJECTED')) ?? '{}');
    expect(row).toMatchObject({ reason: 'NOT_FAMILY_MEMBER', userId: PEOPLE.jiro.userId });
    expect(row).not.toHaveProperty('groupId');
    expect(logs.join('')).not.toContain('U_jiro');
  });

  it('表示名の目印はログに出ない', async () => {
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    const taro = world.users.get(PEOPLE.taro.userId);
    if (taro) taro.displayName = FAKE_U8_MARKER_DISPLAY_NAME;
    await groupCommandGate.runGroupOperation(FAKE_U8_GROUP_ID, 'U_taro', async () => 1);
    expect(logs.join('')).not.toContain('目印の表示名');
  });
});
