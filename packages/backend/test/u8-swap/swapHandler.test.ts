import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSwap } from '../../src/handlers/line/swapHandler';
import type { LineEvent } from '../../src/handlers/line/types';
import { stubLineFetchForSwap, type LineFetchStub } from './helpers/lineFetch';
import { swapMessage, swapOfferPostback } from './helpers/lineEvents';
import { FAKE_U8_DUTY_ID_A } from '../fixtures/fakeSecrets';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { seedSwapHousehold } from './helpers/seed';
import { NOW } from './helpers/swapWorld';

const as = (e: unknown): LineEvent => e as LineEvent;

describe('handleSwap（BR9.2〜BR9.4、BR9.16）', () => {
  let line: LineFetchStub;
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    seedSwapHousehold(world);
    line = stubLineFetchForSwap();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1 対 1 の「家事交代」は案内だけを返す', async () => {
    await handleSwap(as(swapMessage('e1', { kind: 'user' })), NOW);
    expect(line.sentMessages()).toEqual([
      { type: 'text', text: '代わってほしいときは、家族のグループで『家事交代』と送ってください' },
    ]);
    expect(world.hooks.readLog).toHaveLength(0);
  });
  it('ルーム・返事の宛先なし・操作でないイベントは何もしない', async () => {
    await handleSwap(as(swapMessage('e2', { kind: 'room' })), NOW);
    await handleSwap(as(swapMessage('e3', { noReplyToken: true })), NOW);
    await handleSwap(as({ type: 'message', replyToken: 'r', source: { type: 'group' } }), NOW);
    expect(line.calls).toHaveLength(0);
  });
  it('1 対 1 のボタンの値は何もしない', async () => {
    await handleSwap(as(swapOfferPostback('e4', FAKE_U8_DUTY_ID_A, { kind: 'user' })), NOW);
    expect(line.calls).toHaveLength(0);
  });
  it('reply が失敗しても投げない', async () => {
    line.setReplyMode('http-500');
    await expect(handleSwap(as(swapMessage('e5')), NOW)).resolves.toBeUndefined();
    expect(line.replies()).toHaveLength(1);
  });
  it('reply 以外の通信（push・multicast・broadcast・プロフィール）は出ない', async () => {
    await handleSwap(as(swapMessage('e6')), NOW);
    await handleSwap(as(swapOfferPostback('e7', FAKE_U8_DUTY_ID_A)), NOW);
    expect(line.unexpected()).toHaveLength(0);
  });
});
