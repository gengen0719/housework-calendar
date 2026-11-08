import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { expect, vi } from 'vitest';
import { handler, routes, type Route } from '../../src/entries/api';
import {
  apiRequest,
  HANAKO_LINE_ID,
  setupWorld,
  stubLineFetch,
  VALID_ID_TOKEN,
} from '../u1-skeleton-family/helpers/world';

const feature = await loadFeature('packages/backend/test/u2-invitation/routing-logs.feature');

/** テストの中で作る決まった 22 文字の印（本物ではない） */
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const INVITATION_ROUTE = 'GET /v1/invitations/:token';
const KEY_1 = '00000000-0000-4000-8000-000000000001'; // gitleaks:allow テスト用の作り物の Idempotency-Key
/** 本物の窓口。場面の中で差し替えたあと、場面ごとに戻す */
const REAL_INVITATION_ROUTE = routes[INVITATION_ROUTE];

let world: ReturnType<typeof setupWorld>;
let logs: string[];
let response: APIGatewayProxyStructuredResultV2;
let receivedToken: string | undefined;
let u1Responses: APIGatewayProxyStructuredResultV2[];

interface LogLine {
  event?: string;
  path?: string;
}

function logLines(): LogLine[] {
  return logs.map((line) => JSON.parse(line) as LogLine);
}

function bodyOf(): { error?: { reason: string } } {
  return JSON.parse(String(response.body)) as { error?: { reason: string } };
}

function installRoute(route: Route): void {
  routes[INVITATION_ROUTE] = route;
}

function send(token = TOKEN, options: { origin?: string | null } = {}) {
  return handler(apiRequest('GET', `/v1/invitations/${token}`, options)).then((r) => {
    response = r as APIGatewayProxyStructuredResultV2;
  });
}

