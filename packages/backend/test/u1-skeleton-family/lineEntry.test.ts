import { GetParametersCommand } from '@aws-sdk/client-ssm';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../src/entries/line';
import { getConfig, loadConfig, resetConfigCache } from '../../src/lib/config';
import { describeError, getRequestId, log, setRequestId } from '../../src/lib/logger';
import { verifyOriginHeader } from '../../src/middleware/verifyOriginHeader';
import * as lineApiService from '../../src/services/lineApiService';
import {
  followEvent,
  HANAKO_LINE_ID,
  ORIGIN_SECRET,
  setupWorld,
  SSM_PREFIX,
  stubLineFetch,
  webhookRequest,
} from './helpers/world';
import { REDACTED_MARKER } from '../fixtures/fakeSecrets';

const asResult = (r: unknown) => r as APIGatewayProxyStructuredResultV2;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LINE 用の受け口（境目と失敗）', () => {
  let world: ReturnType<typeof setupWorld>;
  beforeEach(() => {
    world = setupWorld();
    stubLineFetch();
  });

  it('署名が正しくても本文が JSON でなければ 400', async () => {
    const event = webhookRequest({ events: [] });
    event.body = 'not json';
    // 本文を差し替えたので、その本文の署名を付け直す
    const { sign } = await import('./helpers/world');
    event.headers['x-line-signature'] = sign('not json');
    expect(asResult(await handler(event)).statusCode).toBe(400);
  });

  it('events が空の確認用の要求（LINE の接続確認）は 200', async () => {
    expect(asResult(await handler(webhookRequest({ events: [] }))).statusCode).toBe(200);
  });

  it('扱わない種類のイベントは記録せず 200', async () => {
    const result = asResult(
      await handler(webhookRequest({ events: [{ type: 'message', webhookEventId: 'e1' }] })),
    );
    expect(result.statusCode).toBe(200);
    expect(world.events.size).toBe(0);
  });

  it('イベント ID やユーザー ID がないイベントは何もせず 200', async () => {
    const noId = { type: 'follow', source: { userId: HANAKO_LINE_ID } };
    const noUser = { type: 'unfollow', webhookEventId: 'e2' };
    const noUserFollow = { type: 'follow', webhookEventId: 'e3', replyToken: 'r' };
    const result = asResult(
      await handler(webhookRequest({ events: [noId, noUser, noUserFollow] })),
    );
    expect(result.statusCode).toBe(200);
    expect(world.users.size).toBe(0);
  });

  it('返事の送信が失敗しても記録は残り、処理済みになって 200', async () => {
    stubLineFetch({ replyOk: false });
    const result = asResult(await handler(webhookRequest({ events: [followEvent()] })));
    expect(result.statusCode).toBe(200);
    expect(world.users.size).toBe(1);
    expect(world.events.get('evt-follow-1')?.status).toBe('done');
  });

  it('プロフィールが取れない（友だちでない）友だち登録は 500 にして再送に任せる', async () => {
    stubLineFetch({ profile: 'not-friend' });
    const result = asResult(await handler(webhookRequest({ events: [followEvent()] })));
    expect(result.statusCode).toBe(500);
    expect(world.events.size).toBe(0);
  });

  it('返事のトークンがないイベントは返事を送らない', async () => {
    const line = stubLineFetch();
    const event = { ...followEvent(), replyToken: undefined };
    expect(asResult(await handler(webhookRequest({ events: [event] }))).statusCode).toBe(200);
    expect(line.replies()).toHaveLength(0);
    expect(world.users.size).toBe(1);
  });

  it('設定が読めないときは 500（思いがけない失敗）', async () => {
    world.ssm.on(GetParametersCommand).rejects(new Error('AccessDenied'));
    expect(asResult(await handler(webhookRequest({ events: [] }))).statusCode).toBe(500);
  });

  it('リクエスト ID は Lambda のコンテキストのものを使う', async () => {
    await handler(webhookRequest({ events: [] }), { awsRequestId: 'ctx-req-9' });
    expect(getRequestId()).toBe('ctx-req-9');
  });
});

describe('verifyOriginHeader', () => {
  it('値が合えば通り、ない・違う・空は断る', () => {
    expect(verifyOriginHeader({ 'x-origin-verify': ORIGIN_SECRET }, ORIGIN_SECRET)).toBe(true);
    expect(verifyOriginHeader({}, ORIGIN_SECRET)).toBe(false);
    expect(verifyOriginHeader(undefined, ORIGIN_SECRET)).toBe(false);
    expect(verifyOriginHeader({ 'x-origin-verify': 'wrong' }, ORIGIN_SECRET)).toBe(false);
    expect(verifyOriginHeader({ 'x-origin-verify': ORIGIN_SECRET + 'x' }, ORIGIN_SECRET)).toBe(
      false,
    );
    expect(verifyOriginHeader({ 'x-origin-verify': '' }, '')).toBe(false);
  });
});

