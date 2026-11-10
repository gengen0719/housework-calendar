/**
 * U8 の LINE の受け口の筋書き（swap-line / swap-line-roles / swap-line-resilience）で共通に使う道具。
 * 署名つきの Webhook を entries/line の handler に渡し、LINE の API は fetch の差し替えで受ける。
 */
import { vi } from 'vitest';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { resetNow, setNow, setupWorld } from '../../u1-skeleton-family/helpers/world';
import { stubLineFetchForSwap, type LineFetchStub, type ReplyMode } from './lineFetch';
import { sendEvent, sendEvents, type SwapEventOptions } from './lineEvents';
import { seedSwapHousehold } from './seed';
import { NOW } from './swapWorld';

export type LineWorld = ReturnType<typeof setupWorld>;

export interface LineSwapWorld {
  world: LineWorld;
  line: LineFetchStub;
  logs: Record<string, unknown>[];
  nextId: (prefix?: string) => string;
  /** 返事の全メッセージを 1 つの文字列にする（文言の確認用） */
  replyText: () => string;
  /** 送った返事（メッセージの配列を 1 回ごとに） */
  replyBatches: () => unknown[][];
  /** Calendar と ChoreTypes の読み取りの回数 */
  calendarReads: () => number;
  send: typeof sendEvent;
  sendMany: typeof sendEvents;
}

/** 世界を作り直す。固定の「今」は 2027-01-08 12:00（日本時間）。 */
export function startLineWorld(options: { reply?: ReplyMode } = {}): LineSwapWorld {
  const world = setupWorld();
  process.env.ENTRY = 'line';
  setNow(NOW.toISOString());
  const line = stubLineFetchForSwap(options.reply ? { reply: options.reply } : {});
  const logs: Record<string, unknown>[] = [];
  vi.spyOn(console, 'log').mockImplementation((raw: unknown) => {
    try {
      logs.push(JSON.parse(String(raw)) as Record<string, unknown>);
    } catch {
      // JSON でない行は集めない
    }
  });
  seedSwapHousehold(world);
  let counter = 0;
  return {
    world,
    line,
    logs,
    nextId: (prefix = 'evt-u8') => `${prefix}-${(counter += 1)}`,
    replyText: () => JSON.stringify(line.replies().map((call) => call.body)),
    replyBatches: () =>
      line.replies().map((call) => (call.body as { messages: unknown[] }).messages),
    calendarReads: () =>
      world.hooks.readLog.filter(
        (entry) => entry.table === CALENDAR_TABLE || entry.table === CHORE_TYPES_TABLE,
      ).length,
    send: sendEvent,
    sendMany: sendEvents,
  };
}

/** 後始末。 */
export function stopLineWorld(): void {
  resetNow();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export type { SwapEventOptions };
