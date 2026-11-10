/**
 * U8 のテストで使う、LINE の Webhook のイベントの作り方（LINE の形どおり）と、署名つきの要求。
 * 署名は、作り物のチャネルのシークレットで計算した本物の HMAC（U1 の `sign`・`webhookRequest`）。
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { handler } from '../../../src/entries/line';
import { webhookRequest } from '../../u1-skeleton-family/helpers/world';
import { FAKE_U8_GROUP_ID, FAKE_U8_REPLY_TOKEN_PREFIX } from '../../fixtures/fakeSecrets';

export type SourceKind = 'user' | 'group' | 'room';

export interface SwapEventOptions {
  kind?: SourceKind;
  /** LINE のユーザー ID。省略すると子供の太郎（`U_taro`）。`undefined` を明示すると source.userId なし */
  lineUserId?: string | undefined;
  groupId?: string;
  timestamp?: number;
  /** replyToken を外す（「返事の宛先がないイベントは受け付けない」の確認用） */
  noReplyToken?: boolean;
}

/** 太郎の LINE のユーザー ID（U2 の seedUser が `U_<key>` で作る） */
export const TARO_LINE_ID = 'U_taro';
export const HANAKO_LINE_ID = 'U_hanako';
export const JIRO_LINE_ID = 'U_jiro';
export const MOTHER_LINE_ID = 'U_mother';

function source(options: SwapEventOptions) {
  const kind = options.kind ?? 'group';
  const lineUserId = 'lineUserId' in options ? options.lineUserId : TARO_LINE_ID;
  return {
    type: kind,
    ...(lineUserId === undefined ? {} : { userId: lineUserId }),
    ...(kind === 'group' ? { groupId: options.groupId ?? FAKE_U8_GROUP_ID } : {}),
    ...(kind === 'room' ? { roomId: 'R_u8_room' } : {}),
  };
}

function base(webhookEventId: string, options: SwapEventOptions) {
  return {
    webhookEventId,
    ...(options.noReplyToken
      ? {}
      : { replyToken: `${FAKE_U8_REPLY_TOKEN_PREFIX}${webhookEventId}` }),
    source: source(options),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
  };
}

/** 文字のメッセージ（既定はグループ、太郎から）。 */
export function textMessage(webhookEventId: string, text: string, options: SwapEventOptions = {}) {
  return {
    type: 'message',
    ...base(webhookEventId, options),
    message: { type: 'text', id: `m-${webhookEventId}`, text },
  };
}

/** 「家事交代」のメッセージ。 */
export function swapMessage(webhookEventId: string, options: SwapEventOptions = {}) {
  return textMessage(webhookEventId, '家事交代', options);
}

/** postback（既定はグループ、太郎から）。 */
export function postbackEvent(
  webhookEventId: string,
  data: string,
  options: SwapEventOptions = {},
) {
  return { type: 'postback', ...base(webhookEventId, options), postback: { data } };
}

/** 担当を選ぶボタン（action=swap.offer&dutyId=<ID>）。 */
export function swapOfferPostback(
  webhookEventId: string,
  dutyId: string,
  options: SwapEventOptions = {},
) {
  return postbackEvent(webhookEventId, `action=swap.offer&dutyId=${dutyId}`, options);
}

/** 「引き受ける」のボタン（action=swap.accept&dutyId=<ID>&offerId=<offerId>）。 */
export function swapAcceptPostback(
  webhookEventId: string,
  dutyId: string,
  offerId: string,
  options: SwapEventOptions = {},
) {
  return postbackEvent(
    webhookEventId,
    `action=swap.accept&dutyId=${dutyId}&offerId=${offerId}`,
    options,
  );
}

/** 「申し出をやめる」のボタン（action=swap.withdraw&dutyId=<ID>&offerId=<offerId>）。 */
export function swapWithdrawPostback(
  webhookEventId: string,
  dutyId: string,
  offerId: string,
  options: SwapEventOptions = {},
) {
  return postbackEvent(
    webhookEventId,
    `action=swap.withdraw&dutyId=${dutyId}&offerId=${offerId}`,
    options,
  );
}

/** 署名つきの Webhook 要求を作る。 */
export function signedRequest(events: unknown[], signature?: string): APIGatewayProxyEventV2 {
  return webhookRequest({ events }, signature === undefined ? {} : { signature });
}

/** イベントを署名つきで LINE の入口に送る。 */
export async function sendEvents(
  events: unknown[],
  signature?: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  return (await handler(signedRequest(events, signature))) as APIGatewayProxyStructuredResultV2;
}

/** 1 件のイベントを送る。 */
export async function sendEvent(
  event: unknown,
  signature?: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  return sendEvents([event], signature);
}
