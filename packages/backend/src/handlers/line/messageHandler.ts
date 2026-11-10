import { handleGroupEvent } from './groupEventHandler';
import { parseSwapMessage } from './swapCommand';
import { handleSwap } from './swapHandler';
import type { LineEvent } from './types';

/**
 * message の入口。ここに届くのは、操作にあたるものだけ
 * （entries/line.ts の accepts が、そうでないものを二度処理しない記録の前に打ち切る）。
 * 「家事交代」（U8）を分け、そうでなければ今までのグループの操作（U3 の「登録」）に渡す。
 * 2 つの言葉は重ならない。
 */
export async function handleMessage(event: LineEvent, now: Date = new Date()): Promise<void> {
  if (parseSwapMessage(event) !== null) {
    await handleSwap(event, now);
    return;
  }
  await handleGroupEvent(event, now);
}
