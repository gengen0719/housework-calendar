import { getConfig } from '../../lib/config';
import { describeError, logger } from '../../lib/logger';
import * as familyMemberService from '../../services/familyMemberService';
import * as lineApiService from '../../services/lineApiService';
import type { LineEvent } from './types';

/** 友だち登録の返事（BR1.2）: あいさつ、アプリを開くボタン、使い始め方の短い説明。 */
export function buildFollowReply(liffUrl: string): lineApiService.LineMessage[] {
  return [
    {
      type: 'text',
      text: '友だち追加ありがとうございます！お手伝いカレンダーへようこそ。',
    },
    {
      type: 'template',
      altText: 'お手伝いカレンダーを開く',
      template: {
        type: 'buttons',
        text: 'はじめ方：お母さんは「家族を作る」、子供は「招待を待つ」を選んでください。',
        actions: [{ type: 'uri', label: 'アプリを開く', uri: liffUrl }],
      },
    },
  ];
}

/** F1: 友だち登録。思いがけない失敗は投げる（入口が 500 にする）。返事の失敗は記録するだけ（C4）。 */
export async function handleFollow(event: LineEvent, now: Date = new Date()): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) {
    logger.warn({ event: 'LINE_EVENT_SKIPPED', type: 'follow', reason: 'no-user-id' });
    return;
  }
  const profile = await lineApiService.getProfile(lineUserId);
  if (!profile.ok) {
    // 友だち登録のイベントなのにプロフィールが取れない: 思いがけない失敗として LINE の再送に任せる
    throw new Error('友だち登録のイベントでプロフィールを取得できませんでした');
  }
  const user = await familyMemberService.registerUser(lineUserId, profile.value.displayName, now);
  logger.info({
    event: 'LINE_EVENT_PROCESSED',
    type: 'follow',
    userId: user.userId,
    result: 'registered',
  });

  if (!event.replyToken) return;
  try {
    const { liffUrl } = await getConfig();
    await lineApiService.reply(event.replyToken, buildFollowReply(liffUrl));
  } catch (cause) {
    logger.error({
      event: 'LINE_REPLY_FAILED',
      type: 'follow',
      userId: user.userId,
      ...describeError(cause),
    });
  }
}