function expectNoFullToken(): void {
  expect(logs.length).toBeGreaterThan(0);
  expect(logs.join('\n')).not.toContain(TOKEN);
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  AfterEachScenario(() => {
    if (REAL_INVITATION_ROUTE) routes[INVITATION_ROUTE] = REAL_INVITATION_ROUTE;
    else delete routes[INVITATION_ROUTE];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    stubLineFetch();
    logs = [];
    receivedToken = undefined;
    u1Responses = [];
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(String(line)));
  });

  const givenRoute = (Given: (text: string, fn: () => void) => void) =>
    Given('招待の印が入ったパスを受ける窓口がある', () =>
      installRoute(async ({ params }) => {
        receivedToken = params.token;
        return { status: 200, body: { ok: true } };
      }),
    );

  Scenario('招待のパスはパスの型に振り分けられる', ({ Given, When, Then, And }) => {
    givenRoute(Given);
    When('画面が /v1/invitations/ に招待の印を付けた要求を送る', () => send());
    Then('窓口は印を受け取って応答する', () => {
      expect(response.statusCode).toBe(200);
      expect(receivedToken).toBe(TOKEN);
    });
    And('要求のログの path はパスの型 /v1/invitations/:token である', () => {
      const start = logLines().find((l) => l.event === 'REQUEST_START');
      expect(start?.path).toBe('/v1/invitations/:token');
    });
  });

  Scenario('要求のログに招待の印の全体が出ない', ({ Given, When, Then, And }) => {
    givenRoute(Given);
    When('画面が /v1/invitations/ に招待の印を付けた要求を送る', () => send());
    Then('要求のログは開始と終了の行がある', () => {
      const events = logLines().map((l) => l.event);
      expect(events).toContain('REQUEST_START');
      expect(events).toContain('REQUEST_END');
      expect(logLines().find((l) => l.event === 'REQUEST_END')?.path).toBe(
        '/v1/invitations/:token',
      );
    });
    And('どのログの行にも招待の印の全体が含まれない', expectNoFullToken);
  });

  Scenario('断った要求のログにも招待の印が出ない', ({ Given, When, Then, And }) => {
    givenRoute(Given);
    When('画面が秘密のヘッダーなしで招待の印を付けた要求を送る', () =>
      send(TOKEN, { origin: null }),
    );
    Then('応答は 403 になる', () => expect(response.statusCode).toBe(403));
    And('断ったログの path はパスの型である', () => {
      const rejected = logLines().find((l) => l.event === 'REQUEST_REJECTED');
      expect(rejected?.path).toBe('/v1/invitations/:token');
      expect(receivedToken).toBeUndefined();
    });
    And('どのログの行にも招待の印の全体が含まれない', expectNoFullToken);
  });

  Scenario('型に合わないパスは 404 で、ログの path は unmatched', ({ When, Then, And }) => {
    When('画面が型に合わない招待の印入りのパスを送る', async () => {
      response = (await handler(
        apiRequest('GET', `/v1/invitations/${TOKEN}/unknown`),
      )) as APIGatewayProxyStructuredResultV2;
    });
    Then('応答は 404 で理由は NOT_FOUND になる', () => {
      expect(response.statusCode).toBe(404);
      expect(bodyOf().error?.reason).toBe('NOT_FOUND');
    });
    And('ログの path は unmatched である', () => {
      const paths = logLines().map((l) => l.path);
      expect(paths).toContain('unmatched');
      expect(logLines().find((l) => l.event === 'REQUEST_START')?.path).toBe('unmatched');
    });
    And('どのログの行にも招待の印の全体が含まれない', expectNoFullToken);
  });

  Scenario(
    '思いがけない失敗が起きても REQUEST_ERROR に招待の印が出ない',
    ({ Given, When, Then, And }) => {
      Given('招待の印が入ったパスを受けるが失敗する窓口がある', () =>
        installRoute(async () => {
          throw new Error('boom');
        }),
      );
      When('画面が /v1/invitations/ に招待の印を付けた要求を送る', () => send());
      Then('応答は 500 で理由は INTERNAL になる', () => {
        expect(response.statusCode).toBe(500);
        expect(bodyOf().error?.reason).toBe('INTERNAL');
      });
      And('REQUEST_ERROR のログがある', () => {
        const error = logLines().find((l) => l.event === 'REQUEST_ERROR');
        expect(error?.path).toBe('/v1/invitations/:token');
      });
      And('どのログの行にも招待の印の全体が含まれない', expectNoFullToken);
    },
  );

  Scenario('U1 の操作は前と同じに振り分けられる', ({ Given, When, Then, And }) => {
    Given('家族に入っていない友だちの花子さんが記録されている', () => {
      world.users.set('user-hanako', {
        userId: 'user-hanako',
        lineUserId: HANAKO_LINE_ID,
        displayName: '花子',
        friendStatus: 'friend',
        registeredAt: '2026-11-01T00:00:00.000Z',
        friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
      });
    });
    When('画面が U1 の操作を順に送る', async () => {
      const session = (await handler(
        apiRequest('POST', '/v1/sessions', { body: { idToken: VALID_ID_TOKEN } }),
      )) as APIGatewayProxyStructuredResultV2;
      const { sessionToken } = JSON.parse(String(session.body)) as { sessionToken: string };
      const me = (await handler(
        apiRequest('GET', '/v1/me', { token: sessionToken }),
      )) as APIGatewayProxyStructuredResultV2;
      const family = (await handler(
        apiRequest('POST', '/v1/families', {
          token: sessionToken,
          body: { name: '田中家' },
          headers: { 'idempotency-key': KEY_1 },
        }),
      )) as APIGatewayProxyStructuredResultV2;
      u1Responses = [session, me, family];
    });
    Then('セッションは 200、自分の情報は 200、家族を作るは 201 になる', () => {
      expect(u1Responses.map((r) => r.statusCode)).toEqual([200, 200, 201]);
    });
    And('ログの path はそれぞれ U1 のパスのままである', () => {
      const starts = logLines()
        .filter((l) => l.event === 'REQUEST_START')
        .map((l) => l.path);
      expect(starts).toEqual(['/v1/sessions', '/v1/me', '/v1/families']);
    });
  });
});
