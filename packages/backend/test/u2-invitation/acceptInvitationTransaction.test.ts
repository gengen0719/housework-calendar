import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as familyRepository from '../../src/repositories/familyRepository';
import { hashToken } from '../../src/services/invitationTokenService';
import {
  FAMILIES_TABLE,
  INVITATIONS_TABLE,
  REQUEST_RECORDS_TABLE,
  USERS_TABLE,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, KEY_1, NOW, PEOPLE } from './helpers/seed';

const TOKEN = 'ValidValidValidValid12';
const result = {
  familyId: FAMILY_ID,
  name: '山田家',
  role: 'child',
  notificationGroupRegistered: false,
} as const;
const input = {
  userId: PEOPLE.hanako.userId,
  familyId: FAMILY_ID,
  token: TOKEN,
  tokenHash: hashToken(TOKEN),
  record: { userId: PEOPLE.hanako.userId, idempotencyKey: KEY_1, result },
};

describe('参加のトランザクションの組み立て', () => {
  beforeEach(() => {
    setupWorld();
  });

  it('4 件: 利用者、招待、家族、送り直しの記録の順', () => {
    const { items, kinds } = familyRepository.buildAcceptInvitationItems(input, NOW);
    expect(items).toHaveLength(4);
    expect(kinds).toEqual(['user', 'invitation', 'family', 'requestRecord']);
  });

  it('利用者の Update は、家族に入っていない・友だちのときだけ子供にする', () => {
    const update = familyRepository.buildAcceptInvitationItems(input, NOW).items[0]?.Update;
    expect(update?.TableName).toBe(USERS_TABLE);
    expect(update?.Key).toEqual({ userId: PEOPLE.hanako.userId });
    expect(update?.ConditionExpression).toContain('attribute_not_exists(familyId)');
    expect(update?.ConditionExpression).toContain('friendStatus = :friend');
    expect(update?.ExpressionAttributeValues).toMatchObject({
      ':familyId': FAMILY_ID,
      ':role': 'child',
      ':joinedAt': NOW.toISOString(),
      ':friend': 'friend',
    });
  });

  it('招待の ConditionCheck は、active かつ期限が今より後', () => {
    const check = familyRepository.buildAcceptInvitationItems(input, NOW).items[1]?.ConditionCheck;
    expect(check?.TableName).toBe(INVITATIONS_TABLE);
    expect(check?.Key).toEqual({ token: TOKEN });
    expect(check?.ConditionExpression).toBe('#status = :active AND expiresAt > :now');
    expect(check?.ExpressionAttributeValues).toEqual({
      ':active': 'active',
      ':now': NOW.toISOString(),
    });
  });

  it('家族の ConditionCheck は、いまの印がこの印のとき', () => {
    const check = familyRepository.buildAcceptInvitationItems(input, NOW).items[2]?.ConditionCheck;
    expect(check?.TableName).toBe(FAMILIES_TABLE);
    expect(check?.Key).toEqual({ familyId: FAMILY_ID });
    expect(check?.ConditionExpression).toBe('currentInvitationToken = :token');
    expect(check?.ExpressionAttributeValues).toEqual({ ':token': TOKEN });
  });

  it('送り直しの記録は、operation が acceptInvitation で、target は印の SHA-256（印そのものは持たない）', () => {
    const put = familyRepository.buildAcceptInvitationItems(input, NOW).items[3]?.Put;
    expect(put?.TableName).toBe(REQUEST_RECORDS_TABLE);
    expect(put?.Item).toMatchObject({
      userId: PEOPLE.hanako.userId,
      idempotencyKey: KEY_1,
      operation: 'acceptInvitation',
      target: hashToken(TOKEN),
    });
    expect(JSON.stringify(put?.Item)).not.toContain(TOKEN);
    expect(put?.ConditionExpression).toBe('attribute_not_exists(idempotencyKey)');
  });

  it('acceptInvitation は 1 回の TransactWriteItems で 4 件を送る', async () => {
    const world = setupWorld();
    world.users.set(PEOPLE.hanako.userId, { userId: PEOPLE.hanako.userId, friendStatus: 'friend' });
    world.invitations.set(TOKEN, {
      token: TOKEN,
      status: 'active',
      expiresAt: new Date(NOW.getTime() + 1000).toISOString(),
    });
    world.families.set(FAMILY_ID, { familyId: FAMILY_ID, currentInvitationToken: TOKEN });
    expect(await familyRepository.acceptInvitation(input, NOW)).toBe('joined');
    const calls = world.mock.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0].input.TransactItems).toHaveLength(4);
  });
});

