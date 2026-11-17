import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setup, create, validInput, bodyOf, request } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { seedMonthState, FAMILY_ID } from '../u5-assignment-calendar/helpers/seed';
import { FAKE_CHILD_USER_ID_2, FAKE_U10_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
import { setNow } from '../u1-skeleton-family/helpers/world';
let state: ReturnType<typeof setup>;
beforeEach(() => {
  state = setup();
});
afterEach(endScenario);
describe('登録の保存とAPI境界', () => {
  it.each(['2027-01-31T14:59:59.000Z', '2027-01-31T15:00:00.000Z'])(
    '日本時間の月境界%sでも指定月を変えない',
    async (instant) => {
      setNow(instant);
      const response = await create();
      expect(response.statusCode).toBe(201);
      expect(bodyOf(response)).toMatchObject({ month: '2027-01', createdAt: instant });
    },
  );
  it.each(['add', 'subtract'])('%sを正の入力で保存し外部応答を限定する', async (kind) => {
    const r = await create({ ...validInput(), kind, familyId: 'forged', createdBy: 'forged' });
    expect(r.statusCode).toBe(201);
    expect(bodyOf(r)).not.toHaveProperty('familyId');
    expect(bodyOf(r)).not.toHaveProperty('createdBy');
    expect(state.world.adjustments.size).toBe(2);
    expect(state.world.requestRecords.size).toBe(1);
    expect(state.world.hooks.transactionSizes).toEqual([5]);
    expect([...state.world.adjustments.values()].every((r) => r.familyId === FAMILY_ID)).toBe(true);
  });
  it('同一キー10並行でも実体と索引は1組だけ', async () => {
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => create(validInput(), { key })),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect(new Set(results.map((r) => bodyOf(r).adjustmentId)).size).toBe(1);
    expect(state.world.adjustments.size).toBe(2);
  });
  it('応答喪失の再送も確定後に元の結果だけ返す', async () => {
    const key = randomUUID();
    const first = await create(validInput(), { key });
    seedMonthState(state.world.calendar, '2027-01', true);
    const second = await create(validInput(), { key });
    expect(second.body).toBe(first.body);
    expect(state.world.adjustments.size).toBe(2);
  });
  it('同じキーで異なる入力を拒否する', async () => {
    const key = randomUUID();
    await create(validInput(), { key });
    const r = await create({ ...validInput(), amount: 300 }, { key });
    expect(r.statusCode).toBe(422);
    expect(bodyOf(r).error.reason).toBe('IDEMPOTENCY_KEY_REUSED');
  });
  it('子供が保存前に別家族へ移ると取引全体を断る', async () => {
    state.world.hooks.beforeNextTransaction = () => {
      state.world.users.get(validInput().childUserId)!.familyId = FAKE_U10_OTHER_FAMILY_ID;
    };
    expect((await create()).statusCode).toBe(404);
    expect(state.world.adjustments.size).toBe(0);
    expect(state.world.requestRecords.size).toBe(0);
  });
  it('確定が先に成立すると途中保存しない', async () => {
    state.world.hooks.beforeNextTransaction = () =>
      seedMonthState(state.world.calendar, '2027-01', true);
    expect((await create()).statusCode).toBe(409);
    expect(state.world.adjustments.size).toBe(0);
    expect(state.world.requestRecords.size).toBe(0);
  });
  it('非競合の取引失敗を成功にしない', async () => {
    state.world.hooks.failTransaction(1, 'ThrottlingError');
    expect((await create()).statusCode).toBe(500);
    expect(state.world.adjustments.size).toBe(0);
    expect(state.world.requestRecords.size).toBe(0);
  });
  it('競合が2回なら打ち切る', async () => {
    state.world.hooks.failTransaction(1, 'TransactionConflict');
    state.world.hooks.failTransaction(2, 'TransactionConflict');
    expect((await create()).statusCode).toBe(500);
    expect(state.world.hooks.transactionSizes).toHaveLength(2);
  });
  it('TTLの等号では古い操作結果を再利用しない', async () => {
    const key = randomUUID();
    const first = await create(validInput(), { key });
    [...state.world.requestRecords.values()][0]!.expiresAt = Math.floor(Date.now() / 1000);
    const second = await create(validInput(), { key });
    expect(second.statusCode).toBe(201);
    expect(bodyOf(second).adjustmentId).not.toBe(bodyOf(first).adjustmentId);
  });
  it('他家族の対象を拒否する', async () => {
    state.world.users.get(FAKE_CHILD_USER_ID_2)!.familyId = FAKE_U10_OTHER_FAMILY_ID;
    expect((await create({ ...validInput(), childUserId: FAKE_CHILD_USER_ID_2 })).statusCode).toBe(
      404,
    );
  });
  it('管理者を対象の子供にできない', async () => {
    state.world.users.get(FAKE_CHILD_USER_ID_2)!.role = 'admin';
    expect((await create({ ...validInput(), childUserId: FAKE_CHILD_USER_ID_2 })).statusCode).toBe(
      404,
    );
  });
  it.each([
    { options: { unauthenticated: true }, status: 401 },
    { options: { actor: 'taro' as const }, status: 403 },
    { options: { key: null }, status: 400 },
    { options: { key: 'bad' }, status: 400 },
  ])('認証と操作キーの境界 $status', async ({ options, status }) => {
    expect((await create(validInput(), options)).statusCode).toBe(status);
    expect(state.world.adjustments.size).toBe(0);
  });
  it.each(['2027-13', '2025-01', '2028-01'])('月%sを断る', async (month) =>
    expect(
      (await request('POST', `/v1/months/${month}/adjustments`, validInput())).statusCode,
    ).toBe(422),
  );
});
