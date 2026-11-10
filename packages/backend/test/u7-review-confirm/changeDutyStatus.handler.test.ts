import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { changeDutyStatus } from '../../src/handlers/calendar/changeDutyStatus';
import { confirmMonth, unconfirmMonth } from '../../src/handlers/calendar/confirmMonth';
import type { AuthContext } from '../../src/middleware/requireAuth';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { resetNow, setNow, setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import { callAs } from '../u5-assignment-calendar/helpers/seed';
import {
  adminId,
  childId,
  choreId,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  MONTH,
} from './helpers/seed';
import { FAKE_U7_DUTY_ID_A, FAKE_U7_NONEXISTENT_DUTY_ID } from '../fixtures/fakeSecrets';

const NOW = new Date('2027-01-07T11:00:00.000Z');
const DUTY_ID = FAKE_U7_DUTY_ID_A;
const admin: AuthContext = {
  userId: adminId(),
  familyId: FAMILY_ID,
  role: 'admin',
} as unknown as AuthContext;
const child: AuthContext = {
  userId: childId('taro'),
  familyId: FAMILY_ID,
  role: 'child',
} as unknown as AuthContext;
const noFamily: AuthContext = { userId: adminId() } as unknown as AuthContext;
const good = (): unknown => ({ action: 'markDone', version: 1 });

function world(): ReturnType<typeof setupWorld> {
  const w = setupWorld();
  process.env.ENTRY = 'api';
  setNow('2027-01-07T11:00:00.000Z');
  seedHouseholdWithPrices(w);
  seedDuty(w.calendar, {
    dutyId: DUTY_ID,
    date: '2027-01-05',
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    version: 1,
  });
  return w;
}

afterEach(() => {
  resetNow();
  vi.restoreAllMocks();
});

describe('changeDutyStatus ハンドラー（確かめの順番）', () => {
  it('家族に入っていない人は 403 NOT_FAMILY_MEMBER（本文も読まない）', async () => {
    world();
    const readBody = vi.fn(good);
    await expect(changeDutyStatus(noFamily, DUTY_ID, readBody, { now: NOW })).rejects.toMatchObject(
      { status: 403, reason: 'NOT_FAMILY_MEMBER' },
    );
    expect(readBody).not.toHaveBeenCalled();
  });

  it('子供は 403 ADMIN_ONLY で、本文も読まず DynamoDB も読まない', async () => {
    const w = world();
    const readBody = vi.fn(good);
    w.hooks.readLog.length = 0;
    await expect(changeDutyStatus(child, DUTY_ID, readBody, { now: NOW })).rejects.toMatchObject({
      status: 403,
      reason: 'ADMIN_ONLY',
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(w.hooks.readLog).toEqual([]);
  });

  it('本文が外れると、dutyId の形が違っていても 422 が先', async () => {
    world();
    await expect(
      changeDutyStatus(admin, 'not-a-uuid', () => ({ action: 'x' }), { now: NOW }),
    ).rejects.toMatchObject({ status: 422, reason: 'INVALID_REQUEST' });
  });

  it('本文が正しく dutyId の形が違うと 404（DynamoDB を読まない）', async () => {
    const w = world();
    w.hooks.readLog.length = 0;
    await expect(changeDutyStatus(admin, 'not-a-uuid', good, { now: NOW })).rejects.toMatchObject({
      status: 404,
      reason: 'NOT_FOUND',
    });
    expect(w.hooks.readLog).toEqual([]);
  });

  it('家族にない担当は 404 NOT_FOUND', async () => {
    world();
    await expect(
      changeDutyStatus(admin, FAKE_U7_NONEXISTENT_DUTY_ID, good, { now: NOW }),
    ).rejects.toMatchObject({ status: 404, reason: 'NOT_FOUND' });
  });

  it('成功すると更新後の Duty を返す', async () => {
    world();
    const duty = await changeDutyStatus(admin, DUTY_ID, good, { now: NOW });
    expect(duty).toMatchObject({ status: 'done', recordedBy: adminId(), unitPrice: 120 });
  });

  it('月の確定の handler も子供は 403 ADMIN_ONLY で DynamoDB を読まない', async () => {
    const w = world();
    w.hooks.readLog.length = 0;
    await expect(confirmMonth(child, MONTH, { now: NOW })).rejects.toMatchObject({
      reason: 'ADMIN_ONLY',
    });
    await expect(unconfirmMonth(child, MONTH)).rejects.toMatchObject({ reason: 'ADMIN_ONLY' });
    await expect(confirmMonth(admin, '2027-13', { now: NOW })).rejects.toMatchObject({
      status: 422,
      reason: 'INVALID_MONTH',
    });
    expect(w.hooks.readLog.filter((e) => e.table === CALENDAR_TABLE)).toEqual([]);
    expect(w.hooks.readLog.filter((e) => e.table === CHORE_TYPES_TABLE)).toEqual([]);
  });
});

describe('ログの伏せ字（名前・単価・種類の名前を 1 行も出さない。NFR4.73）', () => {
  it('成功・各断り・競合・確定・取り消しのどの分岐でも目印が含まれない', async () => {
    const w = world();
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
    }
    const send = (actor: 'mother' | 'taro', body: unknown, id = DUTY_ID) =>
      callAs(actor, 'POST', `/v1/duties/${id}/status`, body);
    const results: APIGatewayProxyStructuredResultV2[] = [];
    results.push(await send('taro', good())); // ADMIN_ONLY
    results.push(await send('mother', { action: 'bad', version: 1 })); // INVALID_REQUEST
    results.push(await send('mother', good(), FAKE_U7_NONEXISTENT_DUTY_ID)); // NOT_FOUND
    results.push(await send('mother', { action: 'cancel', version: 1 })); // INVALID_TRANSITION
    w.hooks.failTransaction(1, 'TransactionConflict');
    results.push(await send('mother', good())); // 競合 → 読み直して成功
    results.push(await send('mother', { action: 'cancel', version: 2 })); // 成功
    seedMonthState(w.calendar, { month: MONTH, confirmed: true });
    results.push(await send('mother', good())); // MONTH_CONFIRMED
    results.push(await callAs('mother', 'DELETE', `/v1/months/${MONTH}/confirmation`));
    results.push(await callAs('mother', 'PUT', `/v1/months/${MONTH}/confirmation`));
    expect(results.map((r) => r.statusCode)).toEqual([403, 422, 404, 409, 200, 200, 409, 200, 200]);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(line).not.toContain('太郎');
      expect(line).not.toContain('お母さん');
      expect(line).not.toContain('皿洗い');
      expect(line).not.toContain('unitPrice');
    }
  });
});
