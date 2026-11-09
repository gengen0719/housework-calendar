import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { MESSAGES, NOTIFICATION_GROUP_HOWTO } from '@housework/shared';
import { App } from '../../src/App';
import { FAKE_SESSION_TOKEN } from '../fixtures/fakeSecrets';
import { defaultCalendarResponse } from '../u5-assignment-calendar/helpers/calendarStub';

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

const feature = await loadFeature('packages/frontend/test/u3-notification-group/screens.feature');

interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
}

const PATH = '/v1/family/notification-group';
const SESSION = { sessionToken: FAKE_SESSION_TOKEN, expiresAt: '2026-11-01T01:00:00.000Z' };
const adminFamily = { familyId: 'fam-1', name: '田中家', role: 'admin' as const };
const childFamily = { ...adminFamily, role: 'child' as const };
const HANAKO = { userId: 'user-hanako', displayName: '花子' };
const TARO = { userId: 'user-taro', displayName: '太郎' };
const REGISTERED_AT = '2026-11-02T00:00:00.000Z';

let calls: RecordedCall[];
let notificationGroup: { status: number; body?: unknown };

function installFakeApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, path: input, headers: new Headers(init?.headers) });
      const respond = (status: number, body?: unknown) =>
        new Response(body === undefined ? null : JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      if (method === 'POST' && input === '/v1/sessions') return respond(201, SESSION);
      if (method === 'GET' && input === '/v1/me') return respond(200, currentMe);
      if (method === 'GET' && input === '/v1/family/members') {
        return respond(200, [{ ...HANAKO, role: 'admin' }]);
      }
      if (method === 'GET' && input === '/v1/family/invitation') return respond(200, null);
      const calendar = defaultCalendarResponse(method, input);
      if (calendar) return calendar;
      if (method === 'GET' && input === PATH) {
        return respond(notificationGroup.status, notificationGroup.body);
      }
      return respond(404, {});
    }),
  );
}

let currentMe: unknown;

function openAs(person: 'admin' | 'child', body: unknown, status = 200): void {
  notificationGroup = { status, body };
  currentMe =
    person === 'admin' ? { ...HANAKO, family: adminFamily } : { ...TARO, family: childFamily };
  render(<App />);
}

const registered = (groupName: string | null) => ({ groupName, registeredAt: REGISTERED_AT });

const callsToGroup = () => calls.filter((c) => c.method === 'GET' && c.path === PATH);

async function loaded(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
}

