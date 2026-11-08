import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { MESSAGES } from '@housework/shared';
import { App } from '../../src/App';
import { FAKE_SESSION_TOKEN } from '../fixtures/fakeSecrets';

// LIFF は差し替える（本物の LINE にはつながない）
const liff = vi.hoisted(() => ({
  init: vi.fn(),
  isInClient: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  getIDToken: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

const feature = await loadFeature('packages/frontend/test/u1-skeleton-family/screens.feature');

interface FakeResponse {
  status: number;
  body?: unknown;
}
type Route = (call: RecordedCall) => FakeResponse | 'network';
interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

let routes: Record<string, Route>;
let calls: RecordedCall[];
let sessionCount: number;

const HANAKO = { userId: 'user-hanako', displayName: '花子' };
const SESSION = { sessionToken: FAKE_SESSION_TOKEN, expiresAt: '2026-11-01T01:00:00.000Z' };
const family = (name: string) => ({ familyId: 'fam-1', name, role: 'admin' as const });

function installFakeApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const call: RecordedCall = {
        method,
        path: input,
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const route = routes[`${method} ${input}`];
      if (!route) return new Response('{}', { status: 404 });
      const result = route(call);
      if (result === 'network') throw new TypeError('Failed to fetch');
      return new Response(result.body === undefined ? null : JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

function failure(status: number, reason: string): FakeResponse {
  return { status, body: { error: { reason } } };
}

function callsTo(method: string, path: string): RecordedCall[] {
  return calls.filter((c) => c.method === method && c.path === path);
}

function sessionOk(): void {
  routes['POST /v1/sessions'] = () => ({ status: 201, body: SESSION });
}

function openAs(me: unknown): void {
  sessionOk();
  routes['GET /v1/me'] = () => ({ status: 200, body: me });
  render(<App />);
}

async function loaded(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
}

function enterFamilyName(name: string): void {
  fireEvent.click(screen.getByTestId('create-family-button'));
  fireEvent.change(screen.getByTestId('family-name-input'), { target: { value: name } });
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    routes = {};
    calls = [];
    sessionCount = 0;
    liff.init.mockReset().mockResolvedValue(undefined);
    liff.isInClient.mockReset().mockReturnValue(true);
    liff.isLoggedIn.mockReset().mockReturnValue(true);
    liff.login.mockReset();
    liff.getIDToken.mockReset().mockReturnValue('id-token-hanako');
    installFakeApi();
  });
  AfterEachScenario(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  Scenario('友だちでないと友だち登録の案内だけが出る', ({ Given, When, Then, And }) => {
    Given('友だち追加していない人が画面を開く', () => {
      routes['POST /v1/sessions'] = () => failure(403, 'NOT_FRIEND');
      render(<App />);
    });
    When('画面の読み込みが終わる', loaded);
    Then('友だち追加の案内と友だち追加のボタンが出る', () => {
      expect(screen.getByTestId('register-page')).toHaveTextContent(MESSAGES.NOT_FRIEND);
      expect(screen.getByTestId('add-friend-button')).toHaveAttribute(
        'href',
        expect.stringContaining('line.me'),
      );
    });
    And('家族を作る入口やカレンダーの枠は出ない', () => {
      expect(screen.queryByTestId('create-family-button')).toBeNull();
      expect(screen.queryByTestId('calendar-frame-page')).toBeNull();
    });
  });

  Scenario('家族に入っていないと家族を作る入口と招待を待つ入口が出る', ({ Given, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが画面を開く', () =>
      openAs({ ...HANAKO, family: null }),
    );
    When('画面の読み込みが終わる', loaded);
    Then('「家族を作る」と「招待を待つ」のボタンが出る', () => {
      expect(screen.getByTestId('create-family-button')).toHaveTextContent('家族を作る');
      expect(screen.getByTestId('wait-invitation-button')).toHaveTextContent('招待を待つ');
    });
  });

  Scenario(
    '家族を作る名前を入れて保存すると今月のカレンダーの枠が出る',
    ({ Given, And, When, Then }) => {
      Given('家族に入っていない友だちの花子さんが画面を開く', () =>
        openAs({ ...HANAKO, family: null }),
      );
      And('画面の読み込みが終わっている', loaded);
      When('「家族を作る」を押して家族の名前「田中家」を入れて保存する', async () => {
        routes['POST /v1/families'] = () => ({ status: 201, body: family('田中家') });
        enterFamilyName('田中家');
        fireEvent.click(screen.getByTestId('save-family-button'));
      });
      Then('家族の名前「田中家」と今月のカレンダーの枠が出る', async () => {
        expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
        expect(screen.getByTestId('family-name')).toHaveTextContent('田中家');
        const now = new Date();
        expect(screen.getByTestId('calendar-month')).toHaveTextContent(
          `${now.getFullYear()}年${now.getMonth() + 1}月`,
        );
        expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
      });
      And('家族を作る要求には操作ごとの識別子が付いている', () => {
        const [post] = callsTo('POST', '/v1/families');
        expect(post?.headers.get('Idempotency-Key')).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(post?.body).toEqual({ name: '田中家' });
        expect(post?.headers.get('Authorization')).toBe('Bearer session-token-1');
      });
    },
  );

  Scenario('家族の名前が正しくないと入力を残したまま文言が出る', ({ Given, And, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが画面を開く', () =>
      openAs({ ...HANAKO, family: null }),
    );
    And('画面の読み込みが終わっている', loaded);
    When('「家族を作る」を押して家族の名前「 」を入れて保存すると名前が正しくないと返る', () => {
      routes['POST /v1/families'] = () => failure(422, 'INVALID_FAMILY_NAME');
      enterFamilyName(' ');
      fireEvent.click(screen.getByTestId('save-family-button'));
    });
    Then('「家族の名前を 1〜20 文字で入力してください」と出る', async () => {
      expect(await screen.findByTestId('family-name-error')).toHaveTextContent(
        '家族の名前を 1〜20 文字で入力してください',
      );
    });
    And('入力した名前はそのまま残っている', () => {
      expect(screen.getByTestId('family-name-input')).toHaveValue(' ');
    });
  });

  Scenario('すでに家族に入っていると文言が出る', ({ Given, And, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが画面を開く', () =>
      openAs({ ...HANAKO, family: null }),
    );
    And('画面の読み込みが終わっている', loaded);
    When(
      '「家族を作る」を押して家族の名前「山田家」を入れて保存するとすでに家族に入っていると返る',
      () => {
        routes['POST /v1/families'] = () => failure(409, 'ALREADY_IN_FAMILY');
        enterFamilyName('山田家');
        fireEvent.click(screen.getByTestId('save-family-button'));
      },
    );
    Then('「すでに家族に入っています」と出る', async () => {
      expect(await screen.findByTestId('family-name-error')).toHaveTextContent(
        'すでに家族に入っています',
      );
    });
  });

  Scenario('招待を待つを選ぶと招待のリンクを開くよう案内が出る', ({ Given, And, When, Then }) => {
    Given('家族に入っていない友だちの花子さんが画面を開く', () =>
      openAs({ ...HANAKO, family: null }),
    );
    And('画面の読み込みが終わっている', loaded);
    When('「招待を待つ」を押す', () => {
      fireEvent.click(screen.getByTestId('wait-invitation-button'));
    });
    Then('「お母さんから届いた招待のリンクを開いてください」と出る', () => {
      expect(screen.getByTestId('waiting-page')).toHaveTextContent(
        'お母さんから届いた招待のリンクを開いてください',
      );
    });
  });

  Scenario('家族のメンバーでないと使えない旨が出る', ({ Given, When, Then }) => {
    Given('家族のメンバーでない人の情報を求めると 403 NOT_FAMILY_MEMBER が返る', () => {
      sessionOk();
      routes['GET /v1/me'] = () => failure(403, 'NOT_FAMILY_MEMBER');
      render(<App />);
    });
    When('画面の読み込みが終わる', loaded);
    Then('「このアプリは家族のメンバーだけが使えます」と出る', () => {
      expect(screen.getByTestId('not-member-page')).toHaveTextContent(
        'このアプリは家族のメンバーだけが使えます',
      );
    });
  });

  Scenario(
    '503 や通信の失敗では読み込み直すボタンが出て押すと再び読み込む',
    ({ Given, When, Then, And }) => {
      Given('セッションを出す要求が 503 で失敗する', () => {
        routes['POST /v1/sessions'] = () => failure(503, 'SERVICE_TEMPORARILY_UNAVAILABLE');
        render(<App />);
      });
      When('画面の読み込みが終わる', loaded);
      Then(
        '「表示できませんでした。もう一度お試しください」と「読み込み直す」のボタンが出る',
        () => {
          expect(screen.getByTestId('error-retry')).toHaveTextContent(
            '表示できませんでした。もう一度お試しください',
          );
          expect(screen.getByTestId('retry-button')).toHaveTextContent('読み込み直す');
        },
      );
      And('通信が戻ったあとで「読み込み直す」を押すと家族のカレンダーの枠が出る', async () => {
        sessionOk();
        routes['GET /v1/me'] = () => ({
          status: 200,
          body: { ...HANAKO, family: family('田中家') },
        });
        fireEvent.click(screen.getByTestId('retry-button'));
        expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
        expect(screen.getByTestId('family-name')).toHaveTextContent('田中家');
      });
    },
  );

  Scenario(
    'セッショントークンはメモリにだけ持ちブラウザの保存場所に書かない',
    ({ Given, When, Then, And }) => {
      Given('家族に入っている友だちの花子さんが画面を開く', () => {
        vi.spyOn(Storage.prototype, 'setItem');
        openAs({ ...HANAKO, family: family('田中家') });
      });
      When('画面の読み込みが終わる', loaded);
      Then('自分の情報を求める要求にセッショントークンが付いている', () => {
        const [me] = callsTo('GET', '/v1/me');
        expect(me?.headers.get('Authorization')).toBe('Bearer session-token-1');
      });
      And('localStorage と sessionStorage と cookie には何も書かれていない', () => {
        expect(Storage.prototype.setItem).not.toHaveBeenCalled();
        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
        expect(document.cookie).toBe('');
      });
    },
  );

  Scenario(
    'セッションの期限が切れて 401 になるとトークンを取り直してもう一度求める',
    ({ Given, When, Then }) => {
      Given('最初のセッショントークンが 401 になる花子さんが画面を開く', () => {
        routes['POST /v1/sessions'] = () => {
          sessionCount += 1;
          return {
            status: 201,
            body: { ...SESSION, sessionToken: `session-token-${sessionCount}` },
          };
        };
        routes['GET /v1/me'] = (call) =>
          call.headers.get('Authorization') === 'Bearer session-token-1'
            ? failure(401, 'UNAUTHENTICATED')
            : { status: 200, body: { ...HANAKO, family: family('田中家') } };
        render(<App />);
      });
      When('画面の読み込みが終わる', loaded);
      Then('セッションを取り直して新しいトークンで家族のカレンダーの枠が出る', () => {
        expect(callsTo('POST', '/v1/sessions')).toHaveLength(2);
        const meCalls = callsTo('GET', '/v1/me');
        expect(meCalls).toHaveLength(2);
        expect(meCalls[1]?.headers.get('Authorization')).toBe('Bearer session-token-2');
        expect(screen.getByTestId('calendar-frame-page')).toBeInTheDocument();
      });
    },
  );
});
