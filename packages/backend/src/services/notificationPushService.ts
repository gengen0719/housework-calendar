import type { NotificationReason } from '@housework/shared';
import { callLine, LineApiError } from './lineApiService';
export type PushOutcome =
  | { accepted: true; providerRequestId?: string }
  | {
      accepted: false;
      retryable: boolean;
      reason: NotificationReason;
      retryAfterMs?: number;
      ambiguous: boolean;
    };
/** 通信は一度だけ。再試行は通知記録とSQSが所有する。 */
export async function pushNotification(
  destination: string,
  text: string,
  retryKey: string,
): Promise<PushOutcome> {
  let response: Response;
  try {
    response = await callLine(
      '/v2/bot/message/push',
      {
        method: 'POST',
        headers: { 'X-Line-Retry-Key': retryKey },
        body: JSON.stringify({ to: destination, messages: [{ type: 'text', text }] }),
      },
      5000,
    );
  } catch (e) {
    return {
      accepted: false,
      retryable: true,
      reason: e instanceof LineApiError && e.timedOut ? 'timeout' : 'connection',
      ambiguous: true,
    };
  }
  const acceptedId = response.headers.get('x-line-accepted-request-id');
  if (
    response.ok ||
    (response.status === 409 && acceptedId && /^[A-Za-z0-9_-]{1,128}$/.test(acceptedId))
  )
    return {
      accepted: true,
      ...((acceptedId ?? response.headers.get('x-line-request-id'))
        ? { providerRequestId: (acceptedId ?? response.headers.get('x-line-request-id'))! }
        : {}),
    };
  const retryable = response.status === 429 || response.status >= 500;
  const raw = response.headers.get('retry-after');
  let retryAfterMs: number | undefined;
  if (raw) {
    const seconds = Number(raw);
    retryAfterMs = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1000)
      : Math.max(0, Date.parse(raw) - Date.now());
    if (!Number.isFinite(retryAfterMs)) retryAfterMs = undefined;
  }
  return {
    accepted: false,
    retryable,
    reason: response.status === 429 ? 'rateLimit' : response.status >= 500 ? 'server' : 'permanent',
    ambiguous: response.status >= 500,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}
