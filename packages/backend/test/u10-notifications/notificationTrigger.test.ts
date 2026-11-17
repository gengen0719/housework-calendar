import { afterEach, describe, it, expect, vi } from 'vitest';
import { dispatchTrigger } from '../../src/services/notificationService';
import * as family from '../../src/services/familyMemberService';
import * as queue from '../../src/services/notificationQueueService';
import * as repo from '../../src/repositories/notificationRepository';
import {
  FAKE_U10_FAMILY_ID,
  FAKE_U10_OTHER_FAMILY_ID,
  FAKE_U10_OPERATIONAL_SECRET,
} from '../fixtures/fakeSecrets';
const trigger = { kind: 'dailyReminder' as const, targetDate: '2027-01-31' };
const options = {
  env: 'staging',
  operationalKey: FAKE_U10_OPERATIONAL_SECRET,
  now: () => Date.parse('2027-01-31T07:00:00Z'),
};
afterEach(() => vi.restoreAllMocks());
function setup(ids = [FAKE_U10_FAMILY_ID, FAKE_U10_OTHER_FAMILY_ID]) {
  vi.spyOn(family, 'listNotificationFamilies').mockImplementation(async function* () {
    for (const id of ids) yield [id];
  });
  vi.spyOn(repo, 'beginRun').mockResolvedValue();
  vi.spyOn(repo, 'registerRunFamily').mockResolvedValue();
  vi.spyOn(repo, 'finishRunEnumeration').mockResolvedValue();
  return vi.spyOn(queue, 'enqueue').mockResolvedValue();
}
describe('定時の家族列挙', () => {
  it('続きの家族も仕事へ渡す', async () => {
    const q = setup();
    await dispatchTrigger(trigger, options);
    expect(q).toHaveBeenCalledTimes(2);
    expect(q.mock.calls.map((c) => c[0].familyId)).toEqual([
      FAKE_U10_FAMILY_ID,
      FAKE_U10_OTHER_FAMILY_ID,
    ]);
  });
  it('0家族も列挙完了とする', async () => {
    const q = setup([]);
    await dispatchTrigger(trigger, options);
    expect(q).not.toHaveBeenCalled();
    expect(repo.finishRunEnumeration).toHaveBeenCalled();
  });
  it('失敗した受け渡しを完了としない', async () => {
    const q = setup();
    q.mockRejectedValueOnce(new Error('queue'));
    await expect(dispatchTrigger(trigger, options)).rejects.toThrow();
    expect(repo.finishRunEnumeration).not.toHaveBeenCalled();
  });
  it('時刻前には家族を読まない', async () => {
    setup();
    await expect(dispatchTrigger(trigger, { ...options, now: () => 0 })).rejects.toThrow();
    expect(family.listNotificationFamilies).not.toHaveBeenCalled();
  });
  it('期限以降も家族を読まない', async () => {
    setup();
    await expect(
      dispatchTrigger(trigger, { ...options, now: () => options.now() + 900000 }),
    ).rejects.toThrow();
    expect(family.listNotificationFamilies).not.toHaveBeenCalled();
  });
  it('再起動でも対象印を先に保存', async () => {
    setup();
    await dispatchTrigger(trigger, options);
    expect(repo.registerRunFamily).toHaveBeenCalledWith(
      trigger,
      FAKE_U10_FAMILY_ID,
      expect.any(Number),
    );
  });
});
