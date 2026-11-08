import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Invitation } from '../../src/models';
import * as invitationRepository from '../../src/repositories/invitationRepository';
import { INVITATIONS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld } from '../u1-skeleton-family/helpers/world';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const NOW = new Date('2026-11-02T00:00:00.000Z');

const invitation: Invitation = {
  token: TOKEN,
  invitationId: 'inv-1',
  familyId: 'fam-1',
  createdByUserId: 'user-1',
  createdAt: NOW.toISOString(),
  expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
  ttl: 1_800_000_000,
};

describe('invitationRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('印で招待を読める', async () => {
    world.invitations.set(TOKEN, { ...invitation });
    expect(await invitationRepository.findByToken(TOKEN)).toEqual(invitation);
  });

  it('招待がなければ undefined', async () => {
    expect(await invitationRepository.findByToken(TOKEN)).toBeUndefined();
  });

  it('読み取りは強い整合性', async () => {
    await invitationRepository.findByToken(TOKEN);
    const call = world.mock.commandCalls(GetCommand)[0];
    expect(call?.args[0].input.ConsistentRead).toBe(true);
    expect(call?.args[0].input.TableName).toBe(INVITATIONS_TABLE);
  });

  it('新しい招待の Put は、同じ印がなければ書く条件つき（token は予約語なので別名）', () => {
    const put = invitationRepository.buildPutItem(invitation).Put;
    expect(put.TableName).toBe(INVITATIONS_TABLE);
    expect(put.Item).toEqual(invitation);
    expect(put.ConditionExpression).toBe('attribute_not_exists(#token)');
    expect(put.ExpressionAttributeNames).toEqual({ '#token': 'token' });
  });

  it('前の招待の Update は、項目があるときだけ replaced にする条件つき', () => {
    const update = invitationRepository.buildMarkReplacedItem(TOKEN).Update;
    expect(update.Key).toEqual({ token: TOKEN });
    expect(update.UpdateExpression).toBe('SET #status = :replaced');
    expect(update.ConditionExpression).toBe('attribute_exists(#token)');
    expect(update.ExpressionAttributeValues).toEqual({ ':replaced': 'replaced' });
  });

  it('使える: active で期限の前', () => {
    expect(invitationRepository.isUsable(invitation, NOW)).toBe(true);
  });

  it('使えない: 期限ちょうど（now は expiresAt より前でなければならない）', () => {
    expect(invitationRepository.isUsable(invitation, new Date(invitation.expiresAt))).toBe(false);
  });

  it('使えない: 期限の 1 ミリ秒前は使える、replaced は使えない', () => {
    const justBefore = new Date(Date.parse(invitation.expiresAt) - 1);
    expect(invitationRepository.isUsable(invitation, justBefore)).toBe(true);
    expect(invitationRepository.isUsable({ ...invitation, status: 'replaced' }, NOW)).toBe(false);
  });
});
