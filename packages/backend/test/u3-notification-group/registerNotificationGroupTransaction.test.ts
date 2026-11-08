import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationGroup } from '../../src/models';
import * as familyRepository from '../../src/repositories/familyRepository';
import * as familyMemberService from '../../src/services/familyMemberService';
import {
  FAMILIES_TABLE,
  NOTIFICATION_GROUPS_TABLE,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld, stubLineFetch } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, NOW, PEOPLE, seedFamily } from '../u2-invitation/helpers/seed';

const group: NotificationGroup = {
  groupId: 'C_new',
  familyId: FAMILY_ID,
  registeredByUserId: PEOPLE.mother.userId,
  registeredAt: NOW.toISOString(),
};

const ok = { Code: 'None' };
const failed = { Code: 'ConditionalCheckFailed' };

describe('登録のトランザクションの組み立て', () => {
  beforeEach(() => {
    setupWorld();
  });

  it('前のグループがあれば 3 件: 新しいグループ、家族、前のグループの順', () => {
    const { items, kinds } = familyRepository.buildRegisterNotificationGroupItems({
      familyId: FAMILY_ID,
      group,
      currentGroupId: 'C_old',
      deletePreviousGroup: true,
    });
    expect(items).toHaveLength(3);
    expect(kinds).toEqual(['newGroup', 'family', 'previousGroup']);
    expect((items[0] as { Put: { TableName: string } }).Put.TableName).toBe(
      NOTIFICATION_GROUPS_TABLE,
    );
    expect((items[2] as { Delete: { Key: unknown } }).Delete.Key).toEqual({ groupId: 'C_old' });
  });

  it('最初の登録なら 2 件で、家族の条件は「notificationGroupId の属性がない」', () => {
    const { items, kinds } = familyRepository.buildRegisterNotificationGroupItems({
      familyId: FAMILY_ID,
      group,
      deletePreviousGroup: false,
    });
    expect(items).toHaveLength(2);
    expect(kinds).toEqual(['newGroup', 'family']);
    const update = (
      items[1] as {
        Update: {
          TableName: string;
          ConditionExpression: string;
          ExpressionAttributeValues: Record<string, string>;
        };
      }
    ).Update;
    expect(update.TableName).toBe(FAMILIES_TABLE);
    expect(update.ConditionExpression).toBe(
      'attribute_exists(familyId) AND attribute_not_exists(notificationGroupId)',
    );
    expect(update.ExpressionAttributeValues).toEqual({ ':groupId': 'C_new' });
  });

  it('家族の条件は「いまの値が読んだ値と同じ」で、家族の記録がなければ断る', () => {
    const { items } = familyRepository.buildRegisterNotificationGroupItems({
      familyId: FAMILY_ID,
      group,
      currentGroupId: 'C_old',
      deletePreviousGroup: true,
    });
    const update = (
      items[1] as {
        Update: {
          ConditionExpression: string;
          ExpressionAttributeValues: Record<string, string>;
        };
      }
    ).Update;
    expect(update.ConditionExpression).toBe(
      'attribute_exists(familyId) AND notificationGroupId = :currentGroupId',
    );
    expect(update.ExpressionAttributeValues).toEqual({
      ':groupId': 'C_new',
      ':currentGroupId': 'C_old',
    });
  });

  it('前のグループの記録が実在しないときは Delete を入れず、家族の条件は読んだ値のまま', () => {
    const { items, kinds } = familyRepository.buildRegisterNotificationGroupItems({
      familyId: FAMILY_ID,
      group,
      currentGroupId: 'C_old',
      deletePreviousGroup: false,
    });
    expect(items).toHaveLength(2);
    expect(kinds).not.toContain('previousGroup');
    const update = (items[1] as { Update: { ConditionExpression: string } }).Update;
    expect(update.ConditionExpression).toContain('notificationGroupId = :currentGroupId');
  });
});

