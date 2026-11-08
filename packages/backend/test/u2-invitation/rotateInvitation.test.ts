import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invitation } from '../../src/models';
import * as familyRepository from '../../src/repositories/familyRepository';
import * as requestRecordRepository from '../../src/repositories/requestRecordRepository';
import * as familyMemberService from '../../src/services/familyMemberService';
import {
  FAMILIES_TABLE,
  INVITATIONS_TABLE,
  REQUEST_RECORDS_TABLE,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, KEY_1, LIFF_URL, NOW, PEOPLE, seedFamily, seedUser } from './helpers/seed';

const invitation: Invitation = {
  token: 'NewTokenNewTokenNewTok',
  invitationId: 'inv-new',
  familyId: FAMILY_ID,
  createdByUserId: PEOPLE.mother.userId,
  createdAt: NOW.toISOString(),
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
  ttl: 1_800_000_000,
};
const view = { url: `${LIFF_URL}?invitation=${invitation.token}`, expiresAt: invitation.expiresAt };
const record = { userId: PEOPLE.mother.userId, idempotencyKey: KEY_1, result: view };

describe('作り直しのトランザクションの組み立て', () => {
  beforeEach(() => {
    setupWorld();
  });

  it('前の招待があれば 4 件: 家族、新しい招待、前の招待、送り直しの記録の順', () => {
    const { items, kinds } = familyRepository.buildRotateInvitationItems(
      {
        familyId: FAMILY_ID,
        previousToken: 'PrevPrevPrevPrevPrevPr',
        previousInvitationExists: true,
        invitation,
        record,
      },
      NOW,
    );
    expect(items).toHaveLength(4);
    expect(kinds).toEqual(['family', 'newInvitation', 'previousInvitation', 'requestRecord']);
  });

  it('前の招待の項目が TTL で消えていれば 3 件（前の招待の Update を含まない）', () => {
    const { items, kinds } = familyRepository.buildRotateInvitationItems(
      {
        familyId: FAMILY_ID,
        previousToken: 'PrevPrevPrevPrevPrevPr',
        previousInvitationExists: false,
        invitation,
        record,
      },
      NOW,
    );
    expect(items).toHaveLength(3);
    expect(kinds).not.toContain('previousInvitation');
  });

  it('最初の招待なら 3 件で、家族の条件は「いまの印の属性がない」', () => {
    const { items } = familyRepository.buildRotateInvitationItems(
      { familyId: FAMILY_ID, previousInvitationExists: false, invitation, record },
      NOW,
    );
    expect(items).toHaveLength(3);
    const update = (items[0] as { Update: { ConditionExpression: string } }).Update;
    expect(update.ConditionExpression).toContain('attribute_not_exists(currentInvitationToken)');
  });

  it('家族の条件は「いまの印が読んだ値と同じ」で、印と ID を新しくする', () => {
    const { items } = familyRepository.buildRotateInvitationItems(
      {
        familyId: FAMILY_ID,
        previousToken: 'PrevPrevPrevPrevPrevPr',
        previousInvitationExists: true,
        invitation,
        record,
      },
      NOW,
    );
    const update = (
      items[0] as {
        Update: {
          TableName: string;
          ConditionExpression: string;
          ExpressionAttributeValues: Record<string, string>;
        };
      }
    ).Update;
    expect(update.TableName).toBe(FAMILIES_TABLE);
    expect(update.ConditionExpression).toContain('currentInvitationToken = :previousToken');
    expect(update.ExpressionAttributeValues).toEqual({
      ':token': invitation.token,
      ':invitationId': 'inv-new',
      ':previousToken': 'PrevPrevPrevPrevPrevPr',
    });
  });

  it('新しい招待は INVITATIONS に、送り直しの記録は operation: createInvitation・target: familyId で書く', () => {
    const { items } = familyRepository.buildRotateInvitationItems(
      { familyId: FAMILY_ID, previousInvitationExists: false, invitation, record },
      NOW,
    );
    expect((items[1] as { Put: { TableName: string } }).Put.TableName).toBe(INVITATIONS_TABLE);
    const put = (
      items[2] as {
        Put: { TableName: string; Item: Record<string, unknown>; ConditionExpression: string };
      }
    ).Put;
    expect(put.TableName).toBe(REQUEST_RECORDS_TABLE);
    expect(put.Item).toMatchObject({
      operation: 'createInvitation',
      target: FAMILY_ID,
      result: view,
    });
    expect(put.ConditionExpression).toBe('attribute_not_exists(idempotencyKey)');
  });

  describe('取り消しの理由の読み分け', () => {
    const kinds: familyRepository.RotateItemKind[] = [
      'family',
      'newInvitation',
      'previousInvitation',
      'requestRecord',
    ];
    const ok = { Code: 'None' };
    const failed = { Code: 'ConditionalCheckFailed' };

    it('送り直しの記録の条件で断られたら requestRecord', () => {
      expect(familyRepository.classifyCancellation([ok, ok, ok, failed], kinds)).toBe(
        'requestRecord',
      );
    });
    it('送り直しの記録と家族の両方なら、記録を先に見る', () => {
      expect(familyRepository.classifyCancellation([failed, ok, ok, failed], kinds)).toBe(
        'requestRecord',
      );
    });
    it('家族の条件で断られたら stale', () => {
      expect(familyRepository.classifyCancellation([failed, ok, ok, ok], kinds)).toBe('stale');
    });
    it('前の招待の条件（TTL で消えた）で断られたら stale', () => {
      expect(familyRepository.classifyCancellation([ok, ok, failed, ok], kinds)).toBe('stale');
    });
    it('取引の競合（TransactionConflict）も stale', () => {
      expect(
        familyRepository.classifyCancellation([ok, ok, ok, { Code: 'TransactionConflict' }], kinds),
      ).toBe('stale');
    });
    it('理由の並びがなければ undefined', () => {
      expect(familyRepository.classifyCancellation(undefined, kinds)).toBeUndefined();
    });
    it('作りの誤りなど、ほかの Code は stale にせず undefined（投げ直す）。Code を warn に出す', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(
        familyRepository.classifyCancellation([ok, ok, ok, { Code: 'ValidationError' }], kinds),
      ).toBeUndefined();
      const lines = log.mock.calls.map((c) => String(c[0]));
      log.mockRestore();
      expect(lines.some((l) => l.includes('"level":"warn"') && l.includes('ValidationError'))).toBe(
        true,
      );
    });
    it('競合と条件の外れ以外が混じるときも undefined', () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      expect(
        familyRepository.classifyCancellation([failed, ok, ok, { Code: 'ValidationError' }], kinds),
      ).toBeUndefined();
      log.mockRestore();
    });
  });

  it('rotateInvitation: 理由が読み取れない失敗は投げ直す', async () => {
    const world = setupWorld();
    world.mock.on(TransactWriteCommand).rejects(new Error('boom'));
    await expect(
      familyRepository.rotateInvitation(
        { familyId: FAMILY_ID, previousInvitationExists: false, invitation, record },
        NOW,
      ),
    ).rejects.toThrow('boom');
  });

  it('rotateInvitation: 理由のない取り消しも投げ直す', async () => {
    const world = setupWorld();
    world.mock
      .on(TransactWriteCommand)
      .rejects(new TransactionCanceledException({ message: 'x', $metadata: {} }));
    await expect(
      familyRepository.rotateInvitation(
        { familyId: FAMILY_ID, previousInvitationExists: false, invitation, record },
        NOW,
      ),
    ).rejects.toThrow();
  });
});