async function goToSettings(): Promise<void> {
  await loaded();
  fireEvent.click(screen.getByTestId('open-settings-button'));
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
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
  });

  Scenario(
    'お知らせ先がないとき、管理者のカレンダーの枠の画面に手順が出る',
    ({ Given, Then, And }) => {
      Given('管理者の花子さんがお知らせ先のない状態で画面を開く', () => openAs('admin', null));
      Then('「お知らせ先のグループが登録されていません」と登録の手順が出る', async () => {
        const hint = await screen.findByTestId('notification-group-hint');
        expect(hint).toHaveTextContent(MESSAGES.NOTIFICATION_GROUP_NOT_REGISTERED);
        expect(hint).toHaveTextContent('お知らせ先のグループが登録されていません');
        expect(hint).toHaveTextContent(NOTIFICATION_GROUP_HOWTO);
      });
      And('お知らせ先の表示は認証つきで要求された', () => {
        expect(callsToGroup()).toHaveLength(1);
        expect(callsToGroup()[0]?.headers.get('Authorization')).toBe('Bearer session-token-1');
      });
    },
  );

  Scenario('登録後に戻ると手順が消える', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんがお知らせ先のない状態で画面を開く', () => openAs('admin', null));
    And('カレンダーの枠の画面にお知らせ先の手順が出ている', async () => {
      expect(await screen.findByTestId('notification-group-hint')).toBeInTheDocument();
    });
    When('グループで登録されたあと、画面が前面に戻る', async () => {
      notificationGroup = { status: 200, body: registered('山田家のグループ') };
      document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(callsToGroup()).toHaveLength(2));
    });
    Then('手順が消える', async () => {
      await waitFor(() => expect(screen.queryByTestId('notification-group-hint')).toBeNull());
    });
  });

  Scenario('お知らせ先があれば、管理者のカレンダーの枠の画面に手順は出ない', ({ Given, Then }) => {
    Given('管理者の花子さんがお知らせ先のある状態で画面を開く', () =>
      openAs('admin', registered('山田家のグループ')),
    );
    Then('お知らせ先の表示が読み込まれたあとも手順は出ない', async () => {
      await loaded();
      await waitFor(() => expect(callsToGroup()).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByTestId('notification-group-hint')).toBeNull();
    });
  });

  Scenario(
    '子供の画面には、お知らせ先がなくても表示が出ず API も呼ばない',
    ({ Given, Then, And }) => {
      Given('子供の太郎さんがお知らせ先のない状態で画面を開く', () => openAs('child', null));
      Then('カレンダーの枠の画面に手順は出ない', async () => {
        await loaded();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByTestId('notification-group-hint')).toBeNull();
      });
      And('お知らせ先の API は呼ばれていない', () => {
        expect(callsToGroup()).toHaveLength(0);
      });
    },
  );

  Scenario(
    'お知らせ先の取得に失敗しても、カレンダーの枠の画面は止まらず手順も出ない',
    ({ Given, Then }) => {
      Given('管理者の花子さんがお知らせ先の取得に失敗する状態で画面を開く', () =>
        openAs('admin', { error: { reason: 'INTERNAL' } }, 500),
      );
      Then('カレンダーの枠の画面は出ていて手順は出ない', async () => {
        await loaded();
        await waitFor(() => expect(callsToGroup()).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
        expect(screen.queryByTestId('notification-group-hint')).toBeNull();
        expect(screen.queryByTestId('error-retry')).toBeNull();
      });
    },
  );

  Scenario('家族の設定にお知らせ先のグループの名前が出る', ({ Given, When, Then }) => {
    Given('管理者の花子さんがお知らせ先「山田家のグループ」のある状態で画面を開く', () =>
      openAs('admin', registered('山田家のグループ')),
    );
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('「お知らせ先: 山田家のグループ」が出る', async () => {
      expect(await screen.findByTestId('notification-group')).toHaveTextContent(
        'お知らせ先: 山田家のグループ',
      );
    });
  });

  Scenario('家族の設定では、グループの名前が空なら「登録済み」と出る', ({ Given, When, Then }) => {
    Given('管理者の花子さんがお知らせ先の名前が空の状態で画面を開く', () =>
      openAs('admin', registered(null)),
    );
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('「お知らせ先: 登録済み」が出る', async () => {
      expect(await screen.findByTestId('notification-group')).toHaveTextContent(
        'お知らせ先: 登録済み',
      );
    });
  });

  Scenario(
    '家族の設定では、お知らせ先がなければ「登録されていません」と出る',
    ({ Given, When, Then }) => {
      Given('子供の太郎さんがお知らせ先のない状態で画面を開く', () => openAs('child', null));
      When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
      Then('「お知らせ先: 登録されていません」が出る', async () => {
        expect(await screen.findByTestId('notification-group')).toHaveTextContent(
          'お知らせ先: 登録されていません',
        );
      });
    },
  );

  Scenario('グループの名前の中のタグは文字として出る', ({ Given, When, Then }) => {
    const NAME = '<b>太字</b><img src=x>';
    Given('管理者の花子さんがお知らせ先「<b>太字</b><img src=x>」のある状態で画面を開く', () =>
      openAs('admin', registered(NAME)),
    );
    When('カレンダーの枠の画面から「家族の設定」に進む', goToSettings);
    Then('名前はタグのまま文字として出て、要素としては増えない', async () => {
      const line = await screen.findByTestId('notification-group');
      expect(line.textContent).toBe(`お知らせ先: ${NAME}`);
      expect(line.querySelector('b')).toBeNull();
      expect(line.querySelector('img')).toBeNull();
    });
  });
});
