import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowances, getAllowanceMonthView } from '../../src/services/allowanceService';
import { dispatchFamily } from '../../src/services/notificationService';
import * as content from '../../src/services/notificationMessages';
import * as alerts from '../../src/services/operationalAlertService';
import { workflow } from '../u10-notifications/helpers/workflow';
import { setup, create, validInput, bodyOf, request } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { FAMILY_ID } from '../u5-assignment-calendar/helpers/seed';
afterEach(endScenario);
describe('C9・通知・障害の本番境界', () => {
  it('1000件の調整を複数ページから欠落なく集計する', async () => {
    const state = setup();
    await create();
    const row = [...state.world.adjustments.values()].find((r) => r.amount)!;
    for (let i = 0; i < 999; i++) {
      const id = randomUUID(),
        sk = `M#2027-01#J#${id}`;
      state.world.adjustments.set(`${FAMILY_ID}#${sk}`, { ...row, adjustmentId: id, sk });
    }
    state.world.hooks.queryPageSize = 67;
    const child = (
      await getAllowances({ familyId: FAMILY_ID, role: 'system' }, '2027-01', { emitLogs: false })
    ).find((c) => c.childUserId === validInput().childUserId)!;
    expect(child.adjustments).toHaveLength(1000);
    expect(child.total).toBe(200000);
  });
  it('調整を変えても再試行の本文と宛先・キーを固定する', async () => {
    setup();
    await create();
    const w = workflow();
    w.prepare.mockRestore();
    const prepare = vi.spyOn(content, 'prepareContent');
    w.setNow(Date.parse('2027-01-31T12:00:00Z'));
    w.provider.mockResolvedValueOnce({
      accepted: false,
      retryable: true,
      reason: 'server',
      ambiguous: true,
    });
    const job = { familyId: FAMILY_ID, kind: 'monthlySummary' as const, targetDate: '2027-01-31' };
    expect((await dispatchFamily(job, w.options)).outcome).toBe('retry');
    await create({ ...validInput(), amount: 400 });
    w.advance(5000);
    expect((await dispatchFamily(job, w.options)).outcome).toBe('sent');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(w.provider.mock.calls[0]).toEqual(w.provider.mock.calls[1]);
    expect(w.provider.mock.calls[0]![1]).toContain('200円');
  });
  it('APIの理由・金額・名前・生家族IDをログへ出さずemitLogs falseも尊重する', async () => {
    const state = setup();
    await create({
      ...validInput(),
      reason: 'private reason marker',
      amount: Number.MAX_SAFE_INTEGER,
    });
    await request('GET', '/v1/months/2027-01/allowances');
    await request('GET', '/v1/months/2027-01/adjustments');
    const before = state.logs.length;
    await getAllowanceMonthView({ familyId: FAMILY_ID, role: 'system' }, '2027-01', {
      emitLogs: false,
      today: '2027-01-13',
    });
    expect(state.logs).toHaveLength(before);
    const logs = JSON.stringify(state.logs);
    for (const marker of [
      'private reason marker',
      '太郎',
      FAMILY_ID,
      String(Number.MAX_SAFE_INTEGER),
    ])
      expect(logs).not.toContain(marker);
  });
  it('保存の500は定型障害通知、4xxは非通知', async () => {
    const state = setup();
    const alert = vi.spyOn(alerts, 'reportEntryFailure').mockResolvedValue();
    state.world.hooks.failTransaction(1, 'ThrottlingError');
    expect((await create()).statusCode).toBe(500);
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockClear();
    expect((await create({ ...validInput(), amount: 0 })).statusCode).toBe(422);
    expect(alert).not.toHaveBeenCalled();
  });
  it('最大理由の保存結果は予定の2KBに収まる', async () => {
    setup();
    const result = bodyOf(
      await create({ ...validInput(), reason: '😀'.repeat(100), amount: Number.MAX_SAFE_INTEGER }),
    );
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(2048);
  });
});
