import { afterEach, describe, expect, it, vi } from 'vitest';
import { changeDutyStatus, judgeTransition } from '../../src/services/calendarService';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import type { DutyStatus, StatusChangeAction } from '@housework/shared';
import * as familyMemberService from '../../src/services/familyMemberService';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, PEOPLE } from '../u2-invitation/helpers/seed';
import {
  adminId,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  storedDuty,
} from './helpers/seed';
import { FAKE_U7_DUTY_ID_A, FAKE_U7_NONEXISTENT_DUTY_ID } from '../fixtures/fakeSecrets';

const MONTH = '2027-01';
const DATE = '2027-01-05';
const NOW = new Date('2027-01-07T11:00:00.000Z');
const DUTY_ID = FAKE_U7_DUTY_ID_A;
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: adminId(), role: 'admin' };

function world(): ReturnType<typeof setupWorld> {
  const w = setupWorld();
  process.env.ENTRY = 'api';
  seedHouseholdWithPrices(w);
  return w;
}

const seedTodo = (
  w: ReturnType<typeof setupWorld>,
  status: DutyStatus = 'todo',
  version = 2,
): void => {
  seedDuty(w.calendar, {
    dutyId: DUTY_ID,
    date: DATE,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    status,
    version,
  });
};
const seedDone = (w: ReturnType<typeof setupWorld>, version = 2, recordedBy = adminId()): void => {
  seedDoneDuty(w.calendar, {
    dutyId: DUTY_ID,
    date: DATE,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    version,
    recordedAt: '2027-01-06T10:00:00.000Z',
    recordedBy,
    unitPrice: 120,
  });
};
const change = (
  w: ReturnType<typeof setupWorld>,
  action: StatusChangeAction,
  version = 2,
): ReturnType<typeof changeDutyStatus> =>
  changeDutyStatus(ctx, DUTY_ID, action, { now: NOW, version });
const row = (w: ReturnType<typeof setupWorld>): Record<string, unknown> | undefined =>
  storedDuty(w.calendar, DATE, choreId('dishes'));

describe('judgeTransition（FR6.1 の表。BR8.2）', () => {
  it('表の 5 とおりが通る', () => {
    expect(judgeTransition('done', 'cancel')).toBe('todo');
    expect(judgeTransition('todo', 'markDone')).toBe('done');
    expect(judgeTransition('skipped', 'markDone')).toBe('done');
    expect(judgeTransition('todo', 'markSkipped')).toBe('skipped');
    expect(judgeTransition('done', 'markSkipped')).toBe('skipped');
    expect(judgeTransition('skipped', 'unmarkSkipped')).toBe('todo');
  });

  it('表にない組は undefined', () => {
    expect(judgeTransition('todo', 'cancel')).toBeUndefined(); // 未に cancel
    expect(judgeTransition('skipped', 'markSkipped')).toBeUndefined(); // × に markSkipped
    expect(judgeTransition('done', 'markDone')).toBeUndefined(); // すでに済に markDone
    expect(judgeTransition('todo', 'unmarkSkipped')).toBeUndefined();
  });
});

