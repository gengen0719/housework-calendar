import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import {
  DISHES_ID,
  TARO,
  callsTo,
  choreType,
  duty,
  fake,
  installFakeApi,
  resetFake,
  setCalendar,
} from '../u5-assignment-calendar/helpers/fakeCalendarApi';
import { App } from '../../src/App';

const feature = await loadFeature(
  'packages/frontend/test/u7-review-confirm/review-confirm.feature',
);

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

const MONTH = '2026-11';
const DAY = '2026-11-15';

async function openAs(role: 'admin' | 'child'): Promise<void> {
  fake.role = role;
  render(<App />);
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
  await waitFor(() => expect(screen.getAllByTestId('day-row').length).toBeGreaterThan(0));
}

const rowOf = (date: string): HTMLElement => {
  const row = screen.getAllByTestId('day-row').find((r) => r.getAttribute('data-date') === date);
  if (!row) throw new Error(`${date} の行がありません`);
  return row;
};

async function openDetail(date: string): Promise<HTMLElement> {
  fireEvent.click(within(rowOf(date)).getAllByRole('button')[0] as HTMLElement);
  return await screen.findByTestId('day-detail');
}

function seedDuty(over: Partial<Parameters<typeof duty>[0]> = {}): ReturnType<typeof duty> {
  const target = duty({ date: DAY, choreTypeId: DISHES_ID, childUserId: TARO.userId, ...over });
  const existing = fake.calendars[MONTH];
  setCalendar(MONTH, { ...(existing ?? {}), duties: [...(existing?.duties ?? []), target] });
  return target;
}

/** 状態ごとの担当を置いて、役割を指定して日の詳細まで開く。 */
async function seedAndOpen(
  role: 'admin' | 'child',
  status: 'todo' | 'done' | 'skipped',
): Promise<ReturnType<typeof duty>> {
  const target = seedDuty({ status });
  await openAs(role);
  await openDetail(DAY);
  return target;
}

const actionLabels = (): string[] =>
  screen
    .queryAllByTestId(/^status-action-/)
    .map((b) => b.textContent ?? '')
    .sort();

const pressAction = async (label: string): Promise<void> => {
  const detail = await screen.findByTestId('day-detail');
  fireEvent.click(within(detail).getByRole('button', { name: label }));
};

const pressYes = async (): Promise<void> => {
  fireEvent.click(await screen.findByTestId('status-change-confirm-button'));
};

const calendarReads = (month = MONTH): number =>
  callsTo('GET', `/v1/months/${month}/calendar`).length;

