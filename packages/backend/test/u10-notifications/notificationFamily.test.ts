import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as repo from '../../src/repositories/familyRepository';
import * as calendarRepo from '../../src/repositories/calendarRepository';
import { listNotificationFamilies } from '../../src/services/familyMemberService';
import { listDutiesOn } from '../../src/services/calendarService';
import { FAKE_U10_FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID } from '../fixtures/fakeSecrets';
const db = mockClient(DynamoDBDocumentClient);
beforeEach(() => {
  db.reset();
  process.env.FAMILIES_TABLE = 'families';
});
afterEach(() => vi.restoreAllMocks());
describe('通知用の家族列挙', () => {
  it('限定したScanで必要なIDだけ読む', async () => {
    db.on(ScanCommand).resolves({ Items: [{ familyId: FAKE_U10_FAMILY_ID }] });
    expect((await repo.listNotificationFamilies()).familyIds).toEqual([FAKE_U10_FAMILY_ID]);
    expect(db.commandCalls(ScanCommand)[0]!.args[0].input).toMatchObject({
      Limit: 100,
      ProjectionExpression: 'familyId',
    });
  });
  it('ページの続きの印を返す', async () => {
    db.on(ScanCommand).resolves({ Items: [], LastEvaluatedKey: { familyId: FAKE_U10_FAMILY_ID } });
    expect((await repo.listNotificationFamilies()).cursor).toEqual({
      familyId: FAKE_U10_FAMILY_ID,
    });
  });
  it('壊れた家族IDを黙って省かない', async () => {
    db.on(ScanCommand).resolves({ Items: [{}] });
    await expect(repo.listNotificationFamilies()).rejects.toThrow();
  });
  it('Scan失敗を全件なしとしない', async () => {
    db.on(ScanCommand).rejects(new Error('read'));
    await expect(repo.listNotificationFamilies()).rejects.toThrow();
  });
  it('空の家族はページ0件', async () => {
    db.on(ScanCommand).resolves({});
    const pages = [];
    for await (const p of listNotificationFamilies()) pages.push(p);
    expect(pages).toEqual([[]]);
  });
  it('続きの印で最後まで進む', async () => {
    db.on(ScanCommand)
      .resolvesOnce({
        Items: [{ familyId: FAKE_U10_FAMILY_ID }],
        LastEvaluatedKey: { familyId: FAKE_U10_FAMILY_ID },
      })
      .resolves({ Items: [{ familyId: FAKE_U10_OTHER_FAMILY_ID }] });
    const ids = [];
    for await (const p of listNotificationFamilies()) ids.push(...p);
    expect(ids).toEqual([FAKE_U10_FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID]);
  });
});
describe('通知用の日付読取', () => {
  it.each(['todo', 'done', 'skipped'] as const)('状態%sを絞らず返す', async (status) => {
    const rows = [{ status }];
    vi.spyOn(calendarRepo, 'listDutiesOn').mockResolvedValue(rows as never);
    expect(await listDutiesOn({ familyId: FAKE_U10_FAMILY_ID }, '2027-01-31')).toEqual(rows);
  });
  it('家族と日付をそのまま持ち主へ渡す', async () => {
    const spy = vi.spyOn(calendarRepo, 'listDutiesOn').mockResolvedValue([]);
    await listDutiesOn({ familyId: FAKE_U10_OTHER_FAMILY_ID }, '2027-01-31');
    expect(spy).toHaveBeenCalledWith(FAKE_U10_OTHER_FAMILY_ID, '2027-01-31');
  });
  it('読み取り失敗を隠さない', async () => {
    vi.spyOn(calendarRepo, 'listDutiesOn').mockRejectedValue(new Error('read'));
    await expect(listDutiesOn({ familyId: FAKE_U10_FAMILY_ID }, '2027-01-31')).rejects.toThrow();
  });
});
