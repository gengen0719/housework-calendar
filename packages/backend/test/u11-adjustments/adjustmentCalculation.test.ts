import { afterEach, describe, expect, it } from 'vitest';
import { assembleAllowances, getAllowances } from '../../src/services/allowanceService';
import { setup, create, validInput, request, bodyOf } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { FAMILY_ID } from '../u5-assignment-calendar/helpers/seed';
const max = Number.MAX_SAFE_INTEGER;
function assemble(amounts: number[], price = 0, count = 0) {
  return assembleAllowances({
    month: '2027-01',
    currentChildren: [{ userId: validInput().childUserId, displayName: '太郎' }],
    departedChildren: [],
    lines: new Map([
      [validInput().childUserId, count ? [{ choreTypeId: 'test', unitPrice: price, count }] : []],
    ]),
    choreTypes: [],
    adjustments: new Map([
      [
        validInput().childUserId,
        amounts.map((amount, i) => ({ adjustmentId: String(i), amount, reason: '理由' })),
      ],
    ]),
  });
}
afterEach(endScenario);
describe('正確な集計と訂正', () => {
  it.each(
    [
      [max, max, -max],
      [max, -max, max],
      [-max, max, max],
    ].map((amounts) => ({ amounts })),
  )('順序$amountsで途中の超過を丸めない', ({ amounts }) =>
    expect(assemble(amounts)[0]!.total).toBe(max),
  );
  it.each(
    [
      [max, max],
      [-max, -max],
    ].map((amounts) => ({ amounts })),
  )('最終合計の範囲外$amountsを断る', ({ amounts }) => expect(() => assemble(amounts)).toThrow());
  it('返す担当小計自体が範囲外なら調整で相殺されても断る', () =>
    expect(() => assemble([-max], max, 2)).toThrow());
  it('調整だけの過去の子供も本番差込口で返す', async () => {
    const state = setup();
    await create();
    state.world.users.delete(validInput().childUserId);
    const rows = await getAllowances({ familyId: FAMILY_ID, role: 'system' }, '2027-01', {
      emitLogs: false,
    });
    expect(rows.find((r) => r.childUserId === validInput().childUserId)).toMatchObject({
      current: false,
      total: 200,
    });
  });
  it('上限2件でも独立一覧から削除して読取を回復する', async () => {
    setup();
    await create({ ...validInput(), amount: max });
    await create({ ...validInput(), amount: max });
    expect((await request('GET', '/v1/months/2027-01/allowances')).statusCode).toBe(422);
    const rows = bodyOf(await request('GET', '/v1/months/2027-01/adjustments')).adjustments;
    expect(rows).toHaveLength(2);
    expect((await request('DELETE', `/v1/adjustments/${rows[0].adjustmentId}`)).statusCode).toBe(
      204,
    );
    expect(
      bodyOf(await request('GET', '/v1/months/2027-01/allowances')).allowances.find(
        (r: { childUserId: string }) => r.childUserId === validInput().childUserId,
      ).total,
    ).toBe(max);
  });
});
