import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllowances } from '../../src/handlers/allowances/getAllowances';
import * as service from '../../src/services/allowanceService';
import { ctxAdmin, ctxChild, MONTH, PEOPLE } from './helpers/allowanceWorld';
import { JST_BEFORE_BOUNDARY_ISO } from './helpers/clock';
describe('お小遣いの薄い入口', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([ctxAdmin(), ctxChild()])('メンバーの役割 $role で読める', async (ctx) => {
    const call = vi.spyOn(service, 'getAllowanceMonthView').mockResolvedValue({
      month: MONTH,
      confirmed: false,
      today: '2027-01-31',
      firstMonth: MONTH,
      lastMonth: MONTH,
      allowances: [],
    });
    await getAllowances(ctx, MONTH, new Date(JST_BEFORE_BOUNDARY_ISO));
    // U11: 理由・金額・生familyIdを運用ログへ出さないAPI経路。
    expect(call).toHaveBeenCalledWith(ctx, MONTH, { today: '2027-01-31', emitLogs: false });
  });
  it('メンバーの確認を月の形より先にする', async () => {
    await expect(
      getAllowances({ userId: PEOPLE.mother.userId }, 'invalid', new Date(JST_BEFORE_BOUNDARY_ISO)),
    ).rejects.toMatchObject({ status: 403, reason: 'NOT_FAMILY_MEMBER' });
  });
  it('current を受け取った now だけから解く', async () => {
    const call = vi.spyOn(service, 'getAllowanceMonthView').mockResolvedValue({
      month: MONTH,
      confirmed: false,
      today: '2027-01-31',
      firstMonth: MONTH,
      lastMonth: MONTH,
      allowances: [],
    });
    await getAllowances(ctxChild(), 'current', new Date(JST_BEFORE_BOUNDARY_ISO));
    expect(call.mock.calls[0]?.[1]).toBe(MONTH);
  });
  it('読み取りの失敗を包まず伝える', async () => {
    const error = new Error('read failed');
    vi.spyOn(service, 'getAllowanceMonthView').mockRejectedValue(error);
    await expect(getAllowances(ctxChild(), MONTH, new Date(JST_BEFORE_BOUNDARY_ISO))).rejects.toBe(
      error,
    );
  });
});
