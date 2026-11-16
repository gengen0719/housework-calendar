import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup, create, validInput, bodyOf, request } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { FAMILY_ID, seedMonthState } from '../u5-assignment-calendar/helpers/seed';
import * as allowances from '../../src/services/allowanceService';
import * as store from '../../src/repositories/adjustmentRepository';
import { FAKE_U10_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
let state: ReturnType<typeof setup>;
let id: string;
beforeEach(async () => {
  state = setup();
  id = bodyOf(await create()).adjustmentId;
});
afterEach(endScenario);
const remove = (options: Parameters<typeof request>[3] = {}) =>
  request('DELETE', `/v1/adjustments/${id}`, undefined, options);
const list = (options: Parameters<typeof request>[3] = {}) =>
  request('GET', '/v1/months/2027-01/adjustments', undefined, options);
describe('独立一覧と削除の境界', () => {
  it('全ページ1000行を集計なしで返す', async () => {
    const row = [...state.world.adjustments.values()].find((r) => r.amount)!;
    for (let i = 0; i < 999; i++) {
      const key = `M#2027-01#J#test-${i}`;
      state.world.adjustments.set(`${FAMILY_ID}#${key}`, {
        ...row,
        adjustmentId: `test-${i}`,
        sk: key,
      });
    }
    state.world.hooks.queryPageSize = 71;
    const tally = vi.spyOn(allowances, 'getAllowances');
    const result = await list();
    expect(result.statusCode).toBe(200);
    expect(bodyOf(result).adjustments).toHaveLength(1000);
    expect(tally).not.toHaveBeenCalled();
  });
  it('過去の子供の行と不明名を残す', async () => {
    state.world.users.delete(validInput().childUserId);
    const result = bodyOf(await list());
    expect(result.adjustments[0].adjustmentId).toBe(id);
    expect(result.adjustments[0].displayName).toBe('名前が分からない子供');
  });
  it('合計の範囲に関係なく削除できる', async () => {
    vi.spyOn(allowances, 'getAllowances').mockRejectedValue(new Error('out of range'));
    expect((await remove()).statusCode).toBe(204);
    expect(state.world.adjustments.size).toBe(0);
    expect(state.world.requestRecords.size).toBe(1);
  });
  it('二重削除は404で非復活', async () => {
    await remove();
    expect((await remove()).statusCode).toBe(404);
    expect(state.world.adjustments.size).toBe(0);
  });
  it('他家族のIDは読めず消せない', async () => {
    for (const [k, r] of [...state.world.adjustments]) {
      state.world.adjustments.delete(k);
      state.world.adjustments.set(k.replace(FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID), {
        ...r,
        familyId: FAKE_U10_OTHER_FAMILY_ID,
      });
    }
    expect((await remove()).statusCode).toBe(404);
    expect(state.world.adjustments.size).toBe(2);
    expect(bodyOf(await list()).adjustments).toEqual([]);
  });
  it('削除取引の直前に確定したら行と索引を残す', async () => {
    state.world.hooks.beforeNextTransaction = () =>
      seedMonthState(state.world.calendar, '2027-01', true);
    expect((await remove()).statusCode).toBe(409);
    expect(state.world.adjustments.size).toBe(2);
  });
  it('削除中の非競合障害は途中削除しない', async () => {
    state.world.hooks.failTransaction(2, 'ThrottlingError');
    expect((await remove()).statusCode).toBe(500);
    expect(state.world.adjustments.size).toBe(2);
  });
  it.each([{ actor: 'taro' as const }, { unauthenticated: true }])(
    '一覧と削除の権限を両方拒否',
    async (options) => {
      const expected = options.actor ? 403 : 401;
      expect((await list(options)).statusCode).toBe(expected);
      expect((await remove(options)).statusCode).toBe(expected);
      expect(state.world.adjustments.size).toBe(2);
    },
  );
  it('不正IDは422', async () =>
    expect((await request('DELETE', '/v1/adjustments/bad')).statusCode).toBe(422));
  it('索引と実体の強整合読取', async () => {
    await store.findById(FAMILY_ID, id);
    const reads = state.world.hooks.readLog.filter((r) => r.table === 'Adjustments-test');
    expect(reads).toHaveLength(2);
    expect(reads.every((r) => r.consistent)).toBe(true);
  });
  it('列挙失敗を一部の一覧で返さない', async () => {
    state.world.hooks.failRead('Adjustments-test', 'Query');
    expect((await list()).statusCode).toBe(500);
  });
});
