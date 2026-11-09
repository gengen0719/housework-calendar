import {
  doneDutyLabel,
  getMessage,
  recordedMessage,
  skippedDutyLabel,
  jstDateOf,
  jstTimeOf,
  type ChoreType,
  RECORD_FAILED_MESSAGE,
  RECORD_LIST_HEADING,
  RECORD_OVERFLOW_NOTE,
} from '@housework/shared';
import type { LineEvent } from './types';
import { MAX_RECORD_CHOICES, parseRecordCommand, type RecordCommand } from './recordCommand';
import { describeError, logger } from '../../lib/logger';
import { settle, type Settled } from '../../lib/promise';
import type { FamilyContext } from '../../middleware/requireMembership';
import { authorizeChild } from '../../services/oneToOneGate';
import * as choreTypeService from '../../services/choreTypeService';
import * as lineApiService from '../../services/lineApiService';
import type { LineMessage } from '../../services/lineApiService';
import {
  listTodayRecordableDuties,
  recordDuty,
  type RecordResult,
  type TodayRecordableList,
} from '../../services/recordingService';

/**
 * 1 対 1 の記録の入口（F1・F2。BR7.1〜BR7.9、NFR4.56〜NFR4.58）。
 * 1. authorizeChild で利用者を分ける。admin / outsider は本人にだけ決まった案内を返して終わり（担当・月・種類は読まない）
 * 2. child のときは、名前の Query を settle で並行して走らせ、record.list / record.do を処理する
 * 返事は本人にだけ（reply のみ）。push・multicast・broadcast は使わない（NFR4.58）。
 * 書いたあとに投げない作り: 名前の Query は書く前に待ち、返事の組み立ては純粋な関数、reply だけ try/catch（(c)）。
 */
export async function handleRecord(event: LineEvent, now: Date = new Date()): Promise<void> {
  const replyToken = event.replyToken;
  // 返事の宛先は accepts（parseRecordCommand）が確かめ済み。保険として宛先がなければ何もしない
  if (!replyToken) return;
  const command = parseRecordCommand(event);
  if (!command) return; // accepts で確かめ済み。保険

  const gate = await authorizeChild(event.source?.userId);
  if (gate.kind === 'admin') {
    logger.info({ event: 'RECORD_GUIDE_SENT', reason: 'ADMIN' });
    await reply(replyToken, [textMessage(getMessage('ADMIN_RECORD_GUIDE'))]);
    return;
  }
  if (gate.kind === 'outsider') {
    logger.info({ event: 'RECORD_GUIDE_SENT', reason: 'NOT_IN_FAMILY' });
    await reply(replyToken, [textMessage(getMessage('JOIN_FAMILY_FIRST'))]);
    return;
  }

  // gate.kind === 'child': 記録に進む
  const ctx = gate.ctx;
  // record.list は listTodayRecordableDuties が種類の名前を自分で引く（Query 1 回）。
  // record.do は recordDuty が名前を読まないので、成功の返事に使う名前の Query を担当の探索と並行して走らせる
  // （reliability-design.md の「名前の Query の置き方」。待つのは返事を作る直前）。
  const messages =
    command.kind === 'list'
      ? await buildListReply(ctx, now)
      : await buildDoReply(ctx, command, now, settle(choreTypeService.list(ctx)));
  // (c): 書けたあとに reply が失敗しても記録は残す。握りつぶして記録の結果は変えない
  try {
    await reply(replyToken, messages);
  } catch (error) {
    logger.warn({ event: 'LINE_REPLY_FAILED', ...describeError(error) });
  }
}

/** record.list の返事（F1 の 4.〜5.、BR7.2）。 */
async function buildListReply(ctx: FamilyContext, now: Date): Promise<LineMessage[]> {
  const list = await listTodayRecordableDuties(ctx, jstDateOf(now));
  return buildListMessages(list);
}

/** record.do の返事（F2 の 3.〜5.、BR7.4〜BR7.9）。 */
async function buildDoReply(
  ctx: FamilyContext,
  command: Extract<RecordCommand, { kind: 'do' }>,
  now: Date,
  names: Promise<Settled<ChoreType[]>>,
): Promise<LineMessage[]> {
  const result = await recordDuty(ctx, command.dutyId, command.version, {
    todayOnly: true,
    now,
    route: 'line',
  });
  // 名前の一覧（成功の返事に使う種類の名前）。失敗しても記録は済んでいるので、名前は空扱いにする
  const settled = await names;
  const nameById = new Map(
    (settled.ok ? settled.value : []).map((type) => [type.choreTypeId, type.name]),
  );
  return buildDoMessages(result, nameById, () => listTodayRecordableDuties(ctx, jstDateOf(now)));
}