describe('config', () => {
  it('パラメータストアから 1 回だけ読み、以後は同じ値を返す', async () => {
    const world = setupWorld();
    const first = await getConfig();
    const second = await getConfig();
    expect(second).toBe(first);
    expect(first.channelSecret).toBe('test-channel-secret');
    expect(world.ssm.commandCalls(GetParametersCommand)).toHaveLength(1);
  });

  it('値がないパラメータがあれば、パスだけを伝えて失敗し、次は読み直す', async () => {
    const world = setupWorld();
    world.ssm
      .on(GetParametersCommand)
      .resolves({ Parameters: [], InvalidParameters: [`${SSM_PREFIX}/line/liff-url`] });
    await expect(getConfig()).rejects.toThrow(`${SSM_PREFIX}/line/liff-url`);
    setupWorld();
    await expect(getConfig()).resolves.toBeDefined();
  });

  it('値が空のパラメータは断る', async () => {
    const world = setupWorld();
    world.ssm
      .on(GetParametersCommand)
      .resolves({ Parameters: [{ Name: `${SSM_PREFIX}/line/liff-url`, Value: '' }] });
    await expect(loadConfig(undefined, SSM_PREFIX)).rejects.toThrow('空です');
    resetConfigCache();
  });

  it('LINE 用の受け口は、使う 4 つの値だけを読み、JWT の鍵は読まない', async () => {
    const world = setupWorld();
    process.env.ENTRY = 'line';
    const config = await getConfig();
    const names = world.ssm.commandCalls(GetParametersCommand)[0]?.args[0].input.Names ?? [];
    expect(names).toHaveLength(4);
    expect(names.some((n) => n.includes('/jwt/'))).toBe(false);
    expect(names.some((n) => n.endsWith('/line/login-channel-id'))).toBe(false);
    expect(config.channelSecret).toBe('test-channel-secret');
    expect(() => config.signingSecret).toThrow('読みません');
  });

  it('画面用の入口は 6 つの値すべてを読む', async () => {
    const world = setupWorld();
    process.env.ENTRY = 'api';
    const config = await getConfig();
    expect(world.ssm.commandCalls(GetParametersCommand)[0]?.args[0].input.Names).toHaveLength(6);
    expect(config.signingSecret).toBeTruthy();
  });

  it('知らない入口なら分かる言葉で失敗する', async () => {
    setupWorld();
    await expect(loadConfig(undefined, SSM_PREFIX, 'other')).rejects.toThrow('知らない入口');
  });

  it('SSM_PREFIX が未設定なら分かる言葉で失敗する', async () => {
    setupWorld();
    delete process.env.SSM_PREFIX;
    await expect(loadConfig()).rejects.toThrow('SSM_PREFIX');
  });
});

describe('logger', () => {
  it('秘密の情報・トークン・本文は値を伏せ、リクエスト ID を付ける', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    setRequestId('req-x');
    log('info', {
      event: 'T',
      channelSecret: 'abc',
      nested: { idToken: 'tok', ok: 1 },
      list: [{ body: 'raw' }],
    });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line.requestId).toBe('req-x');
    expect(line.channelSecret).toBe('[REDACTED]');
    expect(line.nested).toEqual({ idToken: REDACTED_MARKER, ok: 1 });
    expect(line.list).toEqual([{ body: '[REDACTED]' }]);
    expect(JSON.stringify(line)).not.toContain('abc');
  });

  it('エラーを説明できる（Error も、それ以外も）', () => {
    expect(describeError(new Error('boom')).error).toBe('boom');
    expect(describeError('plain')).toEqual({ error: 'plain' });
  });
});

describe('lineApiService', () => {
  beforeEach(() => {
    setupWorld();
  });

  it('プロフィールを取れれば表示名を返す', async () => {
    stubLineFetch({ displayName: '太郎' });
    expect(await lineApiService.getProfile('U_taro')).toEqual({
      ok: true,
      value: { displayName: '太郎' },
    });
  });

  it('404 は友だちではない', async () => {
    stubLineFetch({ profile: 'not-friend' });
    expect(await lineApiService.getProfile('U_taro')).toEqual({ ok: false, reason: 'NOT_FRIEND' });
  });

  it('5xx や通信の失敗は LineApiError（トークンを含めない）', async () => {
    stubLineFetch({ profile: 'fail' });
    await expect(lineApiService.getProfile('U_taro')).rejects.toBeInstanceOf(
      lineApiService.LineApiError,
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout test-access-token')));
    const failure = await lineApiService.getProfile('U_taro').catch((e: Error) => e);
    expect((failure as Error).message).not.toContain('test-access-token');
  });

  it('表示名のない応答は失敗として扱う', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(lineApiService.getProfile('U_taro')).rejects.toThrow('表示名');
  });

  it('返事は Bearer のトークンと 5 秒の時間切れ付きで送り、失敗は投げる', async () => {
    const line = stubLineFetch();
    await lineApiService.reply('rt', [{ type: 'text', text: 'hi' }]);
    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-access-token',
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(line.replies()[0]?.body).toEqual({
      replyToken: 'rt',
      messages: [{ type: 'text', text: 'hi' }],
    });
    stubLineFetch({ replyOk: false });
    await expect(lineApiService.reply('rt', [])).rejects.toBeInstanceOf(
      lineApiService.LineApiError,
    );
  });
});
