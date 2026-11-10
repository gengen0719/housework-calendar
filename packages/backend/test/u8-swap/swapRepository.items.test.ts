import { describe, expect, it } from 'vitest';
import type { DutyRecord, SwapOfferRecord } from '../../src/models';
import { classifyCancellation } from '../../src/repositories/calendarRepository';
import {
  buildAcceptItems,
  buildCloseUpdate,
  buildCreateOfferItems,
  buildWithdrawUpdate,
} from '../../src/repositories/swapRepository';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1 } from '../fixtures/fakeSecrets';
import { FAMILY_ID, childId, choreId } from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const NOW = new Date('2027-01-08T03:00:00.000Z');

const duty: DutyRecord = {
  dutyId: FAKE_U8_DUTY_ID_A,
  familyId: FAMILY_ID,
  month: '2027-01',
  date: '2027-01-12',
  choreTypeId: choreId('dishes'),
  childUserId: childId('taro'),
  status: 'todo',
  origin: 'rule',
  version: 2,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2026-12-20T00:00:00.000Z',
};
const offer: SwapOfferRecord = {
  familyId: FAMILY_ID,
  dutyId: FAKE_U8_DUTY_ID_A,
  offerId: FAKE_U8_OFFER_ID_1,
  offererUserId: childId('taro'),
  dutyVersion: 2,
  status: 'open',
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
};

type Item = Record<string, Record<string, unknown> | undefined>;
const upd = (item: unknown): Record<string, any> | undefined => (item as Item).Update; // eslint-disable-line @typescript-eslint/no-explicit-any
const chk = (item: unknown): Record<string, any> | undefined => (item as Item).ConditionCheck; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('buildCreateOfferItems', () => {
  const items = buildCreateOfferItems(duty, FAKE_U8_OFFER_ID_1, NOW);

  it('3 項目で、先頭が申し出の Update', () => {
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveProperty('Update');
    expect(items[1]).toHaveProperty('ConditionCheck');
    expect(items[2]).toHaveProperty('ConditionCheck');
  });

  it('条件は「項目がない、open でない、dutyVersion が違う」', () => {
    expect(upd(items[0])?.ConditionExpression).toBe(
      'attribute_not_exists(#sk) OR #status <> :open OR #dutyVersion <> :v',
    );
  });

  it('acceptedByUserId と acceptedAt を取り除く', () => {
    expect(upd(items[0])?.UpdateExpression).toContain('REMOVE #acceptedByUserId, #acceptedAt');
  });

  it('担当の確かめは未・version・同じ担当・担当の子供を見る', () => {
    const check = chk(items[1]);
    expect(check?.ConditionExpression).toContain('#childUserId = :child');
    expect(check?.ExpressionAttributeValues).toMatchObject({
      ':v': 2,
      ':child': childId('taro'),
    });
  });
});

describe('buildAcceptItems', () => {
  const items = buildAcceptItems(duty, offer, childId('hanako'), NOW);

  it('3 項目で、ChoreTypes の表を含まない', () => {
    expect(items).toHaveLength(3);
    const tables = items.map((item) => Object.values(item)[0]?.TableName);
    expect(tables).not.toContain(CHORE_TYPES_TABLE);
  });

  it('担当は子供・origin・version・updatedAt だけを書く', () => {
    const expression = upd(items[0])?.UpdateExpression ?? '';
    expect(expression).toBe(
      'SET #childUserId = :taker, #origin = :swap, #version = #version + :one, #updatedAt = :now',
    );
    expect(expression).not.toContain('#status');
  });

  it('担当の条件は未・version・同じ担当・申し出た子供のまま', () => {
    expect(upd(items[0])?.ConditionExpression).toContain('#childUserId = :offerer');
    expect(upd(items[0])?.ExpressionAttributeValues).toMatchObject({
      ':v': 2,
      ':offerer': childId('taro'),
    });
  });

  it('申し出の条件は open で offerId が同じ', () => {
    expect(upd(items[1])?.ConditionExpression).toBe('#status = :open AND #offerId = :offerId');
  });
});

describe('buildWithdrawUpdate / buildCloseUpdate', () => {
  it('取り下げは offerId を条件にし、担当に触れない', () => {
    const update = upd(buildWithdrawUpdate(FAMILY_ID, duty.dutyId, offer.offerId, NOW)) ?? {};
    expect(update.Key.sk).toBe(`SWAP#${duty.dutyId}`);
    expect(update.ConditionExpression).toBe('#status = :open AND #offerId = :offerId');
    expect(update.ExpressionAttributeValues[':withdrawn']).toBe('withdrawn');
  });

  it('掃除は項目があって open のときだけ（項目を作らない）', () => {
    const update = upd(buildCloseUpdate(FAMILY_ID, duty.dutyId, NOW)) ?? {};
    expect(update.ConditionExpression).toBe('attribute_exists(#sk) AND #status = :open');
    expect(update.ExpressionAttributeValues[':cancelled']).toBe('cancelled');
  });
});

describe('classifyCancellation（引き受けの 3 項目）', () => {
  it('条件の失敗と競合だけなら conflict', () => {
    expect(
      classifyCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'None' },
        { Code: 'TransactionConflict' },
      ]),
    ).toBe('conflict');
  });

  it('ThrottlingError が混ざれば undefined（投げ直す）', () => {
    expect(
      classifyCancellation([{ Code: 'ConditionalCheckFailed' }, { Code: 'ThrottlingError' }]),
    ).toBeUndefined();
  });
});
