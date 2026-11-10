import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1 } from '../fixtures/fakeSecrets';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID, childId, choreId, seedOffer, storedOffer } from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

/** api の起動の枠が、担当の変更と記録の通知の両方に掃除を登録する（BR9.11）。line は記録の通知だけ（swap-line の筋書き）。 */
describe('起動の枠でのフックの登録（BR9.11）', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  it('api を読み込むと、担当の変更の通知で受け付け中の申し出が自動でなくなる', async () => {
    const world = installFakeDynamo();
    await import('../../src/entries/api');
    const { notifyDutyReassigned } = await import('../../src/services/dutyReassignedHook');
    const { notifyDutyRecorded } = await import('../../src/services/dutyRecordedHook');
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
    await notifyDutyReassigned([
      {
        familyId: FAMILY_ID,
        dutyId: FAKE_U8_DUTY_ID_A,
        date: '2027-01-12',
        choreTypeId: choreId('dishes'),
        kind: 'child-changed',
        fromChildUserId: childId('taro'),
      },
    ]);
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)?.status).toBe('cancelled');
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
    await notifyDutyRecorded({
      familyId: FAMILY_ID,
      dutyId: FAKE_U8_DUTY_ID_A,
      date: '2027-01-12',
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
    });
    expect(storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)?.status).toBe('cancelled');
  });
});
