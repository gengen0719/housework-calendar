import { handleGroupEvent } from './groupEventHandler';
import { parseRecordCommand } from './recordCommand';
import { handleRecord } from './recordHandler';
import type { LineEvent } from './types';

/**
 * postback の入口。ここに届くのは、操作にあたるものだけ
 * （entries/line.ts の accepts が、そうでないものを二度処理しない記録の前に打ち切る）。
 * まず parseRecordCommand で記録の操作（U6。source.type=user の record.list / record.do）を分け、
 * そうでなければ今までの groupEvent に渡す（2 つの判定は重ならない。security-design.md）。
 */
export async function handlePostback(event: LineEvent, now: Date = new Date()): Promise<void> {
  if (parseRecordCommand(event) !== null) {
    await handleRecord(event, now);
    return;
  }
  await handleGroupEvent(event, now);
}
