import { describe, expect, it } from 'vitest';
import type { DutyRecord, SwapOfferRecord } from '../../src/models';
import type { DutyWithState } from '../../src/repositories/calendarRepository';
import { isOfferValid } from '../../src/services/swapService';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_OFFER_ID_1,
} from '../fixtures/fakeSecrets';
import { FAMILY_ID } from './helpers/seed';

const TODAY = '2027-01-08';

const offer = (over: Partial<SwapOfferRecord> = {}): SwapOfferRecord => ({
  familyId: FAMILY_ID,
  dutyId: FAKE_U8_DUTY_ID_A,
  offerId: FAKE_U8_OFFER_ID_1,
  offererUserId: FAKE_CHILD_USER_ID_1,
  dutyVersion: 2,
  status: 'open',
  createdAt: '2027-01-06T00:00:00.000Z',
  updatedAt: '2027-01-06T00:00:00.000Z',
  ...over,
});

const found = (over: Partial<DutyRecord> = {}, confirmed = false): DutyWithState => ({
  duty: {
    dutyId: FAKE_U8_DUTY_ID_A,
    familyId: FAMILY_ID,
    month: '2027-01',
    date: '2027-01-12',
    choreTypeId: FAKE_CHORE_TYPE_ID_1,
    childUserId: FAKE_CHILD_USER_ID_1,
    status: 'todo',
    origin: 'rule',
    version: 2,
    createdAt: '2026-12-20T00:00:00.000Z',
    updatedAt: '2026-12-20T00:00:00.000Z',
    ...over,
  },
  confirmed,
});

describe('isOfferValid（BR9.8）', () => {
  it('5 つの条件がそろっていれば有効', () => {
    expect(isOfferValid(offer(), found(), TODAY)).toBe(true);
  });

  it('今日の担当は有効（今日を含む）', () => {
    expect(isOfferValid(offer(), found({ date: TODAY }), TODAY)).toBe(true);
  });

  it('(a) 申し出が open でなければ無効', () => {
    for (const status of ['accepted', 'withdrawn', 'cancelled'] as const) {
      expect(isOfferValid(offer({ status }), found(), TODAY)).toBe(false);
    }
  });

  it('(b) 担当の version が申し出たときと違えば無効', () => {
    expect(isOfferValid(offer(), found({ version: 3 }), TODAY)).toBe(false);
    expect(isOfferValid(offer({ dutyVersion: 1 }), found(), TODAY)).toBe(false);
  });

  it('(c) 担当が「未」でなければ無効', () => {
    expect(isOfferValid(offer(), found({ status: 'done' }), TODAY)).toBe(false);
    expect(isOfferValid(offer(), found({ status: 'skipped' }), TODAY)).toBe(false);
  });

  it('(c) 担当の子供が申し出た子供でなければ無効', () => {
    expect(isOfferValid(offer(), found({ childUserId: FAKE_CHILD_USER_ID_2 }), TODAY)).toBe(false);
  });

  it('(d) 担当の日が昨日なら無効', () => {
    expect(isOfferValid(offer(), found({ date: '2027-01-07' }), TODAY)).toBe(false);
  });

  it('(e) 月が確定していれば無効', () => {
    expect(isOfferValid(offer(), found({}, true), TODAY)).toBe(false);
  });

  it('担当が見つからない（消えた）と無効', () => {
    expect(isOfferValid(offer(), undefined, TODAY)).toBe(false);
  });
});
