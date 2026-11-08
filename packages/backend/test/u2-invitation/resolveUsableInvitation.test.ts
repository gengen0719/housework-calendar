import { beforeEach, describe, expect, it } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, FAMILY_NAME, NOW, PEOPLE, seedFamily } from './helpers/seed';

const TOKEN = 'ValidValidValidValid12';
const DAY_MS = 24 * 60 * 60 * 1000;

let world: ReturnType<typeof setupWorld>;

function seedInvitation(overrides: Record<string, unknown> = {}): void {
  world.invitations.set(TOKEN, {
    token: TOKEN,
    invitationId: 'inv-1',
    familyId: FAMILY_ID,
    createdByUserId: PEOPLE.mother.userId,
    createdAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
    status: 'active',
    ttl: Math.floor(NOW.getTime() / 1000) + 8 * 24 * 60 * 60,
    ...overrides,
  });
}

describe('resolveUsableInvitation', () => {
  beforeEach(() => {
    world = setupWorld();
    seedFamily(world.families, { currentInvitationToken: TOKEN, currentInvitationId: 'inv-1' });
  });

  it('使える招待なら、招待と家族を返す', async () => {
    seedInvitation();
    const result = await familyMemberService.resolveUsableInvitation(TOKEN, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.invitation.token).toBe(TOKEN);
      expect(result.value.family.name).toBe(FAMILY_NAME);
    }
  });

  it('形が合わない印は、DynamoDB を読まずに INVITATION_INVALID', async () => {
    seedInvitation();
    for (const bad of [
      '',
      'short',
      `${TOKEN}x`,
      'Invalid!Invalid!Invalid',
      'あいうえおかきくけこさしすせそたちつてとなに',
    ]) {
      const result = await familyMemberService.resolveUsableInvitation(bad, NOW);
      expect(result).toEqual({ ok: false, reason: 'INVITATION_INVALID' });
    }
    expect(world.mock.calls()).toHaveLength(0);
  });

  it('招待の項目がない（TTL で消えた・もともとない）なら INVITATION_INVALID', async () => {
    const result = await familyMemberService.resolveUsableInvitation(TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'INVITATION_INVALID' });
  });

  it('replaced の招待は INVITATION_INVALID', async () => {
    seedInvitation({ status: 'replaced' });
    const result = await familyMemberService.resolveUsableInvitation(TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'INVITATION_INVALID' });
  });

  it('家族のいまの印がこの印と違えば INVITATION_INVALID（active のままでも断る）', async () => {
    seedInvitation();
    const family = world.families.get(FAMILY_ID);
    if (family) family.currentInvitationToken = 'OtherOtherOtherOther12';
    const result = await familyMemberService.resolveUsableInvitation(TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'INVITATION_INVALID' });
  });

  it('家族の記録がなければ INVITATION_INVALID', async () => {
    seedInvitation();
    world.families.delete(FAMILY_ID);
    const result = await familyMemberService.resolveUsableInvitation(TOKEN, NOW);
    expect(result).toEqual({ ok: false, reason: 'INVITATION_INVALID' });
  });

  it('期限の 1 ミリ秒前は使え、期限ちょうどと過ぎたあとは使えない', async () => {
    seedInvitation();
    const expiresAt = NOW.getTime() + DAY_MS;
    const before = await familyMemberService.resolveUsableInvitation(
      TOKEN,
      new Date(expiresAt - 1),
    );
    const exact = await familyMemberService.resolveUsableInvitation(TOKEN, new Date(expiresAt));
    const after = await familyMemberService.resolveUsableInvitation(TOKEN, new Date(expiresAt + 1));
    expect(before.ok).toBe(true);
    expect(exact.ok).toBe(false);
    expect(after.ok).toBe(false);
  });

  it('使えない理由はどれも同じ結果で、理由を分けない', async () => {
    const results = [];
    results.push(await familyMemberService.resolveUsableInvitation('short', NOW));
    results.push(await familyMemberService.resolveUsableInvitation(TOKEN, NOW));
    seedInvitation({ status: 'replaced' });
    results.push(await familyMemberService.resolveUsableInvitation(TOKEN, NOW));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});
