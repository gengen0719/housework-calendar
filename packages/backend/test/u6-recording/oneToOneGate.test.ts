import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeChild } from '../../src/services/oneToOneGate';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { CHILDREN, seedHousehold } from './helpers/seed';
import { FAKE_OUTSIDER_LINE_ID, FAKE_UNKNOWN_LINE_ID } from '../fixtures/fakeSecrets';

describe('authorizeChild（1 対 1 の入口。NFR4.56、BR7.1）', () => {
  let world: ReturnType<typeof setupWorld>;

  beforeEach(() => {
    world = setupWorld();
    seedHousehold(world);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const calendarReads = (): number =>
    world.hooks.readLog.filter(
      (entry) => entry.table === CALENDAR_TABLE || entry.table === CHORE_TYPES_TABLE,
    ).length;

  it('友だちで家族に入っている子供は child（家族の ctx を利用者の記録から作る）', async () => {
    expect(await authorizeChild('U_taro')).toEqual({
      kind: 'child',
      ctx: { familyId: FAMILY_ID, userId: CHILDREN.taro.userId, role: 'child' },
    });
  });

  it('友だちで家族に入っている管理者は admin', async () => {
    expect(await authorizeChild('U_mother')).toEqual({ kind: 'admin' });
  });

  it('友だちだが家族に入っていない人は outsider', async () => {
    world.users.set('user-lonely', {
      userId: 'user-lonely',
      lineUserId: FAKE_OUTSIDER_LINE_ID,
      displayName: 'ひとり',
      friendStatus: 'friend',
      registeredAt: '2026-11-01T00:00:00.000Z',
      friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(await authorizeChild(FAKE_OUTSIDER_LINE_ID)).toEqual({ kind: 'outsider' });
  });

  it('利用者の記録がない人は outsider', async () => {
    expect(await authorizeChild(FAKE_UNKNOWN_LINE_ID)).toEqual({ kind: 'outsider' });
  });

  it('ブロック中の子供は outsider', async () => {
    const taro = world.users.get(CHILDREN.taro.userId);
    world.users.set(CHILDREN.taro.userId, { ...taro, friendStatus: 'blocked' });
    expect(await authorizeChild('U_taro')).toEqual({ kind: 'outsider' });
  });

  it('lineUserId がないイベントは outsider', async () => {
    expect(await authorizeChild(undefined)).toEqual({ kind: 'outsider' });
  });

  it('admin と outsider では Calendar・ChoreTypes を 1 回も読まない', async () => {
    await authorizeChild('U_mother'); // admin
    await authorizeChild(FAKE_UNKNOWN_LINE_ID); // outsider
    await authorizeChild(undefined); // outsider
    expect(calendarReads()).toBe(0);
  });
});
