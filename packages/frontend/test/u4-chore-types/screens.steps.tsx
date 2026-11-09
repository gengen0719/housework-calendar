import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import type { ChoreType } from '@housework/shared';
import {
  CHORE_TYPE_DEACTIVATE_CONFIRM,
  CHORE_TYPE_DELETE_CONFIRM,
  CHORE_TYPE_NAME_HINT,
  CHORE_TYPE_NO_LONGER_EXISTS,
  CHORE_TYPE_PRICE_CHANGE_NOTE,
  MESSAGES,
  choreTypeNameTakenMessage,
} from '@housework/shared';
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

const feature = await loadFeature('packages/frontend/test/u4-chore-types/screens.feature');

interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
}

const SESSION = { sessionToken: FAKE_SESSION_TOKEN, expiresAt: '2026-11-01T01:00:00.000Z' };
const adminFamily = { familyId: 'fam-1', name: '田中家', role: 'admin' as const };
const childFamily = { ...adminFamily, role: 'child' as const };
const HANAKO = { userId: 'user-hanako', displayName: '花子' };
const TARO = { userId: 'user-taro', displayName: '太郎' };
const NOW = '2026-11-02T00:00:00.000Z';

let calls: RecordedCall[];
let types: ChoreType[];
let currentMe: unknown;
/** 登録の API が返す断り（なければ登録に成功する） */
let createFailure: { status: number; body: unknown } | undefined;
/** 消す API の動き */
let deleteMode: 'ok' | 'in-use' | 'gone';
/** true なら、変更の API は「種類がもうない」（ほかの人が先に消した）として 404 を返す */
let updateGone: boolean;

function choreType(over: Partial<ChoreType> & Pick<ChoreType, 'choreTypeId' | 'name'>): ChoreType {
  return { unitPrice: 100, active: true, createdAt: NOW, updatedAt: NOW, ...over };
}

const DISHES = choreType({ choreTypeId: 'ct-dishes', name: '皿洗い', unitPrice: 100 });
const GARBAGE = choreType({
  choreTypeId: 'ct-garbage',
  name: 'ごみ出し',
  unitPrice: 50,
  active: false,
});

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sortedForList = (): ChoreType[] => [
  ...types.filter((c) => c.active),
  ...types.filter((c) => !c.active),
];

function installFakeApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ method, path: input, headers: new Headers(init?.headers), body });
      if (method === 'POST' && input === '/v1/sessions') return respond(201, SESSION);
      if (method === 'GET' && input === '/v1/me') return respond(200, currentMe);
      if (method === 'GET' && input === '/v1/family/members') {
        return respond(200, [{ ...HANAKO, role: 'admin' }]);
      }
      if (method === 'GET' && input === '/v1/family/invitation') return respond(200, null);
      if (method === 'GET' && input === '/v1/family/notification-group') return respond(200, null);
      const calendar = defaultCalendarResponse(method, input);
      if (calendar) return calendar;
      if (method === 'GET' && input === '/v1/chore-types') return respond(200, sortedForList());
      if (method === 'POST' && input === '/v1/chore-types') {
        if (createFailure) return respond(createFailure.status, createFailure.body);
        const input2 = body as { name: string; unitPrice: number; description?: string };
        const created = choreType({ choreTypeId: `ct-${types.length + 1}`, ...input2 });
        types.push(created);
        return respond(201, created);
      }
      const match = /^\/v1\/chore-types\/(.+)$/.exec(input);
      if (match) {
        const target = types.find((c) => c.choreTypeId === match[1]);
        if (method === 'PUT' && target && updateGone) {
          types = types.filter((c) => c !== target);
          return respond(404, { error: { reason: 'NOT_FOUND' } });
        }
        if (method === 'PUT' && target) {
          Object.assign(target, body);
          return respond(200, target);
        }
        if (method === 'PATCH' && target) {
          target.active = (body as { active: boolean }).active;
          return respond(200, target);
        }
        if (method === 'DELETE' && target) {
          if (deleteMode === 'in-use') {
            target.active = false;
            return respond(409, { error: { reason: 'CHORE_TYPE_IN_USE' } });
          }
          if (deleteMode === 'gone') {
            types = types.filter((c) => c !== target);
            return respond(404, { error: { reason: 'NOT_FOUND' } });
          }
          types = types.filter((c) => c !== target);
          return respond(204);
        }
      }
      return respond(404, {});
    }),
  );
}

