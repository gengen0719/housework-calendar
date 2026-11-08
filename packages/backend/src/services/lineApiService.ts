import { err, ok, type Result } from '@housework/shared';
import { getConfig } from '../lib/config';

const LINE_API = 'https://api.line.me';
/** LINE の API の時間切れ（NFR7.5） */
export const LINE_API_TIMEOUT_MS = 5000;

/** LINE の API の思いがけない失敗（時間切れ、5xx など）。メッセージに秘密の情報は入れない。 */
export class LineApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LineApiError';
  }
}

export interface LineProfile {
  displayName: string;
}

export type LineMessage = Record<string, unknown>;

async function callLine(path: string, init: RequestInit): Promise<Response> {
  const { channelAccessToken } = await getConfig();
  try {
    return await fetch(`${LINE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(LINE_API_TIMEOUT_MS),
    });
  } catch {
    // 時間切れ・通信の失敗。トークンを含む情報は載せない
    throw new LineApiError(
      `LINE API への接続に失敗しました: ${path.split('/').slice(0, 4).join('/')}`,
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

/** 返事を送る。reply トークンは 1 回だけなので、やり直さない（C4）。 */
export async function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  const response = await callLine('/v2/bot/message/reply', {
    method: 'POST',
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!response.ok) throw new LineApiError('LINE の返事の送信に失敗しました', response.status);
}