describe('送り直しの記録と U1 の createFamily への足しもの', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('isSameRequest: 操作と対象が同じときだけ同じ', () => {
    const base = {
      userId: 'u',
      idempotencyKey: KEY_1,
      operation: 'createInvitation' as const,
      target: 'fam-1',
      result: view,
      expiresAt: 1,
    };
    expect(requestRecordRepository.isSameRequest(base, 'createInvitation', 'fam-1')).toBe(true);
    expect(requestRecordRepository.isSameRequest(base, 'createInvitation', 'fam-2')).toBe(false);
    expect(requestRecordRepository.isSameRequest(base, 'acceptInvitation', 'fam-1')).toBe(false);
  });

  it('isSameRequest: target のない createFamily 同士は同じ', () => {
    const base = {
      userId: 'u',
      idempotencyKey: KEY_1,
      operation: 'createFamily' as const,
      result: view,
      expiresAt: 1,
    };
    expect(requestRecordRepository.isSameRequest(base, 'createFamily')).toBe(true);
    expect(requestRecordRepository.isSameRequest(base, 'createInvitation', 'fam-1')).toBe(false);
  });

  it('createFamily は familyJoinedAt を入れる', async () => {
    seedUser(world.users, 'mother');
    const result = await familyMemberService.createFamily(
      PEOPLE.mother.userId,
      '山田家',
      KEY_1,
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(world.users.get(PEOPLE.mother.userId)?.familyJoinedAt).toBe(NOW.toISOString());
  });

  it('createFamily: 同じ印で招待を作った記録があれば IDEMPOTENCY_KEY_REUSED', async () => {
    seedUser(world.users, 'mother');
    seedFamily(world.families);
    world.requestRecords.set(`${PEOPLE.mother.userId}#${KEY_1}`, {
      userId: PEOPLE.mother.userId,
      idempotencyKey: KEY_1,
      operation: 'createInvitation',
      target: FAMILY_ID,
      result: view,
      expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
    });
    const result = await familyMemberService.createFamily(
      PEOPLE.mother.userId,
      '山田家',
      KEY_1,
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
