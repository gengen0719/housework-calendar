import { createHmac } from 'node:crypto';
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { vi } from 'vitest';
import { resetConfigCache } from '../../../src/lib/config';
import { setRequestId } from '../../../src/lib/logger';
import {
  EVENTS_TABLE,
  FAMILIES_TABLE,
  installFakeDynamo,
  REQUEST_RECORDS_TABLE,
  USERS_TABLE,
} from './fakeDynamo';

export const SSM_PREFIX = '/housework-calendar/test';
export const CHANNEL_SECRET = 'test-channel-secret';
export const ORIGIN_SECRET = 'test-origin-secret';
export const LIFF_URL = 'https://liff.line.me/test-liff-id';
export const LOGIN_CHANNEL_ID = '1234567890';
export const SIGNING_SECRET = 'test-signing-secret-0123456789abcdef'; // gitleaks:allow テスト用の作り物の鍵

const PARAMETERS: Record<string, string> = {
  'line/channel-secret': CHANNEL_SECRET,
  'line/channel-access-token': 'test-access-token',
  'line/login-channel-id': LOGIN_CHANNEL_ID,
  'line/liff-url': LIFF_URL,
  'jwt/signing-secret': SIGNING_SECRET,
  'cloudfront/origin-verify-secret': ORIGIN_SECRET,
};

export interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
}

export const VALID_ID_TOKEN = 'valid-id-token';

/** LINE の verify の差し替え。status が 200 のとき body が応答の中身になる。'throw' は通信の失敗。 */
export type VerifyResult = { status: number; body?: unknown } | 'throw';
export type VerifyStub = (idToken: string, clientId: string) => VerifyResult;

/** 正しい ID トークンだけを通す既定の verify。 */
export const defaultVerify: VerifyStub = (idToken, clientId) =>
  idToken === VALID_ID_TOKEN
    ? {
        status: 200,
        body: {
          iss: 'https://access.line.me',
          sub: HANAKO_LINE_ID,
          aud: clientId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      }
    : { status: 400, body: { error: 'invalid_request' } };

export interface LineStubOptions {
  profile?: 'ok' | 'not-friend' | 'fail' | 'throw';
  displayName?: string;
  replyOk?: boolean;
  verify?: VerifyStub;
}

/** LINE の API（プロフィールと返事）を fetch の差し替えで作る。本物にはつながない。 */
export function stubLineFetch(options: LineStubOptions = {}) {
  const calls: FetchCall[] = [];
  const stub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const rawBody = init?.body ? String(init.body) : undefined;
    const isVerify = url.includes('/oauth2/v2.1/verify');
    calls.push({
      url,
      method,
      body: rawBody === undefined ? undefined : isVerify ? rawBody : JSON.parse(rawBody),
    });
    if (isVerify) {
      const form = new URLSearchParams(rawBody);
      const result = (options.verify ?? defaultVerify)(
        form.get('id_token') ?? '',
        form.get('client_id') ?? '',
      );
      if (result === 'throw') throw new TypeError('network down');
      return new Response(JSON.stringify(result.body ?? {}), { status: result.status });
    }
    if (url.includes('/v2/bot/profile/')) {
      const mode = options.profile ?? 'ok';
      if (mode === 'throw') throw new TypeError('network down');
      if (mode === 'fail') return new Response('error', { status: 500 });
      if (mode === 'not-friend') return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ displayName: options.displayName ?? '花子' }), {
        status: 200,
      });
    }
    if (url.includes('/v2/bot/message/reply')) {
      return new Response('{}', { status: options.replyOk === false ? 500 : 200 });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', stub);
  return { calls, replies: () => calls.filter((c) => c.url.includes('/message/reply')) };
}

export function setupWorld() {
  process.env.ENV = 'test';
  process.env.ENTRY = 'line';
  process.env.SSM_PREFIX = SSM_PREFIX;
  process.env.USERS_TABLE = USERS_TABLE;
  process.env.PROCESSED_LINE_EVENTS_TABLE = EVENTS_TABLE;
  process.env.FAMILIES_TABLE = FAMILIES_TABLE;
  process.env.REQUEST_RECORDS_TABLE = REQUEST_RECORDS_TABLE;
  resetConfigCache();
  setRequestId(undefined);
  const dynamo = installFakeDynamo();
  const ssm = mockClient(SSMClient);
  ssm.on(GetParametersCommand).callsFake((input: { Names: string[] }) => ({
    Parameters: input.Names.map((name) => ({
      Name: name,
      Value: PARAMETERS[name.slice(SSM_PREFIX.length + 1)],
    })),
  }));
  return { ...dynamo, ssm };
}

export function sign(body: string | Buffer, secret = CHANNEL_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

export interface RequestOptions {
  signature?: string;
  base64?: boolean;
  origin?: string | null;
}

export function webhookRequest(
  payload: unknown,
  options: RequestOptions = {},
): APIGatewayProxyEventV2 {
  const raw = JSON.stringify(payload);
  const signature = options.signature ?? sign(raw);
  const headers: Record<string, string> = { 'x-line-signature': signature };
  if (options.origin !== null) headers['x-origin-verify'] = options.origin ?? ORIGIN_SECRET;
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/line/webhook',
    rawQueryString: '',
    headers,
    requestContext: {
      requestId: 'req-1',
      http: {
        method: 'POST',
        path: '/line/webhook',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
    },
    body: options.base64 ? Buffer.from(raw, 'utf8').toString('base64') : raw,
    isBase64Encoded: options.base64 ?? false,
  } as unknown as APIGatewayProxyEventV2;
}

export interface ApiRequestOptions {
  body?: unknown;
  token?: string;
  origin?: string | null;
  headers?: Record<string, string>;
}

/** 画面用 API の入口（関数 URL）に届く要求を作る。ヘッダー名は小文字で届く。 */
export function apiRequest(
  method: string,
  path: string,
  options: ApiRequestOptions = {},
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { ...options.headers };
  if (options.origin !== null) headers['x-origin-verify'] = options.origin ?? ORIGIN_SECRET;
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const hasBody = options.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers,
    requestContext: {
      requestId: 'req-api-1',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

export const HANAKO_LINE_ID = 'U_hanako';

export function followEvent(webhookEventId = 'evt-follow-1', lineUserId = HANAKO_LINE_ID) {
  return {
    type: 'follow',
    webhookEventId,
    replyToken: `reply-${webhookEventId}`,
    source: { type: 'user', userId: lineUserId },
    timestamp: 1_700_000_000_000,
    mode: 'active',
  };
}

export function unfollowEvent(webhookEventId = 'evt-unfollow-1', lineUserId = HANAKO_LINE_ID) {
  return {
    type: 'unfollow',
    webhookEventId,
    source: { type: 'user', userId: lineUserId },
    timestamp: 1_700_000_000_000,
    mode: 'active',
  };
}
