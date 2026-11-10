import {
  err,
  ok,
  SWAP_ACCEPT_BUTTON,
  SWAP_WITHDRAW_BUTTON,
  swapAcceptedMessage,
  swapOfferedMessage,
  swapWithdrawnMessage,
  type Result,
} from '@housework/shared';
import { getConfig } from '../lib/config';

const LINE_API = 'https://api.line.me';
/** LINE の API の時間切れ（NFR7.5） */
export const LINE_API_TIMEOUT_MS = 5000;

/** LINE の API の思いがけない失敗（時間切れ、5xx など）。メッセージに秘密の情報は入れない。 */
export class LineApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** 時間切れで打ち切ったとき true */
    readonly timedOut: boolean = false,
  ) {
    super(message);
    this.name = 'LineApiError';
  }
}

/** グループの名前を受け取る時間切れ（NFR7.14。reply トークンの期限と 3 秒の目安に収める） */
export const GROUP_SUMMARY_TIMEOUT_MS = 2000;

export interface LineProfile {
  displayName: string;
}

export type LineMessage = Record<string, unknown>;

export async function callLine(
  path: string,
  init: RequestInit,
  timeoutMs: number = LINE_API_TIMEOUT_MS,
): Promise<Response> {
  const { channelAccessToken } = await getConfig();
  try {
    return await fetch(`${LINE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    // 時間切れ・通信の失敗。トークンを含む情報は載せない
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    throw new LineApiError(
      `LINE API への接続に失敗しました: ${path.split('/').slice(0, 4).join('/')}`,
      undefined,
      timedOut,
    );
  }
}

/**
 * プロフィールを取る。受け取れれば友だち、404 なら友だちではない（BR1.11）。
 * それ以外の失敗は LineApiError を投げる。
 */
export async function getProfile(lineUserId: string): Promise<Result<LineProfile, 'NOT_FRIEND'>> {
  const response = await callLine(`/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
    method: 'GET',
  });
  if (response.status === 404) return err('NOT_FRIEND');
  if (!response.ok)
    throw new LineApiError('LINE プロフィールの取得に失敗しました', response.status);
  const data = (await response.json()) as { displayName?: unknown };
  if (typeof data.displayName !== 'string' || data.displayName.length === 0) {
    throw new LineApiError('LINE プロフィールに表示名がありません', response.status);
  }
  return ok({ displayName: data.displayName });
}