describe('changeDutyStatus（C8。BR8.2・BR8.4〜BR8.6、BR8.18）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未→済（markDone）で記録者は管理者・単価 120 円・version+1', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'markDone');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('done');
      expect(result.value.recordedBy).toBe(adminId());
      expect(result.value.unitPrice).toBe(120);
      expect(result.value.recordedByName).toBe('お母さん');
    }
    expect(row(w)).toMatchObject({ status: 'done', unitPrice: 120, version: 3 });
  });

  it('済→未（cancel）で記録の 3 項目が消える', async () => {
    const w = world();
    seedDone(w, 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'cancel');
    expect(result.ok).toBe(true);
    const r = row(w)!;
    expect(r.status).toBe('todo');
    expect(r.recordedAt).toBeUndefined();
    expect(r.unitPrice).toBeUndefined();
  });

  it('判定の順番: ほかの家族（NOT_FOUND）が月の確定より先', async () => {
    world(); // 担当を置かない（存在しない dutyId）
    const result = await changeDutyStatus(ctx, FAKE_U7_NONEXISTENT_DUTY_ID, 'cancel', {
      now: NOW,
      version: 1,
    });
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('判定の順番: 確定した月（MONTH_CONFIRMED）が表の確かめより先', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: true });
    // 表にない cancel（未に cancel）でも、月の確定が先に当たる
    const result = await change(w, 'cancel');
    expect(result).toEqual({ ok: false, reason: 'MONTH_CONFIRMED' });
  });

  it('表にない組は INVALID_TRANSITION', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'cancel'); // 未に cancel
    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });

  it('古い version の cancel は書かれず INVALID_TRANSITION（担当は変わらない）', async () => {
    const w = world();
    seedDone(w, 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'cancel', 1);
    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(w.hooks.transactionSizes).toHaveLength(0);
    expect(row(w)).toMatchObject({ status: 'done', version: 2 });
  });

  it('古い version の markDone（未→済）は書かれず INVALID_TRANSITION', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'markDone', 1);
    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(w.hooks.transactionSizes).toHaveLength(0);
    expect(row(w)).toMatchObject({ status: 'todo', version: 2 });
  });

  it('古い version の markDone（×→済）は書かれず INVALID_TRANSITION', async () => {
    const w = world();
    seedTodo(w, 'skipped', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const result = await change(w, 'markDone', 1);
    expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(w.hooks.transactionSizes).toHaveLength(0);
    expect(row(w)).toMatchObject({ status: 'skipped', version: 2 });
  });

  it('月の確かめは担当の月で行う（過去の確定していない月の担当は変えられる。NFR2.48）', async () => {
    const w = world();
    const pastDate = '2026-12-20';
    seedDuty(w.calendar, {
      dutyId: DUTY_ID,
      date: pastDate,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
    });
    // 担当の月（2026-12）は確定していない。今日の月（2027-01）が確定していても関係ない
    seedMonthState(w.calendar, { month: '2027-01', confirmed: true });
    const result = await changeDutyStatus(ctx, DUTY_ID, 'markDone', { now: NOW, version: 1 });
    expect(result.ok).toBe(true);
  });

  it('2 回続けて断られると INTERNAL（書き込みは 2 回で止まる）', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    w.hooks.failTransaction(1, 'ConditionalCheckFailed');
    w.hooks.failTransaction(2, 'TransactionConflict');
    const result = await change(w, 'markDone');
    expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
    expect(w.hooks.transactionSizes).toHaveLength(2);
    expect(row(w)).toMatchObject({ status: 'todo', version: 2 });
  });

  it('思いがけない Code（ThrottlingError）は読み直さず投げ直す', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    w.hooks.failTransaction(1, 'ThrottlingError');
    await expect(change(w, 'markDone')).rejects.toBeInstanceOf(Error);
    expect(w.hooks.transactionSizes).toHaveLength(1);
  });

  it('markDone・markSkipped の呼び出し回数（通常）が上限内（performance NFR7.35）', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const before = w.hooks.readLog.length;
    await change(w, 'markDone');
    // markDone 通常: findDuty（Get 3）+ getCurrentUnitPrice（Get 1）+ listMembers（Query）+ 種類の get。読み取りは 11 以内
    const reads = w.hooks.readLog.length - before;
    expect(reads).toBeLessThanOrEqual(11);
    expect(w.hooks.transactionSizes.length).toBeLessThanOrEqual(1);
  });
  it('書き込みのあとの読み取り（listMembers）が例外でも、状態変更は成功し、警告に名前・単価を書かない', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((l: unknown) => void lines.push(String(l)));
    }
    vi.spyOn(familyMemberService, 'listMembers').mockRejectedValue(
      new Error('読み取りの失敗（お母さん 太郎 120 円）'),
    );
    const outcome = await change(w, 'markDone');
    expect(outcome.ok).toBe(true);
    expect(row(w)).toMatchObject({ status: 'done', version: 3 });
    if (outcome.ok) {
      expect(outcome.value).toMatchObject({
        dutyId: DUTY_ID,
        status: 'done',
        recordedByName: null,
      });
    }
    const warned = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === 'DUTY_VIEW_READ_FAILED');
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ familyId: FAMILY_ID, dutyId: DUTY_ID });
    for (const line of lines) {
      expect(line).not.toContain('お母さん');
      expect(line).not.toContain('太郎');
      expect(line).not.toContain('皿洗い');
    }
  });
});

describe('changeDutyStatus のログ（observability。NFR2.51、NFR2.52）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const capture = (): string[] => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    return lines;
  };
  const events = (lines: string[], name: string): Record<string, unknown>[] =>
    lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === name);

  it('成功で DUTY_STATUS_CHANGED（名前・単価を書かない）', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const lines = capture();
    await change(w, 'markDone');
    const changed = events(lines, 'DUTY_STATUS_CHANGED');
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ action: 'markDone', fromStatus: 'todo', toStatus: 'done' });
    // 単価・種類の名前・子供の表示名を含まない
    const line = JSON.stringify(changed[0]);
    expect(line).not.toContain('120');
    expect(line).not.toContain('皿洗い');
    expect(line).not.toContain('太郎');
  });

  it('断りで DUTY_STATUS_REJECTED（理由の印つき）', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    const lines = capture();
    await change(w, 'cancel'); // 未に cancel → INVALID_TRANSITION
    expect(events(lines, 'DUTY_STATUS_REJECTED')[0]).toMatchObject({
      reason: 'INVALID_TRANSITION',
    });
  });

  it('読み直しで DUTY_STATUS_RETRY（info）が出て、2 回失敗で INTERNAL', async () => {
    const w = world();
    seedTodo(w, 'todo', 2);
    seedMonthState(w.calendar, { month: MONTH, confirmed: false });
    w.hooks.failTransaction(1, 'TransactionConflict');
    w.hooks.failTransaction(2, 'TransactionConflict');
    const lines = capture();
    await change(w, 'markDone');
    expect(events(lines, 'DUTY_STATUS_RETRY')).toHaveLength(1);
    expect(events(lines, 'DUTY_STATUS_REJECTED')[0]).toMatchObject({ reason: 'INTERNAL' });
  });
});

// PEOPLE を使う（管理者の表示名の確認で間接的に）
void PEOPLE;