describe('参加の取り消しの理由の読み分け', () => {
  const failed = { Code: 'ConditionalCheckFailed' };
  const none = { Code: 'None' };

  it('送り直しの記録の条件が外れたら requestRecord（ほかも外れていても先に見る）', () => {
    expect(familyRepository.classifyAcceptCancellation([failed, none, none, failed])).toBe(
      'requestRecord',
    );
  });

  it('利用者の条件が外れたら user', () => {
    expect(familyRepository.classifyAcceptCancellation([failed, none, none, none])).toBe('user');
  });

  it('利用者と招待の条件が両方外れたら user を先に見る', () => {
    expect(familyRepository.classifyAcceptCancellation([failed, failed, none, none])).toBe('user');
  });

  it('招待の条件だけ外れたら invitation', () => {
    expect(familyRepository.classifyAcceptCancellation([none, failed, none, none])).toBe(
      'invitation',
    );
  });

  it('家族の条件だけ外れたら invitation', () => {
    expect(familyRepository.classifyAcceptCancellation([none, none, failed, none])).toBe(
      'invitation',
    );
  });

  it('理由がない、または条件の外れがなければ undefined', () => {
    expect(familyRepository.classifyAcceptCancellation(undefined)).toBeUndefined();
    expect(
      familyRepository.classifyAcceptCancellation([
        none,
        none,
        none,
        { Code: 'TransactionConflict' },
      ]),
    ).toBeUndefined();
  });

  it('取引が条件で断られたとき、acceptInvitation は理由に応じた結果を返す', async () => {
    const world = setupWorld();
    world.users.set(PEOPLE.hanako.userId, { userId: PEOPLE.hanako.userId, friendStatus: 'friend' });
    // 招待の項目がない → invitation の条件が外れる
    world.families.set(FAMILY_ID, { familyId: FAMILY_ID, currentInvitationToken: TOKEN });
    expect(await familyRepository.acceptInvitation(input, NOW)).toBe('invitation');
    // すでに家族に入っている → user の条件が外れる
    world.invitations.set(TOKEN, {
      token: TOKEN,
      status: 'active',
      expiresAt: new Date(NOW.getTime() + 1000).toISOString(),
    });
    world.users.set(PEOPLE.hanako.userId, {
      userId: PEOPLE.hanako.userId,
      friendStatus: 'friend',
      familyId: 'fam-other',
    });
    expect(await familyRepository.acceptInvitation(input, NOW)).toBe('user');
  });

  const conflict = () =>
    new TransactionCanceledException({
      message: 'conflict',
      $metadata: {},
      CancellationReasons: [{ Code: 'TransactionConflict' }],
    });

  it('競合（TransactionConflict）だけなら 1 回やり直して参加できる。理由の Code を warn に出し、印は先頭 4 文字だけ', async () => {
    const world = setupWorld();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let calls = 0;
    world.mock.on(TransactWriteCommand).callsFake(() => {
      calls += 1;
      if (calls === 1) throw conflict();
      return {};
    });
    expect(await familyRepository.acceptInvitation(input, NOW)).toBe('joined');
    expect(calls).toBe(2);
    const lines = log.mock.calls.map((c) => String(c[0]));
    log.mockRestore();
    const warn = lines.find((l) => l.includes('ACCEPT_TRANSACTION_CANCELED'));
    expect(warn).toContain('"level":"warn"');
    expect(warn).toContain('TransactionConflict');
    expect(warn).toContain(`"tokenPrefix":"${TOKEN.slice(0, 4)}"`);
    expect(warn).not.toContain(TOKEN);
  });

  it('競合がやり直しでも続くなら、投げ直す（500 のまま）。やり直しは 1 回だけ', async () => {
    const world = setupWorld();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let calls = 0;
    world.mock.on(TransactWriteCommand).callsFake(() => {
      calls += 1;
      throw conflict();
    });
    await expect(familyRepository.acceptInvitation(input, NOW)).rejects.toThrow();
    log.mockRestore();
    expect(calls).toBe(2);
  });

  it('競合以外の読み取れない理由はやり直さず投げ直す', async () => {
    const world = setupWorld();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let calls = 0;
    world.mock.on(TransactWriteCommand).callsFake(() => {
      calls += 1;
      throw new TransactionCanceledException({
        message: 'throttled',
        $metadata: {},
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      });
    });
    await expect(familyRepository.acceptInvitation(input, NOW)).rejects.toThrow();
    log.mockRestore();
    expect(calls).toBe(1);
  });
});