function openAs(person: 'admin' | 'child', initial: ChoreType[]): void {
  types = initial.map((c) => ({ ...c }));
  currentMe =
    person === 'admin' ? { ...HANAKO, family: adminFamily } : { ...TARO, family: childFamily };
  render(<App />);
}

async function goToChoreTypes(): Promise<void> {
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
  fireEvent.click(screen.getByTestId('open-settings-button'));
  fireEvent.click(await screen.findByTestId('open-chore-types-button'));
  await screen.findByTestId('chore-types-page');
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
}

async function openAddForm(): Promise<void> {
  await goToChoreTypes();
  fireEvent.click(screen.getByTestId('add-button'));
  await screen.findByTestId('chore-type-form');
}

const rowOf = (name: string): HTMLElement => {
  const row = screen
    .getAllByTestId('chore-type-row')
    .find((r) => within(r).getByTestId('chore-type-name').textContent === name);
  if (!row) throw new Error(`「${name}」の行がありません`);
  return row;
};

const callsTo = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path);

function typeInto(testId: string, value: string): void {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

function fillAndSave(fields: { name: string; price: string; description?: string }): void {
  typeInto('name-input', fields.name);
  typeInto('unit-price-input', fields.price);
  if (fields.description !== undefined) typeInto('description-input', fields.description);
  fireEvent.click(screen.getByTestId('save-button'));
}

const nameTaken = (conflictActive: boolean) => ({
  status: 409,
  body: { error: { reason: 'CHORE_TYPE_NAME_TAKEN', details: { conflictActive } } },
});

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    calls = [];
    types = [];
    createFailure = undefined;
    deleteMode = 'ok';
    updateGone = false;
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
    '「家族の設定」から「お手伝いの種類」に進むと、使わない種類は下にまとまる',
    ({ Given, When, Then }) => {
      Given(
        '管理者の花子さんが「皿洗い 100 円」と使わない「ごみ出し 50 円」のある状態で画面を開く',
        () => openAs('admin', [GARBAGE, DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      Then('「皿洗い」が出たあとに、使わない「ごみ出し」が文字で「使わない」と出る', () => {
        const active = screen.getByTestId('active-chore-types');
        expect(within(active).getByText('皿洗い')).toBeInTheDocument();
        expect(within(active).queryByText('ごみ出し')).toBeNull();
        const inactive = screen.getByTestId('inactive-chore-types');
        expect(within(inactive).getByText('ごみ出し')).toBeInTheDocument();
        expect(within(inactive).getByTestId('inactive-label')).toHaveTextContent('使わない');
        // 「使う」のまとまりが、画面の上（文書の前）にある
        expect(
          active.compareDocumentPosition(inactive) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      });
    },
  );

  Scenario('「追加」を押すと名前の欄の下に分けて登録する案内が出る', ({ Given, When, Then }) => {
    Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
    When('「追加」を押す', openAddForm);
    Then('名前の欄の下に「皿洗い（追加分）」の案内が出る', () => {
      const hint = screen.getByTestId('name-hint');
      expect(hint).toHaveTextContent(CHORE_TYPE_NAME_HINT);
      expect(hint).toHaveTextContent('皿洗い（追加分）');
    });
  });

  Scenario(
    '単価に -1 を入れて保存すると文言が出て、入力が残り、API は呼ばれない',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
      When('「追加」を押す', openAddForm);
      And('名前に「皿洗い」、単価に「-1」を入れて保存する', () =>
        fillAndSave({ name: '皿洗い', price: '-1' }),
      );
      Then('「単価は 0 円以上の整数で入力してください」と出る', async () => {
        expect(await screen.findByTestId('unit-price-error')).toHaveTextContent(
          '単価は 0 円以上の整数で入力してください',
        );
      });
      And('入力した名前と単価はそのまま残っている', () => {
        expect(screen.getByTestId('name-input')).toHaveValue('皿洗い');
        expect(screen.getByTestId('unit-price-input')).toHaveValue('-1');
      });
      And('登録の API は呼ばれていない', () => {
        expect(callsTo('POST', '/v1/chore-types')).toHaveLength(0);
      });
    },
  );

  Scenario('単価が空欄や小数でも保存せず文言が出る', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
    When('「追加」を押す', openAddForm);
    And('名前に「皿洗い」、単価に「1.5」を入れて保存する', () =>
      fillAndSave({ name: '皿洗い', price: '1.5' }),
    );
    Then('「単価は 0 円以上の整数で入力してください」と出る', async () => {
      expect(await screen.findByTestId('unit-price-error')).toHaveTextContent(
        MESSAGES.INVALID_UNIT_PRICE,
      );
    });
    And('登録の API は呼ばれていない', () => {
      expect(callsTo('POST', '/v1/chore-types')).toHaveLength(0);
    });
  });

  Scenario('登録すると一覧に「皿洗い 100 円」が出る', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
    When('「追加」を押す', openAddForm);
    And('名前に「皿洗い」、単価に「100」、説明に「夕食のあと」を入れて保存する', () =>
      fillAndSave({ name: '皿洗い', price: '100', description: '夕食のあと' }),
    );
    Then('一覧に「皿洗い」と「100 円」が出る', async () => {
      await waitFor(() => expect(screen.queryByTestId('chore-type-form')).toBeNull());
      const row = await waitFor(() => rowOf('皿洗い'));
      expect(within(row).getByTestId('chore-type-price')).toHaveTextContent('100 円');
      expect(within(row).getByTestId('chore-type-description')).toHaveTextContent('夕食のあと');
    });
    And('登録の API には名前・単価・説明と操作の識別子が送られた', () => {
      const [post] = callsTo('POST', '/v1/chore-types');
      expect(post?.body).toEqual({ name: '皿洗い', unitPrice: 100, description: '夕食のあと' });
      expect(post?.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
      expect(post?.headers.get('Authorization')).toBe(`Bearer ${FAKE_SESSION_TOKEN}`);
    });
  });

  Scenario(
    '同じ名前の「使う」種類があると、別の名前を勧める文言が出て入力が残る',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
      When('「追加」を押す', openAddForm);
      And('相手が「使う」の名前の重なりで名前に「皿洗い」、単価に「100」を入れて保存する', () => {
        createFailure = nameTaken(true);
        fillAndSave({ name: '皿洗い', price: '100' });
      });
      Then('名前の欄の下に「皿洗い（追加分）」を勧める文言が出る', async () => {
        const error = await screen.findByTestId('name-error');
        expect(error).toHaveTextContent(choreTypeNameTakenMessage(true));
        expect(error).toHaveTextContent('皿洗い（追加分）');
      });
      And('入力した名前と単価はそのまま残っている', () => {
        expect(screen.getByTestId('name-input')).toHaveValue('皿洗い');
        expect(screen.getByTestId('unit-price-input')).toHaveValue('100');
      });
    },
  );

  Scenario(
    '同じ名前の「使わない」種類があると、「使う」に戻す文言が出る',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんがお手伝いの種類の画面を開いている', () => openAs('admin', []));
      When('「追加」を押す', openAddForm);
      And(
        '相手が「使わない」の名前の重なりで名前に「皿洗い」、単価に「100」を入れて保存する',
        () => {
          createFailure = nameTaken(false);
          fillAndSave({ name: '皿洗い', price: '100' });
        },
      );
      Then('名前の欄の下に「使う」に戻す文言が出る', async () => {
        const error = await screen.findByTestId('name-error');
        expect(error).toHaveTextContent(choreTypeNameTakenMessage(false));
        expect(error).toHaveTextContent('『使う』に戻す');
        expect(error.textContent).not.toContain('皿洗い（追加分）');
      });
    },
  );

  Scenario('単価を変える画面に、新しい単価になる時期の注意が出る', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
      openAs('admin', [DISHES]),
    );
    When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
    And('「皿洗い」の「変更」を押す', () => {
      fireEvent.click(within(rowOf('皿洗い')).getByTestId('edit-button'));
    });
    Then('「単価を変えると、このあとに付く記録から新しい単価になります」が出る', async () => {
      expect(await screen.findByTestId('price-change-note')).toHaveTextContent(
        CHORE_TYPE_PRICE_CHANGE_NOTE,
      );
    });
    And('今の名前と単価が入力欄に入っている', () => {
      expect(screen.getByTestId('name-input')).toHaveValue('皿洗い');
      expect(screen.getByTestId('unit-price-input')).toHaveValue('100');
    });
  });

  Scenario('単価を変えて保存すると、一覧が新しい単価になる', ({ Given, When, Then, And }) => {
    Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
      openAs('admin', [DISHES]),
    );
    When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
    And('「皿洗い」の「変更」を押す', () => {
      fireEvent.click(within(rowOf('皿洗い')).getByTestId('edit-button'));
    });
    And('単価を「120」に変えて保存する', async () => {
      await screen.findByTestId('chore-type-form');
      typeInto('unit-price-input', '120');
      fireEvent.click(screen.getByTestId('save-button'));
    });
    Then('一覧に「皿洗い」と「120 円」が出る', async () => {
      await waitFor(() =>
        expect(within(rowOf('皿洗い')).getByTestId('chore-type-price')).toHaveTextContent('120 円'),
      );
    });
    And('変更の API には名前・単価・説明だけが送られた', () => {
      const [put] = callsTo('PUT', '/v1/chore-types/ct-dishes');
      expect(put?.body).toEqual({ name: '皿洗い', unitPrice: 120 });
    });
  });

  Scenario(
    '変更を保存しようとしたら種類がもうなかったとき、フォームが閉じて一覧が読み直される',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
        openAs('admin', [DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      And('「皿洗い」の「変更」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('edit-button'));
      });
      And('変更の保存は見つからないと断られる状態で単価を「120」に変えて保存する', async () => {
        await screen.findByTestId('chore-type-form');
        updateGone = true;
        typeInto('unit-price-input', '120');
        fireEvent.click(screen.getByTestId('save-button'));
      });
      Then(
        '「この種類はもうありません」が出て、フォームは閉じ、一覧から「皿洗い」がなくなる',
        async () => {
          expect(await screen.findByTestId('chore-type-notice')).toHaveTextContent(
            CHORE_TYPE_NO_LONGER_EXISTS,
          );
          await waitFor(() => expect(screen.queryByTestId('chore-type-row')).toBeNull());
          expect(screen.queryByTestId('chore-type-form')).toBeNull();
          expect(screen.queryByTestId('form-error')).toBeNull();
          expect(callsTo('PUT', '/v1/chore-types/ct-dishes')).toHaveLength(1);
          expect(callsTo('GET', '/v1/chore-types')).toHaveLength(2);
        },
      );
    },
  );

  Scenario(
    '「使わない」を押すと確かめが出て、押すと下に移る。「使う」で戻る',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
        openAs('admin', [DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      And('「皿洗い」の「使わない」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('deactivate-button'));
      });
      Then('「使わないにすると、新しい割り当てで選べなくなります」という確かめが出る', async () => {
        expect(await screen.findByTestId('deactivate-confirm')).toHaveTextContent(
          CHORE_TYPE_DEACTIVATE_CONFIRM,
        );
        expect(callsTo('PATCH', '/v1/chore-types/ct-dishes')).toHaveLength(0);
      });
      When('確かめで「使わないにする」を押す', () => {
        fireEvent.click(screen.getByTestId('deactivate-confirm-button'));
      });
      Then('「皿洗い」は使わないのまとまりに移り、API には「active」だけが送られた', async () => {
        await waitFor(() =>
          expect(
            within(screen.getByTestId('inactive-chore-types')).getByText('皿洗い'),
          ).toBeInTheDocument(),
        );
        expect(callsTo('PATCH', '/v1/chore-types/ct-dishes')[0]?.body).toEqual({ active: false });
      });
      When('使わないの「皿洗い」の「使う」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('activate-button'));
      });
      Then('「皿洗い」は使うのまとまりに戻る', async () => {
        await waitFor(() =>
          expect(
            within(screen.getByTestId('active-chore-types')).getByText('皿洗い'),
          ).toBeInTheDocument(),
        );
        expect(screen.queryByTestId('inactive-chore-types')).toBeNull();
        expect(callsTo('PATCH', '/v1/chore-types/ct-dishes')[1]?.body).toEqual({ active: true });
      });
    },
  );

  Scenario(
    '「消す」を押すと確かめが出て、消えると一覧からなくなる',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
        openAs('admin', [DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      And('「皿洗い」の「消す」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('delete-button'));
      });
      Then('「この種類を消しますか？ 消すと元に戻せません」という確かめが出る', async () => {
        expect(await screen.findByTestId('delete-confirm')).toHaveTextContent(
          CHORE_TYPE_DELETE_CONFIRM,
        );
        expect(callsTo('DELETE', '/v1/chore-types/ct-dishes')).toHaveLength(0);
      });
      When('確かめで「消す」を押す', () => {
        fireEvent.click(screen.getByTestId('delete-confirm-button'));
      });
      Then('一覧から「皿洗い」がなくなる', async () => {
        await waitFor(() => expect(screen.queryByText('皿洗い')).toBeNull());
        expect(callsTo('DELETE', '/v1/chore-types/ct-dishes')).toHaveLength(1);
      });
    },
  );

  Scenario(
    '使われたことのある種類を消そうとすると、使わないにしたと出て一覧が読み直される',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
        openAs('admin', [DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      And('「皿洗い」の「消す」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('delete-button'));
      });
      And('消す操作は使われているとして断られる状態で確かめの「消す」を押す', () => {
        deleteMode = 'in-use';
        fireEvent.click(screen.getByTestId('delete-confirm-button'));
      });
      Then(
        '「『使わない』にしました」の文言が出て、「皿洗い」は使わないのまとまりに移る',
        async () => {
          expect(await screen.findByTestId('chore-type-notice')).toHaveTextContent(
            '『使わない』にしました',
          );
          await waitFor(() =>
            expect(
              within(screen.getByTestId('inactive-chore-types')).getByText('皿洗い'),
            ).toBeInTheDocument(),
          );
          expect(callsTo('GET', '/v1/chore-types')).toHaveLength(2);
        },
      );
    },
  );

  Scenario(
    'もう消えた種類を消そうとすると、すでに消えていると出て一覧が読み直される',
    ({ Given, When, Then, And }) => {
      Given('管理者の花子さんが「皿洗い 100 円」のある状態で画面を開く', () =>
        openAs('admin', [DISHES]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      And('「皿洗い」の「消す」を押す', () => {
        fireEvent.click(within(rowOf('皿洗い')).getByTestId('delete-button'));
      });
      And('消す操作は見つからないと断られる状態で確かめの「消す」を押す', () => {
        deleteMode = 'gone';
        fireEvent.click(screen.getByTestId('delete-confirm-button'));
      });
      Then('「すでに消えています」が出て、一覧から「皿洗い」がなくなる', async () => {
        expect(await screen.findByTestId('chore-type-notice')).toHaveTextContent(
          'すでに消えています',
        );
        await waitFor(() => expect(screen.queryByTestId('chore-type-row')).toBeNull());
        expect(callsTo('GET', '/v1/chore-types')).toHaveLength(2);
      });
    },
  );

  Scenario('子供には「追加」などのボタンが出ない', ({ Given, When, Then }) => {
    Given('子供の太郎さんが「皿洗い 100 円」のある状態で画面を開く', () =>
      openAs('child', [DISHES]),
    );
    When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
    Then('「皿洗い」は見えるが、追加・変更・使わない・消すのボタンは出ない', () => {
      expect(rowOf('皿洗い')).toBeInTheDocument();
      for (const id of [
        'add-button',
        'edit-button',
        'deactivate-button',
        'activate-button',
        'delete-button',
      ]) {
        expect(screen.queryByTestId(id)).toBeNull();
      }
    });
  });

  Scenario(
    '名前と説明の中のタグは文字として出て、説明の改行はそのまま出る',
    ({ Given, When, Then }) => {
      const NAME = '<b>皿</b><img src=x>';
      const DESCRIPTION = '<i>夕食</i>のあと\n二行目';
      Given('管理者の花子さんがタグと改行の入った種類のある状態で画面を開く', () =>
        openAs('admin', [
          choreType({ choreTypeId: 'ct-tag', name: NAME, description: DESCRIPTION }),
        ]),
      );
      When('「家族の設定」から「お手伝いの種類」に進む', goToChoreTypes);
      Then(
        '名前と説明はタグのまま文字として出て、要素としては増えず、改行の表示の指定がある',
        () => {
          const row = screen.getByTestId('chore-type-row');
          expect(within(row).getByTestId('chore-type-name').textContent).toBe(NAME);
          const description = within(row).getByTestId('chore-type-description');
          expect(description.textContent).toBe(DESCRIPTION);
          expect(row.querySelector('b')).toBeNull();
          expect(row.querySelector('i')).toBeNull();
          expect(row.querySelector('img')).toBeNull();
          expect(getComputedStyle(description).whiteSpace).toBe('pre-wrap');
        },
      );
    },
  );
});