const statusCallsFor = (dutyId: string) => callsTo('POST', `/v1/duties/${dutyId}/status`);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    resetFake();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
    fake.today = DAY;
    Element.prototype.scrollIntoView = vi.fn();
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
    vi.useRealTimers();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  // ---- 操作ボタンの出し分け ----

  Scenario(
    '管理者には「未」の担当に「済にする」「やらなかったにする」が出る',
    ({ Given, Then }) => {
      Given(
        '太郎の 11月15日の「未」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
        async () => {
          await seedAndOpen('admin', 'todo');
        },
      );
      Then('日の詳細に「済にする」と「やらなかったにする」だけが出る', () => {
        expect(actionLabels()).toEqual(['やらなかったにする', '済にする']);
      });
    },
  );

  Scenario(
    '管理者には「済」の担当に「取り消す」「やらなかったにする」が出る',
    ({ Given, Then }) => {
      Given(
        '太郎の 11月15日の「済」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
        async () => {
          await seedAndOpen('admin', 'done');
        },
      );
      Then('日の詳細に「取り消す」と「やらなかったにする」だけが出る', () => {
        expect(actionLabels()).toEqual(['やらなかったにする', '取り消す']);
      });
    },
  );

  Scenario('管理者には「×」の担当に「やらなかったを外す」「済にする」が出る', ({ Given, Then }) => {
    Given(
      '太郎の 11月15日の「×」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        await seedAndOpen('admin', 'skipped');
      },
    );
    Then('日の詳細に「やらなかったを外す」と「済にする」だけが出る', () => {
      expect(actionLabels()).toEqual(['やらなかったを外す', '済にする']);
    });
  });

  Scenario('子供には操作のボタンが出ない', ({ Given, Then }) => {
    Given(
      '太郎の 11月15日の「済」の皿洗いがある状態で子供の太郎が 11月15日の詳細を開く',
      async () => {
        await seedAndOpen('child', 'done');
      },
    );
    Then('日の詳細に状態を変えるボタンは出ない', () => {
      expect(screen.getByTestId('day-detail')).toBeInTheDocument();
      expect(actionLabels()).toEqual([]);
    });
  });

  // ---- 5 とおりの操作 ----

  Scenario(
    '「取り消す」を押すと確認が出て、「はい」で取り消されて読み直す',
    ({ Given, When, Then }) => {
      let target: ReturnType<typeof duty>;
      Given(
        '太郎の 11月15日の「済」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
        async () => {
          target = await seedAndOpen('admin', 'done');
        },
      );
      When('花子が「取り消す」を押す', async () => {
        await pressAction('取り消す');
      });
      Then(
        '確認に「11/15 皿洗い 太郎: 済 → 未 に戻します」と「お小遣いの回数から外れます」が出て、「はい」で POST status が cancel で送られ読み直す',
        async () => {
          const dialog = await screen.findByTestId('status-change-dialog');
          expect(dialog).toHaveTextContent('11/15 皿洗い 太郎: 済 → 未 に戻します');
          expect(dialog).toHaveTextContent('お小遣いの回数から外れます');
          const before = calendarReads();
          await pressYes();
          await waitFor(() => {
            const calls = statusCallsFor(target.dutyId);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.body).toEqual({ action: 'cancel', version: target.version });
          });
          await waitFor(() => expect(calendarReads()).toBeGreaterThan(before));
          await waitFor(() => expect(screen.queryByTestId('status-change-dialog')).toBeNull());
          await waitFor(() =>
            expect(
              within(screen.getByTestId('day-detail')).getByTestId('detail-status'),
            ).toHaveTextContent('未'),
          );
        },
      );
    },
  );

  Scenario(
    '「済にする」を押すと確認時点の単価が出て、「はい」で「済」になる',
    ({ Given, When, Then }) => {
      let target: ReturnType<typeof duty>;
      Given(
        '太郎の 11月15日の「未」の皿洗い（単価 120 円）がある状態で管理者の花子が 11月15日の詳細を開く',
        async () => {
          fake.choreTypes = [choreType({ choreTypeId: DISHES_ID, name: '皿洗い', unitPrice: 120 })];
          target = await seedAndOpen('admin', 'todo');
        },
      );
      When('花子が「済にする」を押す', async () => {
        await pressAction('済にする');
      });
      Then(
        '確認に「11/15 皿洗い 太郎 を『済』にします」と「120 円で数えます」が出て、「はい」で POST status が markDone で送られ「済」と花子の記録が出る',
        async () => {
          const dialog = await screen.findByTestId('status-change-dialog');
          expect(dialog).toHaveTextContent('11/15 皿洗い 太郎 を『済』にします');
          expect(dialog).toHaveTextContent('120 円で数えます');
          // 確認時点の単価を、種類の一覧（既存の読み取り）から引いた
          expect(callsTo('GET', '/v1/chore-types').length).toBeGreaterThanOrEqual(1);
          await pressYes();
          await waitFor(() => {
            const calls = statusCallsFor(target.dutyId);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.body).toEqual({ action: 'markDone', version: target.version });
          });
          await waitFor(() => {
            const detail = screen.getByTestId('day-detail');
            expect(within(detail).getByTestId('detail-status')).toHaveTextContent('済');
            expect(within(detail).getByTestId('detail-recorder')).toHaveTextContent('花子');
          });
        },
      );
    },
  );

  Scenario('済の担当を「やらなかったにする」と注意が出る', ({ Given, When, Then }) => {
    let target: ReturnType<typeof duty>;
    Given(
      '太郎の 11月15日の「済」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        target = await seedAndOpen('admin', 'done');
      },
    );
    When('花子が「やらなかったにする」を押す', async () => {
      await pressAction('やらなかったにする');
    });
    Then(
      '確認に「11/15 皿洗い 太郎: 済 → × にします」と「お小遣いの回数から外れます」が出て、「はい」で POST status が markSkipped で送られる',
      async () => {
        const dialog = await screen.findByTestId('status-change-dialog');
        expect(dialog).toHaveTextContent('11/15 皿洗い 太郎: 済 → × にします');
        expect(dialog).toHaveTextContent('お小遣いの回数から外れます');
        await pressYes();
        await waitFor(() => {
          const calls = statusCallsFor(target.dutyId);
          expect(calls).toHaveLength(1);
          expect(calls[0]?.body).toEqual({ action: 'markSkipped', version: target.version });
        });
      },
    );
  });

  Scenario('「未」の担当を「やらなかったにする」と注意は出ない', ({ Given, When, Then }) => {
    let target: ReturnType<typeof duty>;
    Given(
      '太郎の 11月15日の「未」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        target = await seedAndOpen('admin', 'todo');
      },
    );
    When('花子が「やらなかったにする」を押す', async () => {
      await pressAction('やらなかったにする');
    });
    Then(
      '確認に「11/15 皿洗い 太郎: 未 → × にします」だけが出て、「はい」で POST status が markSkipped で送られる',
      async () => {
        const dialog = await screen.findByTestId('status-change-dialog');
        expect(dialog).toHaveTextContent('11/15 皿洗い 太郎: 未 → × にします');
        expect(screen.queryByTestId('status-change-note')).toBeNull();
        await pressYes();
        await waitFor(() => {
          const calls = statusCallsFor(target.dutyId);
          expect(calls).toHaveLength(1);
          expect(calls[0]?.body).toEqual({ action: 'markSkipped', version: target.version });
        });
      },
    );
  });

  Scenario('「やらなかったを外す」で「×」が「未」に戻る', ({ Given, When, Then }) => {
    let target: ReturnType<typeof duty>;
    Given(
      '太郎の 11月15日の「×」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        target = await seedAndOpen('admin', 'skipped');
      },
    );
    When('花子が「やらなかったを外す」を押す', async () => {
      await pressAction('やらなかったを外す');
    });
    Then(
      '確認に「11/15 皿洗い 太郎: × → 未 に戻します」が出て、「はい」で POST status が unmarkSkipped で送られる',
      async () => {
        const dialog = await screen.findByTestId('status-change-dialog');
        expect(dialog).toHaveTextContent('11/15 皿洗い 太郎: × → 未 に戻します');
        await pressYes();
        await waitFor(() => {
          const calls = statusCallsFor(target.dutyId);
          expect(calls).toHaveLength(1);
          expect(calls[0]?.body).toEqual({ action: 'unmarkSkipped', version: target.version });
        });
      },
    );
  });

  Scenario('「やめる」を押すと何も送られない', ({ Given, When, Then }) => {
    let target: ReturnType<typeof duty>;
    Given(
      '太郎の 11月15日の「済」の皿洗いがある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        target = await seedAndOpen('admin', 'done');
      },
    );
    When('花子が「取り消す」を押す', async () => {
      await pressAction('取り消す');
    });
    Then('「やめる」を押すと確認が閉じて POST status は送られない', async () => {
      fireEvent.click(await screen.findByTestId('status-change-cancel-button'));
      await waitFor(() => expect(screen.queryByTestId('status-change-dialog')).toBeNull());
      expect(statusCallsFor(target.dutyId)).toHaveLength(0);
    });
  });

  Scenario('「はい」を押している間はボタンが押せない', ({ Given, When, Then }) => {
    let release: () => void = () => undefined;
    Given(
      '太郎の 11月15日の「済」の皿洗いがあり、状態の変更の応答が遅れる状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        await seedAndOpen('admin', 'done');
        const original = globalThis.fetch as typeof fetch;
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: string, init?: RequestInit) => {
            if ((init?.method ?? 'GET') === 'POST' && String(input).endsWith('/status')) {
              await new Promise<void>((resolve) => {
                release = resolve;
              });
            }
            return original(input, init);
          }),
        );
      },
    );
    When('花子が「取り消す」を押し、確認で「はい」を押す', async () => {
      await pressAction('取り消す');
      await pressYes();
    });
    Then('変更する間は「はい」が aria-busy で押せない', async () => {
      const yes = await screen.findByTestId('status-change-confirm-button');
      await waitFor(() => expect(yes).toHaveAttribute('aria-busy', 'true'));
      expect(yes).toBeDisabled();
      release();
      await wait(10);
    });
  });

  // ---- 失敗の文言と読み直し ----

  const failureScenario = (
    title: string,
    given: string,
    answer: { status: number; reason: string },
    then: string,
    expectation: { message: string; reloads: boolean; retry?: boolean },
  ) =>
    Scenario(title, ({ Given, When, Then }) => {
      Given(given, async () => {
        fake.statusAnswers = [
          { status: answer.status, body: { error: { reason: answer.reason } } },
        ];
        await seedAndOpen('admin', 'done');
      });
      When('花子が「取り消す」を押し、確認で「はい」を押す', async () => {
        await pressAction('取り消す');
        await pressYes();
      });
      Then(then, async () => {
        const before = calendarReads();
        const error = await screen.findByTestId('status-error');
        expect(error).toHaveTextContent(expectation.message);
        await waitFor(() => expect(screen.queryByTestId('status-change-dialog')).toBeNull());
        if (expectation.reloads) {
          // 最初の読み込みのあと、もう 1 回読み直した
          await waitFor(() => expect(calendarReads()).toBeGreaterThanOrEqual(2));
        } else {
          await wait(20);
          expect(calendarReads()).toBe(before);
        }
        if (expectation.retry) {
          const retry = screen.getByTestId('status-error-retry');
          expect(retry).toHaveTextContent('読み込み直す');
          const beforeRetry = calendarReads();
          fireEvent.click(retry);
          await waitFor(() => expect(calendarReads()).toBeGreaterThan(beforeRetry));
        }
      });
    });

  failureScenario(
    '404 NOT_FOUND のときは「先に変更されました」と読み直す',
    '太郎の 11月15日の「済」の皿洗いがあり、状態の変更が 404 NOT_FOUND になる状態で管理者の花子が 11月15日の詳細を開く',
    { status: 404, reason: 'NOT_FOUND' },
    '「この担当は先に変更されました」が出て、カレンダーを読み直す',
    { message: 'この担当は先に変更されました', reloads: true },
  );
  failureScenario(
    '409 INVALID_TRANSITION のときは「先に変更されました」と読み直す',
    '太郎の 11月15日の「済」の皿洗いがあり、状態の変更が 409 INVALID_TRANSITION になる状態で管理者の花子が 11月15日の詳細を開く',
    { status: 409, reason: 'INVALID_TRANSITION' },
    '「この担当は先に変更されました」が出て、カレンダーを読み直す',
    { message: 'この担当は先に変更されました', reloads: true },
  );
  failureScenario(
    '409 MONTH_CONFIRMED のときは「確定済みです」と読み直す',
    '太郎の 11月15日の「済」の皿洗いがあり、状態の変更が 409 MONTH_CONFIRMED になる状態で管理者の花子が 11月15日の詳細を開く',
    { status: 409, reason: 'MONTH_CONFIRMED' },
    '「この月は確定済みです」が出て、カレンダーを読み直す',
    { message: 'この月は確定済みです', reloads: true },
  );
  failureScenario(
    '422 INVALID_REQUEST のときは内容の誤りが出て読み直さない',
    '太郎の 11月15日の「済」の皿洗いがあり、状態の変更が 422 INVALID_REQUEST になる状態で管理者の花子が 11月15日の詳細を開く',
    { status: 422, reason: 'INVALID_REQUEST' },
    '「操作の内容が正しくありません。もう一度お試しください」が出て、カレンダーは読み直さない',
    { message: '操作の内容が正しくありません。もう一度お試しください', reloads: false },
  );
  failureScenario(
    '500 INTERNAL のときは文言と「読み込み直す」が出て、押すと読み直す',
    '太郎の 11月15日の「済」の皿洗いがあり、状態の変更が 500 INTERNAL になる状態で管理者の花子が 11月15日の詳細を開く',
    { status: 500, reason: 'INTERNAL' },
    '「表示できませんでした。もう一度お試しください」と「読み込み直す」が出て、押すとカレンダーを読み直す',
    { message: '表示できませんでした。もう一度お試しください', reloads: false, retry: true },
  );

  // ---- 月の確定・取り消し ----

  Scenario('管理者には確定していない月に「この月を確定する」が出る', ({ Given, Then }) => {
    Given('11月が確定していない状態で管理者の花子が画面を開く', async () => {
      setCalendar(MONTH);
      await openAs('admin');
    });
    Then('月の見出しの近くに「この月を確定する」が出て、「確定を取り消す」は出ない', () => {
      expect(screen.getByTestId('month-confirm-button')).toHaveTextContent('この月を確定する');
      expect(screen.queryByTestId('month-unconfirm-button')).toBeNull();
    });
  });

  Scenario('子供には確定のボタンが出ない', ({ Given, Then }) => {
    Given('11月が確定していない状態で子供の太郎が画面を開く', async () => {
      setCalendar(MONTH);
      await openAs('child');
    });
    Then('月の見出しの近くに確定のボタンも取り消しのボタンも出ない', () => {
      expect(screen.queryByTestId('month-confirm-button')).toBeNull();
      expect(screen.queryByTestId('month-unconfirm-button')).toBeNull();
    });
  });

  Scenario(
    '未の担当があるとき、確定の確認に件数の注意が出て、「はい」で確定済みになる',
    ({ Given, When, Then }) => {
      Given('11月に「未」の担当が 2 件ある状態で管理者の花子が画面を開く', async () => {
        seedDuty({ date: '2026-11-10' });
        seedDuty({ date: '2026-11-12' });
        seedDuty({ date: '2026-11-13', status: 'done' });
        await openAs('admin');
      });
      When('花子が「この月を確定する」を押す', () => {
        fireEvent.click(screen.getByTestId('month-confirm-button'));
      });
      Then(
        '確認に「未の担当が 2 件あります」が出て、「はい」で PUT confirmation が送られ「確定済み」が出て読み直す',
        async () => {
          const dialog = await screen.findByTestId('month-confirm-dialog');
          expect(dialog).toHaveTextContent('未の担当が 2 件あります');
          const before = calendarReads();
          fireEvent.click(screen.getByTestId('month-confirm-confirm-button'));
          await waitFor(() =>
            expect(callsTo('PUT', `/v1/months/${MONTH}/confirmation`)).toHaveLength(1),
          );
          await waitFor(() => expect(screen.getByTestId('confirmed-label')).toBeInTheDocument());
          expect(calendarReads()).toBeGreaterThan(before);
          expect(screen.queryByTestId('month-confirm-dialog')).toBeNull();
          expect(screen.getByTestId('month-unconfirm-button')).toBeInTheDocument();
        },
      );
    },
  );

  Scenario('未の担当がないとき、確定の確認に件数の注意は出ない', ({ Given, When, Then }) => {
    Given('11月に「済」の担当だけがある状態で管理者の花子が画面を開く', async () => {
      seedDuty({ date: '2026-11-10', status: 'done' });
      await openAs('admin');
    });
    When('花子が「この月を確定する」を押す', () => {
      fireEvent.click(screen.getByTestId('month-confirm-button'));
    });
    Then('確認に「確定すると変更できなくなります」が出て件数の注意は出ない', async () => {
      const dialog = await screen.findByTestId('month-confirm-dialog');
      expect(dialog).toHaveTextContent('確定すると変更できなくなります');
      expect(dialog).not.toHaveTextContent('未の担当が');
    });
  });

  Scenario(
    '確定済みの月で「確定を取り消す」を押すと確認が出て、「はい」で確定済みが消える',
    ({ Given, When, Then }) => {
      Given('11月が確定している状態で管理者の花子が画面を開く', async () => {
        setCalendar(MONTH, { confirmed: true });
        await openAs('admin');
      });
      When('花子が「確定を取り消す」を押す', () => {
        expect(screen.getByTestId('confirmed-label')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('month-unconfirm-button'));
      });
      Then(
        '確認に取り消しの問いかけが出て、「はい」で DELETE confirmation が送られ「確定済み」が消えて読み直す',
        async () => {
          const dialog = await screen.findByTestId('month-confirm-dialog');
          expect(dialog).toHaveTextContent('の確定を取り消しますか？');
          const before = calendarReads();
          fireEvent.click(screen.getByTestId('month-confirm-confirm-button'));
          await waitFor(() =>
            expect(callsTo('DELETE', `/v1/months/${MONTH}/confirmation`)).toHaveLength(1),
          );
          await waitFor(() => expect(screen.queryByTestId('confirmed-label')).toBeNull());
          expect(calendarReads()).toBeGreaterThan(before);
          expect(screen.getByTestId('month-confirm-button')).toBeInTheDocument();
        },
      );
    },
  );

  Scenario('前の月に移った先の月にも確定のボタンが出る', ({ Given, Then }) => {
    Given('11月が確定していない状態で管理者の花子が画面を開き、前の月に移る', async () => {
      setCalendar(MONTH);
      setCalendar('2026-10');
      await openAs('admin');
      fireEvent.click(screen.getByRole('button', { name: '前の月' }));
      await waitFor(() =>
        expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026年10月'),
      );
    });
    Then(
      '10月の見出しの近くに「この月を確定する」が出て、押すと 10月への PUT confirmation が送られる',
      async () => {
        const button = await screen.findByTestId('month-confirm-button');
        fireEvent.click(button);
        await screen.findByTestId('month-confirm-dialog');
        fireEvent.click(screen.getByTestId('month-confirm-confirm-button'));
        await waitFor(() =>
          expect(callsTo('PUT', '/v1/months/2026-10/confirmation')).toHaveLength(1),
        );
      },
    );
  });

  Scenario('確定の失敗では文言が出る', ({ Given, When, Then }) => {
    Given(
      '11月が確定していない状態で、確定が 500 INTERNAL になる状態で管理者の花子が画面を開く',
      async () => {
        setCalendar(MONTH);
        fake.confirmationAnswers = [{ status: 500, body: { error: { reason: 'INTERNAL' } } }];
        await openAs('admin');
      },
    );
    When('花子が「この月を確定する」を押し、確認で「はい」を押す', async () => {
      fireEvent.click(screen.getByTestId('month-confirm-button'));
      fireEvent.click(await screen.findByTestId('month-confirm-confirm-button'));
    });
    Then('確定のエラーの文言が出る', async () => {
      expect(await screen.findByTestId('month-confirm-error')).toHaveTextContent(
        '表示できませんでした。もう一度お試しください',
      );
      expect(screen.queryByTestId('confirmed-label')).toBeNull();
    });
  });

  // ---- 文字として出す ----

  Scenario('種類の名前・子供の名前の中のタグは文字として出る', ({ Given, When, Then }) => {
    Given(
      '種類の名前が「<b>皿洗い</b>」、子供の表示名が「<i>太郎</i>」の「済」の担当がある状態で管理者の花子が 11月15日の詳細を開く',
      async () => {
        fake.choreTypes = [choreType({ choreTypeId: DISHES_ID, name: '<b>皿洗い</b>' })];
        const target = duty({
          date: DAY,
          choreTypeId: DISHES_ID,
          childUserId: TARO.userId,
          status: 'done',
        });
        setCalendar(MONTH, {
          duties: [target],
          children: [{ userId: TARO.userId, displayName: '<i>太郎</i>' }],
        });
        await openAs('admin');
        await openDetail(DAY);
      },
    );
    When('花子が「取り消す」を押す', async () => {
      await pressAction('取り消す');
    });
    Then('確認にタグの文字がそのまま出て、太字や斜体の要素は作られない', async () => {
      const dialog = await screen.findByTestId('status-change-dialog');
      expect(dialog).toHaveTextContent('<b>皿洗い</b> <i>太郎</i>');
      expect(dialog.querySelector('b')).toBeNull();
      expect(dialog.querySelector('i')).toBeNull();
    });
  });
});
