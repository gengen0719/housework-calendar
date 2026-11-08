import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../src/entries/api';
import * as familyMemberService from '../../src/services/familyMemberService';
import {
  apiRequest,
  HANAKO_LINE_ID,
  LOGIN_CHANNEL_ID,
  setupWorld,
  stubLineFetch,
  VALID_ID_TOKEN,
} from './helpers/world';

const asResult = (r: unknown) => r as APIGatewayProxyStructuredResultV2;
const bodyOf = (r: APIGatewayProxyStructuredResultV2) =>
  JSON.parse(String(r.body)) as { error?: { reason: string; details?: unknown } };

let world: ReturnType<typeof setupWorld>;

function seedFriend(): void {
  world.users.set('user-hanako', {
    userId: 'user-hanako',
    lineUserId: HANAKO_LINE_ID,
    displayName: '花子',
    friendStatus: 'friend',
    registeredAt: '2026-11-01T00:00:00.000Z',
    friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
  });
}

const session = (body: unknown) => apiRequest('POST', '/v1/sessions', { body });

beforeEach(() => {
  world = setupWorld();
  process.env.ENTRY = 'api';
  stubLineFetch();
  seedFriend();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('画面用 API の受け口（振り分けと共通のエラー）', () => {
  it('CloudFront の秘密のヘッダーがなければ 403', async () => {
    const result = asResult(
      await handler(apiRequest('POST', '/v1/sessions', { body: {}, origin: null })),
    );
    expect(result.statusCode).toBe(403);
  });

  it('知らない道筋と、道筋はあっても違うメソッドは 404 NOT_FOUND', async () => {
    const unknown = asResult(await handler(apiRequest('GET', '/v1/unknown')));
    const wrongMethod = asResult(await handler(apiRequest('GET', '/v1/sessions')));
    expect(unknown.statusCode).toBe(404);
    expect(bodyOf(unknown).error?.reason).toBe('NOT_FOUND');
    expect(wrongMethod.statusCode).toBe(404);
  });

  it('本文が JSON でなければ 400', async () => {
    const event = apiRequest('POST', '/v1/sessions');
    event.body = '{not json';
    const result = asResult(await handler(event));
    expect(result.statusCode).toBe(400);
    expect(bodyOf(result).error?.details).toEqual({ field: 'body' });
  });

  it('Base64 で届いた本文も読める', async () => {
    const event = apiRequest('POST', '/v1/sessions');
    event.body = Buffer.from(JSON.stringify({ idToken: VALID_ID_TOKEN })).toString('base64');
    event.isBase64Encoded = true;
    expect(asResult(await handler(event)).statusCode).toBe(200);
  });

  it('idToken がない・空・文字列でない本文は 400（LINE には問い合わせない）', async () => {
    const line = stubLineFetch();
    for (const body of [{}, { idToken: '' }, { idToken: 42 }, undefined]) {
      expect(asResult(await handler(session(body))).statusCode).toBe(400);
    }
    expect(line.calls).toHaveLength(0);
  });

  it('LINE の verify が 200 でも、別のチャネルの aud なら 401', async () => {
    stubLineFetch({
      verify: () => ({
        status: 200,
        body: {
          sub: HANAKO_LINE_ID,
          aud: 'other-channel',
          exp: Math.floor(Date.now() / 1000) + 60,
        },
      }),
    });
    const result = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    expect(result.statusCode).toBe(401);
  });

  it('LINE の verify が 200 でも、期限が過ぎていれば 401', async () => {
    stubLineFetch({
      verify: (_t, clientId) => ({
        status: 200,
        body: { sub: HANAKO_LINE_ID, aud: clientId, exp: Math.floor(Date.now() / 1000) - 1 },
      }),
    });
    expect(asResult(await handler(session({ idToken: VALID_ID_TOKEN }))).statusCode).toBe(401);
  });

  it('LINE の verify が 200 でも、sub がなければ 401', async () => {
    stubLineFetch({
      verify: () => ({
        status: 200,
        body: { aud: LOGIN_CHANNEL_ID, exp: Math.floor(Date.now() / 1000) + 60 },
      }),
    });
    expect(asResult(await handler(session({ idToken: VALID_ID_TOKEN }))).statusCode).toBe(401);
  });

  it('LINE の verify が 5xx または通信の失敗なら 503（401 にはしない）', async () => {
    stubLineFetch({ verify: () => ({ status: 502 }) });
    const serverError = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    stubLineFetch({ verify: () => 'throw' });
    const networkError = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    expect(serverError.statusCode).toBe(503);
    expect(bodyOf(networkError).error?.reason).toBe('SERVICE_TEMPORARILY_UNAVAILABLE');
    expect(networkError.statusCode).toBe(503);
  });

  it('友だちの記録があれば、プロフィールは問い合わせずにセッションを出す', async () => {
    const line = stubLineFetch();
    const result = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    expect(result.statusCode).toBe(200);
    expect(line.calls.filter((c) => c.url.includes('/profile/'))).toHaveLength(0);
  });

  it('プロフィールの取得が通信の失敗でも 503', async () => {
    world.users.clear();
    stubLineFetch({ profile: 'throw' });
    const result = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    expect(result.statusCode).toBe(503);
  });

  it('思いがけない失敗は 500 INTERNAL にして、トークンをログに出さない', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
    vi.spyOn(familyMemberService, 'resolveSessionUser').mockRejectedValue(new Error('boom'));
    const result = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    expect(result.statusCode).toBe(500);
    expect(bodyOf(result).error?.reason).toBe('INTERNAL');
    expect(logs.some((l) => l.includes('REQUEST_ERROR'))).toBe(true);
    expect(logs.join('\n')).not.toContain(VALID_ID_TOKEN);
  });

  it('家族が記録と食い違っているときの GET /v1/me は 500', async () => {
    world.users.set('user-hanako', {
      ...(world.users.get('user-hanako') as object),
      familyId: 'fam-missing',
      role: 'child',
    });
    const created = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    const { sessionToken } = JSON.parse(String(created.body)) as { sessionToken: string };
    const me = asResult(await handler(apiRequest('GET', '/v1/me', { token: sessionToken })));
    expect(me.statusCode).toBe(500);
  });

  it('記録が消えた利用者のセッションの GET /v1/me は 401', async () => {
    const created = asResult(await handler(session({ idToken: VALID_ID_TOKEN })));
    const { sessionToken } = JSON.parse(String(created.body)) as { sessionToken: string };
    world.users.clear();
    const me = asResult(await handler(apiRequest('GET', '/v1/me', { token: sessionToken })));
    expect(me.statusCode).toBe(401);
  });
});