describe('登録の取り消しの理由の読み分け', () => {
  const kinds: familyRepository.RegisterItemKind[] = ['newGroup', 'family', 'previousGroup'];
  beforeEach(() => {
    setupWorld();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('新しいグループの条件で断られたら newGroup（読み直す）', () => {
    expect(familyRepository.classifyRegisterCancellation([failed, ok, ok], kinds)).toBe('newGroup');
  });
  it('新しいグループと家族の両方なら、新しいグループを先に見る', () => {
    expect(familyRepository.classifyRegisterCancellation([failed, failed, ok], kinds)).toBe(
      'newGroup',
    );
  });
  it('家族の条件で断られたら stale', () => {
    expect(familyRepository.classifyRegisterCancellation([ok, failed, ok], kinds)).toBe('stale');
  });
  it('前のグループの条件で断られたら stale', () => {
    expect(familyRepository.classifyRegisterCancellation([ok, ok, failed], kinds)).toBe('stale');
  });
  it('取引の競合（TransactionConflict）だけでも stale', () => {
    expect(
      familyRepository.classifyRegisterCancellation(
        [ok, { Code: 'TransactionConflict' }, ok],
        kinds,
      ),
    ).toBe('stale');
  });
  it('ほかの Code（ValidationError など）が混じるときは undefined（投げ直す）', () => {
    expect(
      familyRepository.classifyRegisterCancellation(
        [ok, failed, { Code: 'ValidationError' }],
        kinds,
      ),
    ).toBeUndefined();
  });
  it('理由の並びがなければ undefined', () => {
    expect(familyRepository.classifyRegisterCancellation(undefined, kinds)).toBeUndefined();
  });
  it('断られたら Code の一覧を warn に残す', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    familyRepository.classifyRegisterCancellation([ok, failed, ok], kinds);
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(
      lines.some(
        (l) =>
          l.includes('"level":"warn"') && l.includes('NOTIFICATION_GROUP_TRANSACTION_CANCELED'),
      ),
    ).toBe(true);
  });
});

describe('登録のやり直しと投げ直し', () => {
  let world: ReturnType<typeof setupWorld>;
  const ctx = { familyId: FAMILY_ID, userId: PEOPLE.mother.userId, role: 'admin' as const };

  beforeEach(() => {
    world = setupWorld();
    stubLineFetch();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    seedFamily(world.families);
  });

  it('registerNotificationGroup: 理由が読み取れない失敗は投げ直す', async () => {
    world.mock.on(TransactWriteCommand).rejects(new Error('boom'));
    await expect(
      familyRepository.registerNotificationGroup({
        familyId: FAMILY_ID,
        group,
        deletePreviousGroup: false,
      }),
    ).rejects.toThrow('boom');
  });

  it('サービス: 思いがけない Code で断られたらやり直さず投げ直す（1 回だけ書こうとする）', async () => {
    world.mock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'x',
        $metadata: {},
        CancellationReasons: [ok, { Code: 'ValidationError' }],
      }),
    );
    await expect(
      familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW),
    ).rejects.toThrow();
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('サービス: 競合だけが続くと、1 回だけやり直して INTERNAL を返す', async () => {
    world.mock.on(TransactWriteCommand).rejects(
      new TransactionCanceledException({
        message: 'x',
        $metadata: {},
        CancellationReasons: [ok, { Code: 'TransactionConflict' }],
      }),
    );
    const result = await familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW);
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('サービス: 1 回目が stale、2 回目が group-taken なら GROUP_USED_BY_OTHER_FAMILY を返す', async () => {
    let calls = 0;
    world.mock.on(TransactWriteCommand).callsFake(() => {
      calls++;
      if (calls === 1) {
        throw new TransactionCanceledException({
          message: 'x',
          $metadata: {},
          CancellationReasons: [ok, { Code: 'TransactionConflict' }],
        });
      }
      // 別の家族が先に登録した
      world.notificationGroups.set('C_new', { ...group, familyId: 'other-family' });
      throw new TransactionCanceledException({
        message: 'x',
        $metadata: {},
        CancellationReasons: [failed, ok],
      });
    });
    const result = await familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW);
    expect(result).toEqual({ ok: false, reason: 'GROUP_USED_BY_OTHER_FAMILY' });
    expect(calls).toBe(2);
  });

  it('サービス: 同じ家族の記録があっても家族が指していなければ、書き直して成功する', async () => {
    world.notificationGroups.set('C_new', { ...group });
    const result = await familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW);
    expect(result.ok).toBe(true);
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(1);
    expect(world.families.get(FAMILY_ID)?.notificationGroupId).toBe('C_new');
  });

  it('サービス: 同じ家族の記録があり家族も指していれば、何も書かずに成功する', async () => {
    world.notificationGroups.set('C_new', { ...group });
    world.families.set(FAMILY_ID, {
      ...world.families.get(FAMILY_ID),
      notificationGroupId: 'C_new',
    });
    const result = await familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW);
    expect(result.ok).toBe(true);
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('サービス: 子供は LINE も DynamoDB も呼ばずに ADMIN_ONLY', async () => {
    const result = await familyMemberService.registerNotificationGroup(
      { ...ctx, role: 'child' },
      'C_new',
      NOW,
    );
    expect(result).toEqual({ ok: false, reason: 'ADMIN_ONLY' });
    expect(world.mock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('サービス: 家族の記録がなければ投げる（思いがけない食い違い）', async () => {
    world.families.clear();
    await expect(familyMemberService.registerNotificationGroup(ctx, 'C_new', NOW)).rejects.toThrow(
      '家族の記録が見つかりません',
    );
  });
});
