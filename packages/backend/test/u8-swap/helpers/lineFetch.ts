/**
 * U8 のテストで使う、LINE の API の `fetch` の差し替え。本物にはつながない。
 *
 * - reply の本文を集める（`replies()`）
 * - reply の失敗（HTTP 500）・通信の失敗・時間切れを作れる
 * - reply 以外の外部への通信（プロフィール取得・push・multicast・broadcast など）が出たら
 *   `unexpected()` に残す（U8 は reply だけを使う。NFR1.32）
 */
import { vi } from 'vitest';

export interface LineFetchCall {
  url: string;
  method: string;
  body?: unknown;
}

export type ReplyMode = 'ok' | 'http-500' | 'network-error' | 'timeout';

export interface LineFetchOptions {
  reply?: ReplyMode;
}

export interface LineFetchStub {
  calls: LineFetchCall[];
  /** reply の呼び出し（URL に `/message/reply` を含むもの） */
  replies: () => LineFetchCall[];
  /** reply に送られたメッセージ（全呼び出しを平らにしたもの） */
  sentMessages: () => unknown[];
  /** reply 以外の通信（あってはならない） */
  unexpected: () => LineFetchCall[];
  /** これ以降の reply の動きを変える */
  setReplyMode: (mode: ReplyMode) => void;
}

export function stubLineFetchForSwap(options: LineFetchOptions = {}): LineFetchStub {
  let mode: ReplyMode = options.reply ?? 'ok';
  const calls: LineFetchCall[] = [];
  const stub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const rawBody = init?.body ? String(init.body) : undefined;
    let body: unknown = rawBody;
    if (rawBody !== undefined) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        body = rawBody;
      }
    }
    calls.push({ url, method, body });
    if (url.includes('/v2/bot/message/reply')) {
      if (mode === 'network-error') throw new TypeError('network down');
      if (mode === 'timeout') {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        });
      }
      return new Response('{}', { status: mode === 'http-500' ? 500 : 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', stub);
  const isReply = (call: LineFetchCall): boolean => call.url.includes('/v2/bot/message/reply');
  return {
    calls,
    replies: () => calls.filter(isReply),
    sentMessages: () =>
      calls
        .filter(isReply)
        .flatMap((call) => (call.body as { messages?: unknown[] } | undefined)?.messages ?? []),
    unexpected: () => calls.filter((call) => !isReply(call)),
    setReplyMode: (next) => {
      mode = next;
    },
  };
}
