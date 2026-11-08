import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, KEY_1, NOW, PEOPLE, seedFamily, seedUser } from './helpers/seed';

const TOKEN = 'ValidValidValidValid12';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('acceptInvitation: 利用者の条件で断られたが理由が読み直しても見つからないとき（R-06）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    seedFamily(world.families, { currentInvitationToken: TOKEN, currentInvitationId: 'inv-1' });
    seedUser(world.users, 'hanako');
    world.invitations.set(TOKEN, {
      token: TOKEN,
      invitationId: 'inv-1',
      familyId: FAMILY_ID,
      createdByUserId: PEOPLE.mother.userId,
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      status: 'active',
    });
  });

  it('投げる前に event・userId・familyId を warn に書く。印は書かない', async () => {
    world.mock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'user condition',
        $metadata: {},
        CancellationReasons: [
          { Code: 'ConditionalCheckFailed' },
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'None' },
        ],
      }),
    );
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await expect(
      familyMemberService.acceptInvitation(PEOPLE.hanako.userId, TOKEN, KEY_1, NOW),
    ).rejects.toThrow('理由を読み取れません');
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    const warn = lines.find((l) => l.includes('INVITATION_ACCEPT_USER_CONDITION_UNEXPLAINED'));
    expect(warn).toBeDefined();
    expect(warn).toContain('"level":"warn"');
    expect(warn).toContain(`"userId":"${PEOPLE.hanako.userId}"`);
    expect(warn).toContain(`"familyId":"${FAMILY_ID}"`);
    expect(warn).not.toContain(TOKEN);
  });
});
