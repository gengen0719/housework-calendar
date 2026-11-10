import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getOffer, swapSortKey } from '../../src/repositories/swapRepository';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_OTHER_FAMILY_ID,
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_OFFER_ID_1,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';
import { FAMILY_ID, childId, seedOffer } from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

describe('swapSortKey', () => {
  it('SWAP# に担当の ID を続けた形', () => {
    expect(swapSortKey(FAKE_U8_DUTY_ID_A)).toBe(`SWAP#${FAKE_U8_DUTY_ID_A}`);
  });

  it('月の項目（M#）の前置きと重ならない', () => {
    expect(swapSortKey(FAKE_U8_DUTY_ID_A).startsWith('M#')).toBe(false);
    expect('M#2027-01#'.startsWith('SWAP#')).toBe(false);
  });

  it('UUID の形の担当 ID なら、キーに # や空白が増えない', () => {
    expect(swapSortKey(FAKE_U8_DUTY_ID_A).slice('SWAP#'.length)).toMatch(/^[0-9a-f-]+$/);
  });
});

describe('getOffer', () => {
  let world: ReturnType<typeof installFakeDynamo>;
  beforeEach(() => {
    world = installFakeDynamo();
  });
  afterEach(() => world.mock.reset());

  it('sk を除いた申し出を返し、なければ undefined', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
    });
    const offer = await getOffer(FAMILY_ID, FAKE_U8_DUTY_ID_A);
    expect(offer).toMatchObject({ offerId: FAKE_U8_OFFER_ID_1, status: 'open' });
    expect(offer).not.toHaveProperty('sk');
    expect(await getOffer(FAMILY_ID, fakeU8DutyId(999))).toBeUndefined();
  });

  it('ほかの家族の ID では読めない', async () => {
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
    });
    expect(await getOffer(FAKE_OTHER_FAMILY_ID, FAKE_U8_DUTY_ID_A)).toBeUndefined();
  });
});
