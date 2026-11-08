import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log, logger } from '../../src/lib/logger';
import * as groupCommandGate from '../../src/services/groupCommandGate';
import { setupWorld, stubLineFetch } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, NOW, PEOPLE, seedFamily, seedUser } from '../u2-invitation/helpers/seed';

const GROUP = 'C_group_1';

describe('groupCommandGate（登録の確かめ）', () => {
  let world: ReturnType<typeof setupWorld>;
  let logs: string[];

  beforeEach(() => {
    world = setupWorld();
    stubLineFetch();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void logs.push(String(l)));
    seedFamily(world.families);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('authorizeRegister: 友だちの管理者なら、利用者の家族の ctx を返す', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    expect(await groupCommandGate.authorizeRegister('U_mother')).toEqual({
      familyId: FAMILY_ID,
      userId: PEOPLE.mother.userId,
      role: 'admin',
    });
  });

  it('authorizeRegister: 子供は null', async () => {
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    expect(await groupCommandGate.authorizeRegister('U_taro')).toBeNull();
  });

  it('authorizeRegister: 家族に入っていない人は null', async () => {
    seedUser(world.users, 'hanako');
    expect(await groupCommandGate.authorizeRegister('U_hanako')).toBeNull();
  });

  it('authorizeRegister: ブロック中の管理者は null', async () => {
    seedUser(world.users, 'jiro', { familyId: FAMILY_ID, role: 'admin', friendStatus: 'blocked' });
    expect(await groupCommandGate.authorizeRegister('U_jiro')).toBeNull();
  });

  it('authorizeRegister: 記録のない人と送り主が分からないイベントは null', async () => {
    expect(await groupCommandGate.authorizeRegister('U_nobody')).toBeNull();
    expect(await groupCommandGate.authorizeRegister(undefined)).toBeNull();
  });

  it('runRegister: 管理者なら登録し、家族の名前を返す', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    const outcome = await groupCommandGate.runRegister(GROUP, 'U_mother', NOW);
    expect(outcome).toEqual({ status: 'registered', familyName: '山田家' });
    expect(world.notificationGroups.get(GROUP)?.familyId).toBe(FAMILY_ID);
  });

  it('runRegister: 子供は ADMIN_ONLY で、断ったログに利用者の ID が出る（グループの名前や本文は出ない）', async () => {
    seedUser(world.users, 'taro', { familyId: FAMILY_ID, role: 'child' });
    const outcome = await groupCommandGate.runRegister(GROUP, 'U_taro', NOW);
    expect(outcome).toEqual({ status: 'rejected', reason: 'ADMIN_ONLY' });
    const line = logs.find((l) => l.includes('NOTIFICATION_GROUP_REJECTED'));
    expect(line).toContain('ADMIN_ONLY');
    expect(line).toContain(PEOPLE.taro.userId);
    expect(line).toContain(GROUP);
    expect(world.notificationGroups.size).toBe(0);
  });

  it('runRegister: 別の家族のグループは GROUP_USED_BY_OTHER_FAMILY', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    world.notificationGroups.set(GROUP, {
      groupId: GROUP,
      familyId: 'fam-sato',
      registeredByUserId: 'u',
      registeredAt: '2026-11-01T00:00:00.000Z',
    });
    expect(await groupCommandGate.runRegister(GROUP, 'U_mother', NOW)).toEqual({
      status: 'rejected',
      reason: 'GROUP_USED_BY_OTHER_FAMILY',
    });
    expect(logs.some((l) => l.includes('GROUP_USED_BY_OTHER_FAMILY'))).toBe(true);
  });

  it('runRegister: 名前は 100 文字で切って残す', async () => {
    seedUser(world.users, 'mother', { familyId: FAMILY_ID, role: 'admin' });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ groupName: 'あ'.repeat(150) }), { status: 200 }),
      ),
    );
    await groupCommandGate.runRegister(GROUP, 'U_mother', NOW);
    expect(String(world.notificationGroups.get(GROUP)?.groupName)).toHaveLength(100);
  });
});

describe('ログの伏せ字（NFR5.8）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groupName・text・displayName は、型をすり抜けても実行時に伏せる', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void lines.push(String(l)));
    // 型では書けない項目を、あえてすり抜けさせる
    log('info', {
      event: 'X',
      groupName: '山田家',
      text: '登録',
      displayName: 'お母さん',
      nested: { groupName: '山田家', text: '本文' },
    } as never);
    const out = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(out.groupName).toBe('[REDACTED]');
    expect(out.text).toBe('[REDACTED]');
    expect(out.displayName).toBe('[REDACTED]');
    expect(out.nested).toEqual({ groupName: '[REDACTED]', text: '[REDACTED]' });
    expect(lines[0]).not.toContain('山田家');
  });

  it('大文字小文字の違い（GroupName）と display_name も伏せる', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void lines.push(String(l)));
    log('info', {
      event: 'X',
      GroupName: '山田家',
      display_name: 'お母さん',
      TEXT: '本文',
    } as never);
    const out = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(out.GroupName).toBe('[REDACTED]');
    expect(out.display_name).toBe('[REDACTED]');
    expect(out.TEXT).toBe('[REDACTED]');
  });

  it('深さの上限を超えたオブジェクトは中身を出さず [TRUNCATED] にする', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void lines.push(String(l)));
    log('info', {
      event: 'X',
      a: { b: { c: { d: { e: { groupName: '山田家', note: 'deep' }, ok: 1 } } } },
    } as never);
    const out = JSON.parse(lines[0] as string) as {
      a: { b: { c: { d: { e: unknown; ok: number } } } };
    };
    expect(out.a.b.c.d.e).toBe('[TRUNCATED]');
    expect(out.a.b.c.d.ok).toBe(1);
    expect(lines[0]).not.toContain('山田家');
  });

  it('context・textLength のように名前の一部が似ているだけの項目は伏せない', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((l: string) => void lines.push(String(l)));
    logger.info({ event: 'X', context: 'ok', textLength: 3, groupId: 'C_1' });
    const out = JSON.parse(lines[0] as string) as Record<string, unknown>;
    expect(out).toMatchObject({ context: 'ok', textLength: 3, groupId: 'C_1' });
  });

  it('型で groupName・text・displayName を受け付けない', () => {
    // @ts-expect-error groupName はログに書けない
    const a: Parameters<typeof logger.info>[0] = { event: 'X', groupName: '山田家' };
    // @ts-expect-error text はログに書けない
    const b: Parameters<typeof logger.info>[0] = { event: 'X', text: '本文' };
    // @ts-expect-error displayName はログに書けない
    const c: Parameters<typeof logger.info>[0] = { event: 'X', displayName: 'お母さん' };
    expect([a, b, c]).toHaveLength(3);
  });
});