/** 今日の一覧から LINE の返事を組み立てる（純粋。BR7.2）。 */
export function buildListMessages(list: TodayRecordableList | 'MONTH_CONFIRMED'): LineMessage[] {
  if (list === 'MONTH_CONFIRMED') return [textMessage(getMessage('MONTH_CONFIRMED'))];
  const messages: LineMessage[] = [];
  if (list.selectable.length === 0) {
    messages.push(textMessage(getMessage('NO_RECORDABLE_DUTY')));
  } else {
    messages.push(textMessage(RECORD_LIST_HEADING));
    const shown = list.selectable.slice(0, MAX_RECORD_CHOICES);
    messages.push(
      lineApiService.buildRecordCarousel(
        shown.map((duty) => ({
          dutyId: duty.dutyId,
          choreName: duty.choreName,
          version: duty.version,
        })),
      ),
    );
    if (list.selectable.length > MAX_RECORD_CHOICES) {
      messages.push(textMessage(RECORD_OVERFLOW_NOTE));
    }
  }
  const notSelectable = buildNotSelectableLines(list.notSelectable);
  if (notSelectable) messages.push(textMessage(notSelectable));
  return messages;
}

/** 選べない担当の文字の並び（「皿洗い（済 16:42）」「掃除機（×）」。1 担当 1 行）。空なら undefined。 */
function buildNotSelectableLines(
  notSelectable: TodayRecordableList['notSelectable'],
): string | undefined {
  if (notSelectable.length === 0) return undefined;
  return notSelectable
    .map((duty) =>
      duty.status === 'done'
        ? doneDutyLabel(duty.choreName, duty.recordedTime ?? '')
        : skippedDutyLabel(duty.choreName),
    )
    .join('\n');
}

/**
 * record.do の結果から返事を組み立てる（純粋。functional-spec.md の「記録の結果の印と返事の対応」の LINE の列）。
 * 出し直しが要る印では、今の選択肢（listTodayRecordableDuties）を同じ返事に添える。
 */
export async function buildDoMessages(
  result: RecordResult,
  nameById: ReadonlyMap<string, string>,
  relist: () => Promise<TodayRecordableList | 'MONTH_CONFIRMED'>,
): Promise<LineMessage[]> {
  if (result.ok) {
    const choreName = nameById.get(result.duty.choreTypeId) ?? '';
    const time = jstTimeOf(result.duty.recordedAt ?? result.duty.updatedAt);
    return [textMessage(recordedMessage(choreName, time))];
  }
  switch (result.reason) {
    case 'MONTH_CONFIRMED':
      return [textMessage(getMessage('MONTH_CONFIRMED'))];
    case 'INTERNAL':
      return [textMessage(RECORD_FAILED_MESSAGE)];
    case 'DUTY_ALREADY_DONE':
      return withChoices(getMessage('DUTY_ALREADY_DONE'), relist);
    case 'FUTURE_DUTY':
      return withChoices(getMessage('FUTURE_DUTY'), relist);
    // NOT_FOUND・NOT_OWN_DUTY・DUTY_CHANGED・NOT_TODAY_DUTY は「この担当は先に変更されました」
    default:
      return withChoices(getMessage('DUTY_CHANGED'), relist);
  }
}

/** 先頭の文言に、今の選択肢（出し直し）を添える。記録できる担当がなくなっていれば一覧だけの返事にする。 */
async function withChoices(
  heading: string,
  relist: () => Promise<TodayRecordableList | 'MONTH_CONFIRMED'>,
): Promise<LineMessage[]> {
  const list = await relist();
  if (list === 'MONTH_CONFIRMED') return [textMessage(getMessage('MONTH_CONFIRMED'))];
  if (list.selectable.length === 0) return buildListMessages(list);
  return [textMessage(heading), ...buildListMessages(list)];
}

function textMessage(text: string): LineMessage {
  return lineApiService.buildTextMessage(text);
}

function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  return lineApiService.reply(replyToken, messages);
}
