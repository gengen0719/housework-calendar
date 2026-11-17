import { afterEach, describe, expect, it, vi } from 'vitest';
import { ok, err } from '@housework/shared';
import { prepareContent } from '../../src/services/notificationMessages';
import * as family from '../../src/services/familyMemberService';
import * as calendar from '../../src/services/calendarService';
import * as chores from '../../src/services/choreTypeService';
import * as allowance from '../../src/services/allowanceService';
import { FAKE_U10_FAMILY_ID, FAKE_U10_RETRY_KEY } from '../fixtures/fakeSecrets';
const ctx = { familyId: FAKE_U10_FAMILY_ID, role: 'system' as const };
afterEach(() => vi.restoreAllMocks());
function daily() {
  vi.spyOn(calendar, 'isMonthConfirmed').mockResolvedValue(false);
  vi.spyOn(calendar, 'listDutiesOn').mockResolvedValue([
    {
      dutyId: FAKE_U10_RETRY_KEY,
      choreTypeId: FAKE_U10_RETRY_KEY,
      childUserId: FAKE_U10_FAMILY_ID,
      status: 'done',
    },
  ] as never);
  vi.spyOn(family, 'listMembers').mockResolvedValue([]);
  vi.spyOn(chores, 'list').mockResolvedValue([]);
  return vi.spyOn(family, 'findDisplayName').mockResolvedValue(ok('太郎'));
}
describe('本文作成とC6〜C9の境界', () => {
  it('C9の結果を使い、通知で生の家族IDログを出させない', async () => {
    const get = vi
      .spyOn(allowance, 'getAllowances')
      .mockResolvedValue([{ displayName: '太郎', total: -200 }] as never);
    expect((await prepareContent(ctx, 'monthlySummary', '2027-01-31')).text).toContain(
      '太郎 -200円',
    );
    expect(get).toHaveBeenCalledWith(ctx, '2027-01', { emitLogs: false });
  });
  it('C9の子供0人だけを省略', async () => {
    vi.spyOn(allowance, 'getAllowances').mockResolvedValue([]);
    expect(await prepareContent(ctx, 'monthlySummary', '2027-01-31')).toEqual({ reason: 'empty' });
  });
  it('種類がなくても担当の済を隠さず名前を補う', async () => {
    const get = daily();
    expect((await prepareContent(ctx, 'dailyReminder', '2027-01-31')).text).toContain(
      '不明なお手伝い・太郎・済',
    );
    expect(get).toHaveBeenCalledWith(ctx, FAKE_U10_FAMILY_ID);
  });
  it('消えた子供は不明の表示名', async () => {
    daily().mockResolvedValue(err('NOT_FOUND'));
    expect((await prepareContent(ctx, 'dailyReminder', '2027-01-31')).text).toContain(
      '名前が分からない子供',
    );
  });
  it('境界の読込失敗を部分的な一覧にしない', async () => {
    daily().mockRejectedValue(new Error('offline'));
    await expect(prepareContent(ctx, 'dailyReminder', '2027-01-31')).rejects.toThrow();
  });
  it('確定済みは正常省略', async () => {
    daily();
    vi.mocked(calendar.isMonthConfirmed).mockResolvedValue(true);
    expect(await prepareContent(ctx, 'dailyReminder', '2027-01-31')).toEqual({
      reason: 'confirmed',
    });
  });
});