/**
 * LINE ログインの ID トークンを確かめる（BR2.1、C4）。`POST /oauth2/v2.1/verify`。
 * このチャネルのものでない・期限切れ・形が違う（4xx、または中身が合わない）: UNAUTHENTICATED。
 * 時間切れ・通信の失敗・5xx は LineApiError を投げる（入口が 503 にする）。
 * 秘密の情報は付けない（ID トークンはログにも出さない）。
 */
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  now: Date = new Date(),
): Promise<Result<{ sub: string }, 'UNAUTHENTICATED'>> {
  let response: Response;
  try {
    response = await fetch(`${LINE_API}/oauth2/v2.1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }).toString(),
      signal: AbortSignal.timeout(LINE_API_TIMEOUT_MS),
    });
  } catch {
    throw new LineApiError('LINE の ID トークンの確認に接続できませんでした');
  }
  if (response.status >= 500) {
    throw new LineApiError('LINE の ID トークンの確認に失敗しました', response.status);
  }
  if (response.status !== 200) return err('UNAUTHENTICATED');
  const data = (await response.json().catch(() => ({}))) as {
    sub?: unknown;
    aud?: unknown;
    exp?: unknown;
  };
  const valid =
    typeof data.sub === 'string' &&
    data.sub.length > 0 &&
    data.aud === clientId &&
    typeof data.exp === 'number' &&
    data.exp > Math.floor(now.getTime() / 1000);
  return valid ? ok({ sub: data.sub as string }) : err('UNAUTHENTICATED');
}

export type GroupSummaryFailure = 'timeout' | `http_${number}` | 'connection' | 'invalid';

/**
 * グループの名前を受け取る（C4、BR4.8）。2 秒で打ち切り、受け取れなくても投げない
 * （登録は名前なしで続ける）。失敗の理由は 'timeout'、'http_<status>' など。
 */
export async function getGroupSummary(
  groupId: string,
): Promise<Result<{ groupName: string }, GroupSummaryFailure>> {
  let response: Response;
  try {
    response = await callLine(
      `/v2/bot/group/${encodeURIComponent(groupId)}/summary`,
      { method: 'GET' },
      GROUP_SUMMARY_TIMEOUT_MS,
    );
  } catch (cause) {
    if (cause instanceof LineApiError) return err(cause.timedOut ? 'timeout' : 'connection');
    throw cause;
  }
  if (!response.ok) return err(`http_${response.status}`);
  const data = (await response.json().catch(() => ({}))) as { groupName?: unknown };
  if (typeof data.groupName !== 'string' || data.groupName.length === 0) return err('invalid');
  return ok({ groupName: data.groupName });
}

/** ただのテキストメッセージ（U6。案内・返事の 1 行に使う）。 */
export function buildTextMessage(text: string): LineMessage {
  return { type: 'text', text };
}

/** 返事に付ける、ボタン 1 つ（postback）つきのメッセージ。 */
export function buildPostbackButtonMessage(input: {
  altText: string;
  text: string;
  label: string;
  data: string;
}): LineMessage {
  return {
    type: 'template',
    altText: input.altText,
    template: {
      type: 'buttons',
      text: input.text,
      actions: [{ type: 'postback', label: input.label, data: input.data }],
    },
  };
}

/** record.do のボタンの値を作る（BR7.3）。action=record.do&dutyId=<ID>&v=<version>。 */
export function recordDoData(dutyId: string, version: number): string {
  return `action=record.do&dutyId=${dutyId}&v=${version}`;
}

/** 記録の選択肢の 1 つ（1 バブル 1 担当）。 */
export interface RecordChoice {
  dutyId: string;
  choreName: string;
  version: number;
}

/**
 * 記録の選択肢の Flex Message carousel（U6。BR7.2。1 バブル 1 担当。ボタンは record.do）。
 * altText は必須（LINE の SDK は使わない）。choices は呼び出し側が 12 件までに絞って渡す。
 */
export function buildRecordCarousel(choices: readonly RecordChoice[]): LineMessage {
  return {
    type: 'flex',
    altText: '記録する担当を選んでください',
    contents: {
      type: 'carousel',
      contents: choices.map((choice) => ({
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [{ type: 'text', text: choice.choreName, weight: 'bold', wrap: true }],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              action: {
                type: 'postback',
                label: '記録する',
                data: recordDoData(choice.dutyId, choice.version),
              },
            },
          ],
        },
      })),
    },
  };
}

/** 返事を送る。reply トークンは 1 回だけなので、やり直さない（C4）。 */
export async function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  const response = await callLine('/v2/bot/message/reply', {
    method: 'POST',
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!response.ok) throw new LineApiError('LINE の返事の送信に失敗しました', response.status);
}

/**
 * LINE の文字数・個数の上限（docs/contract-changes-u8.md の確認結果。2026-11-10 確認）。
 * 上限の数字はここだけに置く。ALT_TEXT_MAX は、公式の上限（1500）より厳しい 400 を使い続ける。
 */
export const LINE_LIMITS = {
  /** Flex の button のアクションの label */
  FLEX_BUTTON_LABEL_MAX: 40,
  /** buttons テンプレートのボタンの label */
  TEMPLATE_BUTTON_LABEL_MAX: 20,
  /** buttons テンプレートの本文（タイトル・画像なし） */
  TEMPLATE_BODY_MAX: 160,
  ALT_TEXT_MAX: 400,
  ALT_TEXT_OFFICIAL_MAX: 1500,
  CAROUSEL_BUBBLES_MAX: 12,
  REPLY_MESSAGES_MAX: 5,
  POSTBACK_DATA_MAX: 300,
} as const;

/** ボタンの日付の部分「M/D」の最大の長さ（12/31） */
export const DATE_LABEL_MAX_LENGTH = 5;
/** 申し出の名前の長さの上限（BR9.6。公式の上限が大きくても 20 文字に収める） */
const NAME_LENGTH_CAP = 20;

/** 担当のボタンの名前の長さ。上限から計算する（日付と空白 1 文字を引く）。 */
export const SWAP_CHORE_NAME_MAX = Math.min(
  LINE_LIMITS.FLEX_BUTTON_LABEL_MAX - DATE_LABEL_MAX_LENGTH - 1,
  NAME_LENGTH_CAP,
);

/** 文字を割らずに max 文字に収める。超えるときは末尾を「…」にする。 */
export function truncateForLine(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/** 担当のボタンの文字: 「1/8 皿洗い」（名前は SWAP_CHORE_NAME_MAX に収める） */
export function swapButtonLabel(dateLabel: string, choreName: string): string {
  return `${dateLabel} ${truncateForLine(choreName, SWAP_CHORE_NAME_MAX)}`;
}

const NOTICE_LONGEST_DATE = '2027-12-31';

function noticeMessages(who: string, what: string): string[] {
  return [swapOfferedMessage, swapAcceptedMessage, swapWithdrawnMessage].map((fn) =>
    fn(who, NOTICE_LONGEST_DATE, what),
  );
}

/** 名前を除いた固定の文と日付の最大の長さ */
const NOTICE_FIXED_LENGTH =
  Math.max(...noticeMessages('a', 'a').map((m) => Array.from(m).length)) - 2;

/** 知らせの本文の表示名・お手伝いの名前の長さ。本文の上限から計算し、20 を上限とする。 */
export const SWAP_NOTICE_NAME_MAX = Math.min(
  Math.floor((LINE_LIMITS.TEMPLATE_BODY_MAX - NOTICE_FIXED_LENGTH) / 2),
  NAME_LENGTH_CAP,
);

/** 名前を切ったときの、知らせの本文の最大の長さ（3 種類のうち最長）。上限の確認に使う。 */
export function swapNoticeLength(displayName: string, choreName: string): number {
  const who = truncateForLine(displayName, SWAP_NOTICE_NAME_MAX);
  const what = truncateForLine(choreName, SWAP_NOTICE_NAME_MAX);
  return Math.max(...noticeMessages(who, what).map((m) => Array.from(m).length));
}

/** 担当を選ぶボタンの値（BR9.16）。action=swap.offer&dutyId=<UUID> */
export function swapOfferData(dutyId: string): string {
  return `action=swap.offer&dutyId=${dutyId}`;
}
/** 「引き受ける」のボタンの値。action=swap.accept&dutyId=<UUID>&offerId=<UUID> */
export function swapAcceptData(dutyId: string, offerId: string): string {
  return `action=swap.accept&dutyId=${dutyId}&offerId=${offerId}`;
}
/** 「申し出をやめる」のボタンの値。action=swap.withdraw&dutyId=<UUID>&offerId=<UUID> */
export function swapWithdrawData(dutyId: string, offerId: string): string {
  return `action=swap.withdraw&dutyId=${dutyId}&offerId=${offerId}`;
}

/**
 * 代わりにやるのボタンの色（NFR9.9）。LINE の標準の配色の色の差は資料で確かめられなかったので（docs/contract-changes-u8.md）、
 * 白い文字に対して 4.5:1 以上になる濃い緑を自分で指定する。色の差は swapColors.test.ts が計算で確かめる。
 */
export const SWAP_BUTTON_COLOR = '#1b5e20';
export const SWAP_BUTTON_TEXT_COLOR = '#ffffff';

/** 担当の選択肢 1 つ（1 バブル 1 担当）。 */
export interface SwapChoice {
  dutyId: string;
  /** 「M/D」（例: 1/8） */
  dateLabel: string;
  choreName: string;
}

/**
 * 担当を選ぶ Flex Message carousel（U8。BR9.6）。1 バブル 1 担当。ボタンの文字は「1/8 皿洗い」で、名前は
 * SWAP_CHORE_NAME_MAX に収める。ボタンの値は swap.offer。altText は必須（LINE の SDK は使わない）。
 * choices は呼び出し側が 10 件までに絞って渡す。
 */
export function buildSwapCarousel(choices: readonly SwapChoice[]): LineMessage {
  return {
    type: 'flex',
    altText: '代わってほしい担当を選んでください',
    contents: {
      type: 'carousel',
      contents: choices.map((choice) => {
        const label = swapButtonLabel(choice.dateLabel, choice.choreName);
        return {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [{ type: 'text', text: label, weight: 'bold', wrap: true }],
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'button',
                style: 'primary',
                height: 'md',
                color: SWAP_BUTTON_COLOR,
                action: { type: 'postback', label, data: swapOfferData(choice.dutyId) },
              },
            ],
          },
        };
      }),
    },
  };
}

/**
 * 申し出の知らせ（U8。AC7.1.4）。buttons テンプレート（タイトル・画像なし）に「引き受ける」「申し出をやめる」の 2 ボタン。
 * 本文は 160 文字以内（呼び出し側が名前を SWAP_NOTICE_NAME_MAX に収める）。altText も同じ文。
 */
export function buildSwapOfferMessage(input: {
  text: string;
  dutyId: string;
  offerId: string;
}): LineMessage {
  return {
    type: 'template',
    altText: truncateForLine(input.text, LINE_LIMITS.ALT_TEXT_MAX),
    template: {
      type: 'buttons',
      text: truncateForLine(input.text, LINE_LIMITS.TEMPLATE_BODY_MAX),
      actions: [
        {
          type: 'postback',
          label: SWAP_ACCEPT_BUTTON,
          data: swapAcceptData(input.dutyId, input.offerId),
        },
        {
          type: 'postback',
          label: SWAP_WITHDRAW_BUTTON,
          data: swapWithdrawData(input.dutyId, input.offerId),
        },
      ],
    },
  };
}
