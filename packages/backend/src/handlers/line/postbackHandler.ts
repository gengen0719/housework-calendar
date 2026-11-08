import { handleGroupEvent } from './groupEventHandler';
import type { LineEvent } from './types';

/**
 * postback の入口。ここに届くのは、操作にあたるものだけ
 * （entries/line.ts の accepts が、そうでないものを二度処理しない記録の前に打ち切る）。
 */
export async function handlePostback(event: LineEvent, now: Date = new Date()): Promise<void> {
  await handleGroupEvent(event, now);
}
