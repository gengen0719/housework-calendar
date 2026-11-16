import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/lib/logger';
import { dispatchFamily } from '../../src/services/notificationService';
import { familyRef } from '../../src/services/notificationIdentity';
import { workflow, job } from './helpers/workflow';

afterEach(() => vi.restoreAllMocks());
describe('重複と期限切れの許可項目だけの結果ログ', () => {
  it('送信済みの重複を1件記録し既存の送信ログを重ねない', async () => {
    const w = workflow();
    const log = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await dispatchFamily(job, w.options);
    await dispatchFamily(job, w.options);
    expect(log.mock.calls.map(([value]) => value.event)).toEqual([
      'NOTIFY_SENT',
      'NOTIFY_DUPLICATE',
    ]);
    expect(log.mock.calls[1]![0]).toEqual({
      event: 'NOTIFY_DUPLICATE',
      kind: job.kind,
      targetDate: job.targetDate,
      familyRef: familyRef(job.familyId, w.options.operationalKey),
    });
  });
  it.each(['without-record', 'prepared', 'before-send'] as const)(
    '%sの期限切れを記録する',
    async (path) => {
      const w = workflow();
      if (path === 'prepared') {
        w.provider.mockResolvedValueOnce({
          accepted: false,
          retryable: true,
          reason: 'server',
          ambiguous: false,
        });
        await dispatchFamily(job, w.options);
      }
      const log = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
      w.advance(path === 'before-send' ? 895001 : 900000);
      expect(await dispatchFamily(job, w.options)).toEqual({ outcome: 'expired' });
      expect(log.mock.calls.map(([value]) => value)).toEqual([
        {
          event: 'NOTIFY_EXPIRED',
          kind: job.kind,
          targetDate: job.targetDate,
          familyRef: familyRef(job.familyId, w.options.operationalKey),
          reason: 'deadline',
        },
      ]);
      expect(w.provider).toHaveBeenCalledTimes(path === 'prepared' ? 1 : 0);
    },
  );
});
