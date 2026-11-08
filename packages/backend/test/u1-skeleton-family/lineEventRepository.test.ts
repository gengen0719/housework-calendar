import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as lineEventRepository from '../../src/repositories/lineEventRepository';
import { setupWorld } from './helpers/world';

const NOW = new Date('2026-11-05T00:00:00.000Z');
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe('lineEventRepository', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
  });

  it('初めてのイベントは処理中として書け、7 日後に消える期限が付く', async () => {
    expect(await lineEventRepository.begin('evt-1', NOW)).toBe('acquired');
    const item = world.events.get('evt-1');
    expect(item?.status).toBe('processing');
    expect(item?.receivedAt).toBe(NOW.toISOString());
    expect(item?.expiresAt).toBe(Math.floor(NOW.getTime() / 1000) + 7 * 24 * 60 * 60);
  });

  it('処理中の記録が新しければ、もう一度は始められない', async () => {
    await lineEventRepository.begin('evt-1', NOW);
    const later = new Date(NOW.getTime() + 30_000);
    expect(await lineEventRepository.begin('evt-1', later)).toBe('duplicate');
  });

  it('処理中のまま 2 分を過ぎていれば、処理し直せる', async () => {
    world.events.set('evt-1', {
      webhookEventId: 'evt-1',
      status: 'processing',
      receivedAt: minutesBefore(3),
    });
    expect(await lineEventRepository.begin('evt-1', NOW)).toBe('acquired');
    expect(world.events.get('evt-1')?.receivedAt).toBe(NOW.toISOString());
  });

  it('処理済みのイベントは、時間がたっていても始められない', async () => {
    world.events.set('evt-1', {
      webhookEventId: 'evt-1',
      status: 'done',
      receivedAt: minutesBefore(60),
    });
    expect(await lineEventRepository.begin('evt-1', NOW)).toBe('duplicate');
  });

  it('処理が終わったら処理済みにして期限を付け直す', async () => {
    await lineEventRepository.begin('evt-1', NOW);
    await lineEventRepository.markDone('evt-1', NOW);
    expect(world.events.get('evt-1')?.status).toBe('done');
    expect(world.events.get('evt-1')?.expiresAt).toBe(
      Math.floor(NOW.getTime() / 1000) + 7 * 24 * 60 * 60,
    );
  });

  it('思いがけない失敗のとき、記録を消すと次は処理し直せる', async () => {
    await lineEventRepository.begin('evt-1', NOW);
    await lineEventRepository.release('evt-1');
    expect(world.events.has('evt-1')).toBe(false);
    expect(await lineEventRepository.begin('evt-1', NOW)).toBe('acquired');
  });

  it('条件の失敗以外のエラーはそのまま投げる', async () => {
    world.mock.on(PutCommand).rejects(new Error('ProvisionedThroughputExceeded'));
    await expect(lineEventRepository.begin('evt-1', NOW)).rejects.toThrow(
      'ProvisionedThroughputExceeded',
    );
  });
});
