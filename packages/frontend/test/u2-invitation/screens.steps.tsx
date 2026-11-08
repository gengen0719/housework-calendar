import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { INVITATION_NOT_FRIEND_HINT, INVITATION_SHARE_TEXT, MESSAGES } from '@housework/shared';
import { App } from '../../src/App';
// LIFF は差し替える（本物の LINE にはつながない）
const liff = vi.hoisted(() => ({
  init: vi.fn(),
  isInClient: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  getIDToken: vi.fn(),
  isApiAvailable: vi.fn(),
  shareTargetPicker: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));
const feature = await loadFeature('packages/frontend/test/u2-invitation/screens.feature');
interface FakeResponse {
  status: number;
  body?: unknown;
}
interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}
type Route = (call: RecordedCall) => FakeResponse | 'network';
let routes: Record<string, Route>;
let calls: RecordedCall[];
const TOKEN = 'abcdefghijklmnopqrstuv';
const INVITE_URL = `https://example.test/?invitation=${TOKEN}`;
const NEW_URL = 'https://example.test/?invitation=NEWNEWNEWNEWNEWNEWNEWN';
const EXPIRES_AT = '2026-11-02T01:30:00.000Z';
const EXPIRES_TEXT = '2026年11月2日 10:30';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SESSION = { sessionToken: 'session-token-1', expiresAt: '2026-11-01T01:00:00.000Z' };
const adminFamily = { familyId: 'fam-1', name: '田中家', role: 'admin' as const };
const childFamily = { ...adminFamily, role: 'child' as const };
const HANAKO = { userId: 'user-hanako', displayName: '花子' };
const TARO = { userId: 'user-taro', displayName: '太郎' };
// vitest は一つ一つの手順を別のテストとして動かし、手順のあいだでスパイの記録が消えるため、
// 差し替えた関数は自前の配列に呼び出しを残す
const restorers: Array<() => void> = [];
function record(target: object, key: string, impl?: (...args: unknown[]) => unknown): unknown[][] {
  const holder = target as Record<string, unknown>;
  const original = holder[key];
  const received: unknown[][] = [];
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: (...args: unknown[]) => {
      received.push(args);
      return impl ? impl(...args) : (original as (...a: unknown[]) => unknown).apply(target, args);
    },
  });
  restorers.push(() =>
    Object.defineProperty(target, key, { configurable: true, writable: true, value: original }),
  );
  return received;
}
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
function openAs(me: unknown): void {
  routes['POST /v1/sessions'] = () => ({ status: 201, body: SESSION });
  routes['GET /v1/me'] = () => ({ status: 200, body: me });
  render(<App />);
}
function openAsAdmin(invitation: { url: string; expiresAt: string } | null): void {
  routes['GET /v1/family/members'] = () => ({
    status: 200,
    body: [
      { ...HANAKO, role: 'admin' },
      { ...TARO, role: 'child' },
    ],
  });
  routes['GET /v1/family/invitation'] = () => ({ status: 200, body: invitation });
  openAs({ ...HANAKO, family: adminFamily });
}
function openInvitationLink(me: unknown): void {
  window.history.replaceState(null, '', `/?invitation=${TOKEN}`);
  openAs(me);
}
async function loaded(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
}
async function goToSettings(): Promise<void> {
  await loaded();
  fireEvent.click(screen.getByTestId('open-settings-button'));
}
describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    routes = {};
    calls = [];
    liff.init.mockReset().mockResolvedValue(undefined);
    liff.isInClient.mockReset().mockReturnValue(true);
    liff.isLoggedIn.mockReset().mockReturnValue(true);
    liff.login.mockReset();
    liff.getIDToken.mockReset().mockReturnValue('id-token');
    liff.isApiAvailable.mockReset().mockReturnValue(true);
    liff.shareTargetPicker.mockReset().mockResolvedValue(undefined);
    installFakeApi();
  });
  AfterEachScenario(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    while (restorers.length > 0) restorers.pop()?.();
    window.history.replaceState(null, '', '/');
  });
  Scenario('家族の設定にメンバーの一覧が役割の文字つきで出る', ({ Given, When, Then }) => {
    Given('管理者の花子さんと子供の太郎さんがいる家族で花子さんが画面を開く', () =>
      openAsAdmin(null),
    );
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('メンバーの一覧に「花子」と「管理者」、「太郎」と「子供」が出る', async () => {
      const rows = await screen.findAllByTestId('member-row');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent('花子');
      expect(within(rows[0] as HTMLElement).getByTestId('member-role')).toHaveTextContent('管理者');
      expect(rows[1]).toHaveTextContent('太郎');
      expect(within(rows[1] as HTMLElement).getByTestId('member-role')).toHaveTextContent('子供');
      expect(callsTo('GET', '/v1/family/members')[0]?.headers.get('Authorization')).toBe(
        'Bearer session-token-1',
      );
    });
  });
  Scenario(
    '招待がなければ管理者に招待用のリンクを作るボタンが出て作るとリンクと期限が出る',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが招待がない状態で画面を開く', () => openAsAdmin(null));
      When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
      Then('「招待用のリンクを作る」のボタンが出てリンクや「LINE で送る」は出ない', async () => {
        expect(await screen.findByTestId('create-invitation-button')).toHaveTextContent(
          '招待用のリンクを作る',
        );
        expect(screen.queryByTestId('invitation-url')).toBeNull();
        expect(screen.queryByTestId('share-button')).toBeNull();
      });
      And(
        '「招待用のリンクを作る」を押すと操作ごとの識別子つきで要求が送られリンクと日本時間の期限が出る',
        async () => {
          routes['POST /v1/family/invitations'] = () => ({
            status: 201,
            body: { url: INVITE_URL, expiresAt: EXPIRES_AT },
          });
          fireEvent.click(await screen.findByTestId('create-invitation-button'));
          expect(await screen.findByTestId('invitation-url')).toHaveTextContent(INVITE_URL);
          expect(screen.getByTestId('invitation-expiry')).toHaveTextContent(
            `${EXPIRES_TEXT}まで使えます`,
          );
          const [post] = callsTo('POST', '/v1/family/invitations');
          expect(post?.headers.get('Idempotency-Key')).toMatch(UUID);
          expect(post?.headers.get('Authorization')).toBe('Bearer session-token-1');
        },
      );
    },
  );
  Scenario('招待があれば管理者にリンクと期限と三つのボタンが出る', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんが使える招待がある状態で画面を開く', () =>
      openAsAdmin({ url: INVITE_URL, expiresAt: EXPIRES_AT }),
    );
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('リンクと「2026年11月2日 10:30まで使えます」が出る', async () => {
      expect(await screen.findByTestId('invitation-url')).toHaveTextContent(INVITE_URL);
      expect(screen.getByTestId('invitation-expiry')).toHaveTextContent(
        '2026年11月2日 10:30まで使えます',
      );
    });
    And('「LINE で送る」と「リンクをコピー」と「招待用のリンクを作り直す」のボタンが出る', () => {
      expect(screen.getByTestId('share-button')).toHaveTextContent('LINE で送る');
      expect(screen.getByTestId('copy-button')).toHaveTextContent('リンクをコピー');
      expect(screen.getByTestId('regenerate-button')).toHaveTextContent('招待用のリンクを作り直す');
      expect(screen.queryByTestId('create-invitation-button')).toBeNull();
    });
  });
  Scenario('作り直すときは確かめてから作り直す', ({ Given, And, When, Then }) => {
    Given('管理者の花子さんが使える招待がある状態で画面を開く', () =>
      openAsAdmin({ url: INVITE_URL, expiresAt: EXPIRES_AT }),
    );
    And('カレンダーの枠の画面から「家族の設定」に進んでいる', goToSettings);
    When('「招待用のリンクを作り直す」を押す', async () => {
      fireEvent.click(await screen.findByTestId('regenerate-button'));
    });
    Then('「前のリンクは使えなくなります。作り直しますか？」と出てまだ要求は送られていない', () => {
      expect(screen.getByTestId('regenerate-confirm')).toHaveTextContent(
        '前のリンクは使えなくなります。作り直しますか？',
      );
      expect(callsTo('POST', '/v1/family/invitations')).toHaveLength(0);
    });
    And('「作り直す」を押すと新しいリンクと期限が出る', async () => {
      routes['POST /v1/family/invitations'] = () => ({
        status: 201,
        body: { url: NEW_URL, expiresAt: '2026-11-03T14:05:00.000Z' },
      });
      fireEvent.click(screen.getByTestId('regenerate-confirm-button'));
      await waitFor(() => expect(screen.getByTestId('invitation-url')).toHaveTextContent(NEW_URL));
      expect(screen.getByTestId('invitation-expiry')).toHaveTextContent(
        '2026年11月3日 23:05まで使えます',
      );
      expect(screen.queryByTestId('regenerate-confirm')).toBeNull();
    });
  });
  Scenario('LINE で送るは送り先を選ぶ画面が使えればそれを開く', ({ Given, And, When, Then }) => {
    let opened: unknown[][] = [];
    const asked: unknown[] = [];
    const picked: unknown[] = [];
    Given('管理者の花子さんが使える招待がある状態で画面を開く', () =>
      openAsAdmin({ url: INVITE_URL, expiresAt: EXPIRES_AT }),
    );
    And('カレンダーの枠の画面から「家族の設定」に進んでいる', goToSettings);
    When('送り先を選ぶ画面が使える LINE で「LINE で送る」を押す', async () => {
      liff.isApiAvailable.mockImplementation((name: string) => {
        asked.push(name);
        return true;
      });
      liff.shareTargetPicker.mockImplementation(async (messages: unknown) => {
        picked.push(messages);
      });
      opened = record(window, 'open', () => null);
      fireEvent.click(await screen.findByTestId('share-button'));
      await waitFor(() => expect(picked).toHaveLength(1));
    });
    Then('家族の名前と期限とリンクを入れた文が送り先を選ぶ画面に渡される', () => {
      expect(asked).toEqual(['shareTargetPicker']);
      expect(picked[0]).toEqual([
        {
          type: 'text',
          text: INVITATION_SHARE_TEXT({
            familyName: '田中家',
            expiresAtText: EXPIRES_TEXT,
            url: INVITE_URL,
          }),
        },
      ]);
      expect(opened).toHaveLength(0);
    });
  });
  Scenario(
    'LINE で送るは送り先を選ぶ画面が使えなければシェアの URL を開く',
    ({ Given, And, When, Then }) => {
      let opened: unknown[][] = [];
      Given('管理者の花子さんが使える招待がある状態で画面を開く', () =>
        openAsAdmin({ url: INVITE_URL, expiresAt: EXPIRES_AT }),
      );
      And('カレンダーの枠の画面から「家族の設定」に進んでいる', goToSettings);
      When('送り先を選ぶ画面が使えない状態で「LINE で送る」を押す', async () => {
        liff.isApiAvailable.mockReturnValue(false);
        opened = record(window, 'open', () => null);
        fireEvent.click(await screen.findByTestId('share-button'));
        await waitFor(() => expect(opened).toHaveLength(1));
      });
      Then('文を入れたシェアの URL が開かれる', () => {
        const text = INVITATION_SHARE_TEXT({
          familyName: '田中家',
          expiresAtText: EXPIRES_TEXT,
          url: INVITE_URL,
        });
        expect(opened[0]).toEqual([
          `https://line.me/R/share?text=${encodeURIComponent(text)}`,
          '_blank',
          'noopener,noreferrer',
        ]);
        expect(liff.shareTargetPicker).not.toHaveBeenCalled();
      });
    },
  );
  Scenario('リンクをコピーするとコピーしたと出る', ({ Given, And, When, Then }) => {
    const written: string[] = [];
    Given('管理者の花子さんが使える招待がある状態で画面を開く', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (text: string) => {
            written.push(text);
          },
        },
        configurable: true,
      });
      openAsAdmin({ url: INVITE_URL, expiresAt: EXPIRES_AT });
    });
    And('カレンダーの枠の画面から「家族の設定」に進んでいる', goToSettings);
    When('「リンクをコピー」を押す', async () => {
      fireEvent.click(await screen.findByTestId('copy-button'));
    });
    Then('リンクがコピーされて「コピーしました」と出る', async () => {
      expect(await screen.findByTestId('copied-message')).toHaveTextContent('コピーしました');
      expect(written).toEqual([INVITE_URL]);
    });
  });
  Scenario('子供の家族の設定には招待のボタンが出ない', ({ Given, When, Then, And }) => {
    Given('子供の太郎さんが画面を開く', () => {
      routes['GET /v1/family/members'] = () => ({
        status: 200,
        body: [
          { ...HANAKO, role: 'admin' },
          { ...TARO, role: 'child' },
        ],
      });
      openAs({ ...TARO, family: childFamily });
    });
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('メンバーの一覧だけが出て招待のボタンは出ない', async () => {
      expect(await screen.findAllByTestId('member-row')).toHaveLength(2);
      for (const id of [
        'create-invitation-button',
        'regenerate-button',
        'share-button',
        'copy-button',
        'invitation-url',
      ]) {
        expect(screen.queryByTestId(id)).toBeNull();
      }
    });
    And('招待を求める要求は送られていない', () => {
      expect(callsTo('GET', '/v1/family/invitation')).toHaveLength(0);
      expect(callsTo('POST', '/v1/family/invitations')).toHaveLength(0);
    });
  });
  Scenario(
    '招待のリンクを開くと家族の名前で確かめてから参加するとカレンダーの枠に進む',
    ({ Given, When, Then, And }) => {
      Given('家族に入っていない太郎さんが招待のリンクを開く', () => {
        routes[`GET /v1/invitations/${TOKEN}`] = () => ({
          status: 200,
          body: { familyName: '田中家', expiresAt: EXPIRES_AT },
        });
        openInvitationLink({ ...TARO, family: null });
      });
      When('画面の読み込みが終わる', loaded);
      Then('「田中家に参加しますか？」と「参加する」が出てまだ参加していない', async () => {
        expect(await screen.findByTestId('invitation-prompt')).toHaveTextContent(
          '田中家に参加しますか？',
        );
        expect(screen.getByTestId('join-button')).toHaveTextContent('参加する');
        expect(callsTo('POST', `/v1/invitations/${TOKEN}/accept`)).toHaveLength(0);
      });
      And(
        '「参加する」を押すと操作ごとの識別子つきで参加の要求が送られ田中家のカレンダーの枠が出る',
        async () => {
          routes[`POST /v1/invitations/${TOKEN}/accept`] = () => ({
            status: 200,
            body: childFamily,
          });
          fireEvent.click(screen.getByTestId('join-button'));
          expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
          expect(screen.getByTestId('family-name')).toHaveTextContent('田中家');
          const [post] = callsTo('POST', `/v1/invitations/${TOKEN}/accept`);
          expect(post?.headers.get('Idempotency-Key')).toMatch(UUID);
        },
      );
    },
  );
  Scenario(
    '招待の印を読んだあとは URL から印が消えていてブラウザの保存場所にも書かれない',
    ({ Given, When, Then, And }) => {
      let stored: unknown[][] = [];
      let replaced: unknown[][] = [];
      Given('家族に入っていない太郎さんが招待のリンクを開く', () => {
        stored = record(Storage.prototype, 'setItem', () => undefined);
        replaced = record(window.history, 'replaceState');
        routes[`GET /v1/invitations/${TOKEN}`] = () => ({
          status: 200,
          body: { familyName: '田中家', expiresAt: EXPIRES_AT },
        });
        openInvitationLink({ ...TARO, family: null });
      });
      When('画面の読み込みが終わる', async () => {
        await loaded();
        await screen.findByTestId('invitation-prompt');
      });
      Then('招待の印は URL から外され履歴の置き換えで消えている', () => {
        expect(window.location.search).toBe('');
        expect(window.location.href).not.toContain(TOKEN);
        const urls = replaced.map((c) => String(c[2]));
        expect(urls.some((u) => !u.includes(TOKEN))).toBe(true);
        // 印はメモリにあるので、そのあとの要求には使われている
        expect(callsTo('GET', `/v1/invitations/${TOKEN}`)).toHaveLength(1);
      });
      And('localStorage と sessionStorage と cookie には何も書かれていない', () => {
        expect(stored).toHaveLength(0);
        expect(localStorage.length).toBe(0);
        expect(sessionStorage.length).toBe(0);
        expect(document.cookie).toBe('');
      });
    },
  );
  Scenario(
    '友だちでない人が招待のリンクを開くと友だち登録の案内ともう一度開く案内が出る',
    ({ Given, When, Then }) => {
      Given('友だち追加していない人が招待のリンクを開く', () => {
        window.history.replaceState(null, '', `/?invitation=${TOKEN}`);
        routes['POST /v1/sessions'] = () => failure(403, 'NOT_FRIEND');
        render(<App />);
      });
      When('画面の読み込みが終わる', loaded);
      Then(
        '友だち追加の案内と「友だち登録したら、もう一度このリンクを開いてください」が出る',
        () => {
          expect(screen.getByTestId('register-page')).toHaveTextContent(MESSAGES.NOT_FRIEND);
          expect(screen.getByTestId('add-friend-button')).toBeInTheDocument();
          expect(screen.getByTestId('invitation-hint')).toHaveTextContent(
            INVITATION_NOT_FRIEND_HINT,
          );
          expect(INVITATION_NOT_FRIEND_HINT).toBe(
            '友だち登録したら、もう一度このリンクを開いてください',
          );
        },
      );
    },
  );
  Scenario('使えない招待では参加できない旨が出る', ({ Given, And, When, Then }) => {
    Given('使えない招待のリンクを太郎さんが開く', () => {
      routes[`GET /v1/invitations/${TOKEN}`] = () => failure(409, 'INVITATION_INVALID');
      openInvitationLink({ ...TARO, family: null });
    });
    When('画面の読み込みが終わる', loaded);
    Then(
      '「この招待は使えません。管理者に新しい招待を頼んでください」と出て「参加する」は出ない',
      async () => {
        expect(await screen.findByTestId('invitation-error')).toHaveTextContent(
          'この招待は使えません。管理者に新しい招待を頼んでください',
        );
        expect(screen.queryByTestId('join-button')).toBeNull();
      },
    );
    And('「はじめの画面へ」を押すと家族を作る画面に進む', async () => {
      expect(screen.getByTestId('go-calendar-button')).toHaveTextContent('はじめの画面へ');
      fireEvent.click(screen.getByTestId('go-calendar-button'));
      expect(await screen.findByTestId('setup-page')).toBeInTheDocument();
    });
  });
  Scenario(
    '別の家族に入っている人には別の家族に入っている旨が出る',
    ({ Given, And, When, Then }) => {
      Given('別の家族に入っている人が招待のリンクを開く', () => {
        routes[`GET /v1/invitations/${TOKEN}`] = () => failure(409, 'ALREADY_IN_OTHER_FAMILY');
        openInvitationLink({
          ...TARO,
          family: { ...childFamily, familyId: 'fam-2', name: '山田家' },
        });
      });
      When('画面の読み込みが終わる', loaded);
      Then('「すでに別の家族に入っています」と出て「参加する」は出ない', async () => {
        expect(await screen.findByTestId('invitation-error')).toHaveTextContent(
          'すでに別の家族に入っています',
        );
        expect(screen.queryByTestId('join-button')).toBeNull();
      });
      And('「カレンダーへ」を押すとカレンダーの枠に進む', async () => {
        expect(screen.getByTestId('go-calendar-button')).toHaveTextContent('カレンダーへ');
        fireEvent.click(screen.getByTestId('go-calendar-button'));
        expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
      });
    },
  );
  Scenario(
    '同じ家族の人にはすでに入っている旨とカレンダーへのボタンが出る',
    ({ Given, When, Then }) => {
      Given('同じ家族に入っている人が招待のリンクを開く', () => {
        routes[`GET /v1/invitations/${TOKEN}`] = () => failure(409, 'ALREADY_IN_FAMILY');
        openInvitationLink({ ...HANAKO, family: adminFamily });
      });
      When('画面の読み込みが終わる', loaded);
      Then(
        '「すでに家族に入っています」と「カレンダーへ」が出て押すとカレンダーの枠に進む',
        async () => {
          expect(await screen.findByTestId('invitation-error')).toHaveTextContent(
            'すでに家族に入っています',
          );
          fireEvent.click(screen.getByTestId('go-calendar-button'));
          expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
          expect(screen.getByTestId('family-name')).toHaveTextContent('田中家');
        },
      );
    },
  );
  Scenario(
    '参加の通信に失敗したらもう一度のボタンが出て同じ識別子で送り直す',
    ({ Given, And, When, Then }) => {
      let attempts = 0;
      Given('家族に入っていない太郎さんが招待のリンクを開く', () => {
        routes[`GET /v1/invitations/${TOKEN}`] = () => ({
          status: 200,
          body: { familyName: '田中家', expiresAt: EXPIRES_AT },
        });
        openInvitationLink({ ...TARO, family: null });
      });
      And('画面の読み込みが終わっている', async () => {
        await loaded();
        await screen.findByTestId('join-button');
      });
      When('通信が失敗する状態で「参加する」を押す', () => {
        routes[`POST /v1/invitations/${TOKEN}/accept`] = () => {
          attempts += 1;
          return attempts === 1 ? 'network' : { status: 200, body: childFamily };
        };
        fireEvent.click(screen.getByTestId('join-button'));
      });
      Then(
        '「表示できませんでした。もう一度お試しください」と「もう一度」のボタンが出る',
        async () => {
          expect(await screen.findByTestId('error-retry')).toHaveTextContent(
            '表示できませんでした。もう一度お試しください',
          );
          expect(screen.getByTestId('retry-button')).toHaveTextContent('もう一度');
        },
      );
      And(
        '通信が戻ったあとで「もう一度」を押すと同じ識別子で送り直されカレンダーの枠が出る',
        async () => {
          fireEvent.click(screen.getByTestId('retry-button'));
          expect(await screen.findByTestId('calendar-frame-page')).toBeInTheDocument();
          const posts = callsTo('POST', `/v1/invitations/${TOKEN}/accept`);
          expect(posts).toHaveLength(2);
          expect(posts[0]?.headers.get('Idempotency-Key')).toMatch(UUID);
          expect(posts[1]?.headers.get('Idempotency-Key')).toBe(
            posts[0]?.headers.get('Idempotency-Key'),
          );
        },
      );
    },
  );
  Scenario(
    '招待を作る通信に失敗したらもう一度のボタンが出て同じ識別子で送り直す',
    ({ Given, And, When, Then }) => {
      let attempts = 0;
      Given('管理者の花子さんが招待がない状態で画面を開く', () => openAsAdmin(null));
      And('カレンダーの枠の画面から「家族の設定」に進んでいる', goToSettings);
      When('通信が失敗する状態で「招待用のリンクを作る」を押す', async () => {
        routes['POST /v1/family/invitations'] = () => {
          attempts += 1;
          return attempts === 1
            ? 'network'
            : { status: 201, body: { url: INVITE_URL, expiresAt: EXPIRES_AT } };
        };
        fireEvent.click(await screen.findByTestId('create-invitation-button'));
      });
      Then(
        '「表示できませんでした。もう一度お試しください」と「もう一度」のボタンが出る',
        async () => {
          expect(await screen.findByTestId('error-retry')).toHaveTextContent(
            '表示できませんでした。もう一度お試しください',
          );
          expect(screen.getByTestId('retry-button')).toHaveTextContent('もう一度');
        },
      );
      And('通信が戻ったあとで「もう一度」を押すと同じ識別子で送り直されリンクが出る', async () => {
        fireEvent.click(screen.getByTestId('retry-button'));
        expect(await screen.findByTestId('invitation-url')).toHaveTextContent(INVITE_URL);
        const posts = callsTo('POST', '/v1/family/invitations');
        expect(posts).toHaveLength(2);
        expect(posts[1]?.headers.get('Idempotency-Key')).toBe(
          posts[0]?.headers.get('Idempotency-Key'),
        );
      });
    },
  );
});
