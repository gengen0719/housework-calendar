import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyDutyReassigned,
  resetDutyReassignedHooks,
} from '../../src/services/dutyReassignedHook';
import { notifyDutyRecorded, resetDutyRecordedHooks } from '../../src/services/dutyRecordedHook';
import { registerSwapHooks, resetSwapHooksForTest } from '../../src/services/swapService';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1 } from '../fixtures/fakeSecrets';
import {
  FAMILY_ID,
  childId,
  choreId,
  seedHouseholdWithPrices,
  seedOffer,
  storedOffer,
} from './helpers/seed';
import { captureLogs } from './helpers/swapWorld';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const reassignedEvent = {
  familyId: FAMILY_ID,
  dutyId: FAKE_U8_DUTY_ID_A,
  date: '2027-01-12',
  choreTypeId: choreId('dishes'),
  kind: 'child-changed' as const,
  fromChildUserId: childId('taro'),
};
const recordedEvent = {
  familyId: FAMILY_ID,
  dutyId: FAKE_U8_DUTY_ID_A,
  date: '2027-01-12',
  choreTypeId: choreId('dishes'),
  childUserId: childId('taro'),
};

describe('registerSwapHooks（BR9.11）', () => {
  let world: ReturnType<typeof installFakeDynamo>;
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    world = installFakeDynamo();
    logs = captureLogs();
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    resetSwapHooksForTest();
    seedHouseholdWithPrices(world);
    seedOffer(world.calendar, {
      dutyId: FAKE_U8_DUTY_ID_A,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 2,
    });
  });
  afterEach(() => {
    world.mock.reset();
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    resetSwapHooksForTest();
    vi.restoreAllMocks();
  });

  const status = (): unknown => storedOffer(world.calendar, FAKE_U8_DUTY_ID_A)?.status;

  it('登録する前は何も起きない', async () => {
    await notifyDutyReassigned([reassignedEvent]);
    await notifyDutyRecorded(recordedEvent);
    expect(status()).toBe('open');
  });

  it('二重に呼んでも登録は 1 回（掃除の書き込みは 1 回だけ）', async () => {
    registerSwapHooks({ reassigned: true, recorded: true });
    registerSwapHooks({ reassigned: true, recorded: true });
    await notifyDutyRecorded(recordedEvent);
    expect(world.mock.commandCalls(UpdateCommand)).toHaveLength(1);
  });

  it('reassigned が false のとき、担当を変える通知は登録されない', async () => {
    registerSwapHooks({ reassigned: false, recorded: true });
    await notifyDutyReassigned([reassignedEvent]);
    expect(status()).toBe('open');
    await notifyDutyRecorded(recordedEvent);
    expect(status()).toBe('cancelled');
  });

  it('recorded が false のとき、記録の通知は登録されない', async () => {
    registerSwapHooks({ reassigned: true, recorded: false });
    await notifyDutyRecorded(recordedEvent);
    expect(status()).toBe('open');
    await notifyDutyReassigned([reassignedEvent]);
    expect(status()).toBe('cancelled');
  });

  it('掃除が投げても通知は投げず、警告だけが残る', async () => {
    registerSwapHooks({ reassigned: true, recorded: true });
    world.hooks.beforeNextUpdate = () => {
      throw new Error('失敗');
    };
    await expect(notifyDutyRecorded(recordedEvent)).resolves.toBeUndefined();
    expect(logs.rows('DUTY_RECORDED_HOOK_FAILED')).toHaveLength(1);
  });

  it('via には通知の種類と recorded が入る', async () => {
    registerSwapHooks({ reassigned: true, recorded: true });
    await notifyDutyReassigned([reassignedEvent]);
    expect(logs.rows('SWAP_OFFER_CLOSED')[0]).toMatchObject({ via: 'child-changed' });
  });
});
