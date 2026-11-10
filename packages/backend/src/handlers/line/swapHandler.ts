import {
  getMessage,
  jstDateOf,
  SWAP_ACCEPT_FAILED_MESSAGE,
  SWAP_ADMIN_GUIDE,
  SWAP_LIST_HEADING,
  SWAP_OFFER_FAILED_MESSAGE,
  SWAP_ONE_TO_ONE_GUIDE,
  SWAP_OVERFLOW_NOTE,
  swapAcceptedMessage,
  swapOfferedMessage,
  swapWithdrawnMessage,
} from '@housework/shared';
import { describeError, logger } from '../../lib/logger';
import type { FamilyContext } from '../../middleware/requireMembership';
import { runGroupOperation } from '../../services/groupCommandGate';
import * as lineApiService from '../../services/lineApiService';
import {
  SWAP_NOTICE_NAME_MAX,
  truncateForLine,
  type LineMessage,
} from '../../services/lineApiService';
import {
  SWAP_CHOICES_MAX,
  acceptSwap,
  listSwappableDuties,
  offerSwap,
  withdrawSwap,
  type SwappableDuty,
} from '../../services/swapService';
import { parseSwapMessage, parseSwapPostback, type SwapPostbackCommand } from './swapCommand';
import type { LineEvent } from './types';

type SwapResult<T extends { ok: true }> = T | { ok: false; reason: string };

const textMessage = (text: string): LineMessage => lineApiService.buildTextMessage(text);

/** 「2027-01-08」→「1/8」（0 埋めなし。ボタンの日付の部分で、最大 5 文字） */
function slashDate(date: string): string {
  const [, month = '', day = ''] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/** 知らせの本文に入れる名前を、本文の上限に収める（BR9.6、NFR8.15）。 */
const shortName = (name: string): string => truncateForLine(name, SWAP_NOTICE_NAME_MAX);

/**
 * 「家事交代」の返事を組み立てる（純粋。BR9.6）。窓口の全件から先頭の 10 件だけ carousel にし、超えれば案内を添える。
 */
export function buildListMessages(
  list: readonly SwappableDuty[] | 'NO_SWAPPABLE_DUTY' | 'MONTH_CONFIRMED',
): LineMessage[] {
  if (typeof list === 'string') return [textMessage(getMessage(list))];
  const messages: LineMessage[] = [
    textMessage(SWAP_LIST_HEADING),
    lineApiService.buildSwapCarousel(
      list.slice(0, SWAP_CHOICES_MAX).map((duty) => ({
        dutyId: duty.dutyId,
        dateLabel: slashDate(duty.date),
        choreName: duty.choreName,
      })),
    ),
  ];
  if (list.length > SWAP_CHOICES_MAX) messages.push(textMessage(SWAP_OVERFLOW_NOTE));
  return messages;
}

/** 担当を選んだ結果の返事（BR9.7。functional-spec の「結果の印と返事の対応」）。 */
export function buildOfferMessages(
  result: SwapResult<{
    ok: true;
    offerId: string;
    duty: { dutyId: string; date: string };
    choreName: string;
  }>,
  displayName: string,
): LineMessage[] {
  if (result.ok) {
    return [
      lineApiService.buildSwapOfferMessage({
        text: swapOfferedMessage(
          shortName(displayName),
          result.duty.date,
          shortName(result.choreName),
        ),
        dutyId: result.duty.dutyId,
        offerId: result.offerId,
      }),
    ];
  }
  switch (result.reason) {
    case 'ALREADY_OFFERED':
    case 'OFFER_OWNER_ONLY':
    case 'MONTH_CONFIRMED':
      return [textMessage(getMessage(result.reason))];
    case 'INTERNAL':
      return [textMessage(SWAP_OFFER_FAILED_MESSAGE)];
    // NOT_FOUND・DUTY_NOT_TODO・DUTY_CHANGED は「この担当は先に変更されました」
    default:
      return [textMessage(getMessage('DUTY_CHANGED'))];
  }
}

/** 引き受けた結果の返事（BR9.9）。 */
export function buildAcceptMessages(
  result: SwapResult<{ ok: true; duty: { date: string }; choreName: string }>,
  displayName: string,
): LineMessage[] {
  if (result.ok) {
    return [
      textMessage(
        swapAcceptedMessage(shortName(displayName), result.duty.date, shortName(result.choreName)),
      ),
    ];
  }
  switch (result.reason) {
    case 'OFFER_ALREADY_ACCEPTED':
    case 'CANNOT_ACCEPT_OWN_OFFER':
      return [textMessage(getMessage(result.reason))];
    case 'INTERNAL':
      return [textMessage(SWAP_ACCEPT_FAILED_MESSAGE)];
    // OFFER_GONE・NOT_FOUND などは「この申し出はもうありません」
    default:
      return [textMessage(getMessage('OFFER_GONE'))];
  }
}

/** 取り下げた結果の返事（BR9.10）。 */
export function buildWithdrawMessages(
  result: SwapResult<{ ok: true; duty: { date: string }; choreName: string }>,
  displayName: string,
): LineMessage[] {
  if (result.ok) {
    return [
      textMessage(
        swapWithdrawnMessage(shortName(displayName), result.duty.date, shortName(result.choreName)),
      ),
    ];
  }
  switch (result.reason) {
    case 'OFFER_ALREADY_ACCEPTED':
    case 'OFFER_OWNER_ONLY':
      return [textMessage(getMessage(result.reason))];
    case 'INTERNAL':
      return [textMessage(SWAP_OFFER_FAILED_MESSAGE)];
    default:
      return [textMessage(getMessage('OFFER_GONE'))];
  }
}

/** グループの中での操作を行い、返事のメッセージを返す。思いがけない失敗は投げる（入口が 500 にする）。 */
async function operate(
  ctx: FamilyContext,
  displayName: string,
  command: SwapPostbackCommand | { kind: 'list' },
  now: Date,
): Promise<LineMessage[]> {
  switch (command.kind) {
    case 'list':
      if (ctx.role === 'admin') {
        // 管理者は申し出られない。担当も申し出も読まない（BR9.3）
        logger.info({ event: 'SWAP_GUIDE_SENT', reason: 'ADMIN' });
        return [textMessage(SWAP_ADMIN_GUIDE)];
      }
      return buildListMessages(await listSwappableDuties(ctx, jstDateOf(now)));
    case 'offer':
      return buildOfferMessages(await offerSwap(ctx, command.dutyId, { now }), displayName);
    case 'accept':
      return buildAcceptMessages(
        await acceptSwap(ctx, command.dutyId, command.offerId, { now }),
        displayName,
      );
    case 'withdraw':
      return buildWithdrawMessages(
        await withdrawSwap(ctx, command.dutyId, command.offerId, { now }),
        displayName,
      );
  }
}

/** reply を送る。失敗しても書いた結果は変えず、記録するだけ（BR9.14、NFR2.20）。 */
async function replySafely(replyToken: string, messages: LineMessage[]): Promise<void> {
  try {
    await lineApiService.reply(replyToken, messages);
  } catch (cause) {
    logger.warn({ event: 'LINE_REPLY_FAILED', ...describeError(cause) });
  }
}

/**
 * 代わりにやる（U8）の入口（F1〜F4、F6）。ここに届くのは操作にあたるものだけ
 * （entries/line.ts の accepts が、そうでないものを二度処理しない記録の前に打ち切る）。
 * - 1 対 1 の「家事交代」→ 案内だけ（誰が送っても同じ文。何も読まない）
 * - グループ → runGroupOperation（登録と家族のメンバーの確かめ）を通して操作する
 * - ルーム・1 対 1 のボタンの値 → 何もしない
 * 返事は reply だけ。push・multicast・broadcast とプロフィールの取得は使わない（NFR1.32）。
 * 書いたあとに投げない作り: 返事の組み立ては純粋な関数、reply だけ try/catch。
 */
export async function handleSwap(event: LineEvent, now: Date = new Date()): Promise<void> {
  const replyToken = event.replyToken;
  if (!replyToken) return;
  const message = parseSwapMessage(event);
  const command = message ?? parseSwapPostback(event);
  if (!command) return;
  if (event.source?.type === 'user' && message) {
    logger.info({ event: 'SWAP_GUIDE_SENT', reason: 'ONE_TO_ONE' });
    await replySafely(replyToken, [textMessage(SWAP_ONE_TO_ONE_GUIDE)]);
    return;
  }
  const groupId = event.source?.groupId;
  if (event.source?.type !== 'group' || !groupId) return; // ルームなど
  const outcome = await runGroupOperation(groupId, event.source.userId, (ctx, displayName) =>
    operate(ctx, displayName, command, now),
  );
  await replySafely(
    replyToken,
    outcome.status === 'done' ? outcome.value : [textMessage(outcome.message)],
  );
}
