import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import type { AssignmentRule } from '@housework/shared';
import {
  ASSIGNMENT_SAVE_FAILED,
  ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE,
  COPY_LAST_MONTH_NONE,
  COPY_LAST_MONTH_SKIPPED_INACTIVE,
  MESSAGES,
  OVERWRITE_CONFIRM_HEADING,
} from '@housework/shared';
import { App } from '../../src/App';
import {
  FAKE_CHANGES_HASH,
  FAKE_CHANGES_HASH_2,
  FAKE_DUTY_ID_1,
  FAKE_DUTY_ID_2,
} from '../fixtures/fakeSecrets';
import {
  DISHES_ID,
  GARBAGE_ID,
  JIRO,
  TARO,
  callsTo,
  duty,
  fake,
  installFakeApi,
  makeCalendar,
  resetFake,
  setCalendar,
} from './helpers/fakeCalendarApi';

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

const feature = await loadFeature(
  'packages/frontend/test/u5-assignment-calendar/assignment.feature',
);

const PUT_PATH = '/v1/months/2026-11/assignment';
const MONDAY = 1;
const WEDNESDAY = 3;
const THURSDAY = 4;

const rule = (choreTypeId: string, childUserId: string, weekdays: number[]): AssignmentRule => ({
  choreTypeId,
  childUserId,
  weekdays,
});

async function openCalendar(role: 'admin' | 'child'): Promise<void> {
  fake.role = role;
  render(<App />);
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
}

async function openEditor(buttonTestId = 'enter-assignment-button'): Promise<void> {
  fireEvent.click(await screen.findByTestId(buttonTestId));
  await screen.findByTestId('assignment-page');
  await screen.findAllByTestId('chore-section');
}

const sectionOf = (name: string): HTMLElement => {
  const found = screen
    .getAllByTestId('chore-section')
    .find((s) => within(s).getByTestId('chore-section-name').textContent === name);
  if (!found) throw new Error(`「${name}」の入力欄がありません`);
  return found;
};

function addRow(choreName: string, child: { userId: string }, weekdays: number[]): void {
  const section = sectionOf(choreName);
  fireEvent.click(within(section).getByTestId('add-row-button'));
  const rows = within(section).getAllByTestId('rule-row');
  const row = rows[rows.length - 1] as HTMLElement;
  fireEvent.change(within(row).getByTestId('child-select'), { target: { value: child.userId } });
  for (const weekday of weekdays) fireEvent.click(within(row).getByTestId(`weekday-${weekday}`));
}

const pressSave = (): void => {
  fireEvent.click(screen.getByTestId('save-assignment-button'));
};

/** 11月に割り当てがなく、入力欄を開く */
async function openEmptyMonthEditor(): Promise<void> {
  await openCalendar('admin');
  await openEditor();
}

const putCalls = () => callsTo('PUT', PUT_PATH);

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    resetFake();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
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

  Scenario('「割り当てを入力する」で使う種類ごとの入力欄が出る', ({ Given, When, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に割り当てがない状態で管理者の花子さんがカレンダーを開く',
      async () => {
        fake.choreTypes.push({
          choreTypeId: FAKE_DUTY_ID_2,
          name: '洗濯',
          unitPrice: 30,
          active: false,
          createdAt: '2026-11-02T00:00:00.000Z',
          updatedAt: '2026-11-02T00:00:00.000Z',
        });
        await openCalendar('admin');
      },
    );
    When('「割り当てを入力する」を押す', () => openEditor());
    Then(
      '「使う」の種類「皿洗い」と「ごみ出し」ごとの入力欄が出て、使わない種類の入力欄は出ない',
      () => {
        const names = screen.getAllByTestId('chore-section-name').map((n) => n.textContent);
        expect(names).toEqual(['皿洗い', 'ごみ出し']);
        expect(screen.getByTestId('assignment-page')).toHaveTextContent('2026年11月');
      },
    );
  });

  Scenario(
    '今の割り当てに使わない種類があれば、印をつけて出し、外すよう案内する',
    ({ Given, When, Then }) => {
      Given(
        '11月の割り当てに、今は使わない「ごみ出し」の行がある状態で管理者の花子さんがカレンダーを開く',
        async () => {
          fake.choreTypes[1] = { ...fake.choreTypes[1]!, active: false };
          setCalendar('2026-11');
          fake.assignments['2026-11'] = {
            month: '2026-11',
            exists: true,
            rules: [rule(DISHES_ID, TARO.userId, [MONDAY]), rule(GARBAGE_ID, JIRO.userId, [3])],
          };
          await openCalendar('admin');
        },
      );
      When('「割り当てを変える」を押す', () => openEditor('edit-assignment-button'));
      Then(
        '「ごみ出し」の入力欄に「使わない」の印と外すよう促す案内が出て、行の入力も残っている',
        () => {
          const section = sectionOf('ごみ出し');
          expect(within(section).getByTestId('inactive-mark')).toHaveTextContent('使わない');
          expect(within(section).getByTestId('inactive-note')).toHaveTextContent(
            '使わないお手伝いです。割り当てから外してください',
          );
          const rows = within(section).getAllByTestId('rule-row');
          expect(rows).toHaveLength(1);
          expect(within(rows[0] as HTMLElement).getByTestId('child-select')).toHaveValue(
            JIRO.userId,
          );
          expect(within(sectionOf('皿洗い')).queryByTestId('inactive-mark')).toBeNull();
        },
      );
    },
  );

  Scenario('子供と曜日を選び、1 つの種類に子供ごとの行を足せる', ({ Given, When, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に割り当てがない状態で管理者の花子さんがカレンダーを開く',
      () => openCalendar('admin'),
    );
    When(
      '「割り当てを入力する」を押し、「皿洗い」に太郎さんの月曜と木曜、次郎さんの水曜の行を足す',
      async () => {
        await openEditor();
        addRow('皿洗い', TARO, [MONDAY, THURSDAY]);
        addRow('皿洗い', JIRO, [WEDNESDAY]);
      },
    );
    Then('「皿洗い」の入力欄に 2 行が並び、選んだ子供と曜日がそのまま入っている', () => {
      const rows = within(sectionOf('皿洗い')).getAllByTestId('rule-row');
      expect(rows).toHaveLength(2);
      const [first, second] = rows as [HTMLElement, HTMLElement];
      expect(within(first).getByTestId('child-select')).toHaveValue(TARO.userId);
      expect(within(first).getByTestId(`weekday-${MONDAY}`)).toBeChecked();
      expect(within(first).getByTestId(`weekday-${THURSDAY}`)).toBeChecked();
      expect(within(first).getByTestId(`weekday-${WEDNESDAY}`)).not.toBeChecked();
      expect(within(second).getByTestId('child-select')).toHaveValue(JIRO.userId);
      expect(within(second).getByTestId(`weekday-${WEDNESDAY}`)).toBeChecked();
      expect(within(sectionOf('ごみ出し')).queryAllByTestId('rule-row')).toHaveLength(0);
    });
  });

  Scenario('「先月と同じにする」で先月の割り当てが入る', ({ Given, When, Then }) => {
    Given(
      '10月に太郎さんの月曜と木曜の「皿洗い」の割り当てがある状態で管理者の花子さんが 11月の入力欄を開く',
      async () => {
        fake.assignments['2026-10'] = {
          month: '2026-10',
          exists: true,
          rules: [rule(DISHES_ID, TARO.userId, [THURSDAY, MONDAY])],
        };
        await openEmptyMonthEditor();
      },
    );
    When('「先月と同じにする」を押す', async () => {
      fireEvent.click(screen.getByTestId('copy-last-month-button'));
      await waitFor(() =>
        expect(within(sectionOf('皿洗い')).getAllByTestId('rule-row')).toHaveLength(1),
      );
    });
    Then('「皿洗い」に太郎さんの月曜と木曜の行が入り、保存の要求はまだ送られていない', () => {
      const row = within(sectionOf('皿洗い')).getByTestId('rule-row');
      expect(within(row).getByTestId('child-select')).toHaveValue(TARO.userId);
      expect(within(row).getByTestId(`weekday-${MONDAY}`)).toBeChecked();
      expect(within(row).getByTestId(`weekday-${THURSDAY}`)).toBeChecked();
      expect(callsTo('GET', '/v1/months/2026-10/assignment')).toHaveLength(1);
      expect(putCalls()).toHaveLength(0);
      expect(screen.queryByTestId('copy-result')).toBeNull();
    });
  });

  Scenario(
    '先月の割り当てのうち使わない種類と消えた種類の行は入れない',
    ({ Given, When, Then }) => {
      Given(
        '10月に使わない「ごみ出し」の行と、もうない種類の行がある状態で管理者の花子さんが 11月の入力欄を開く',
        async () => {
          fake.choreTypes[1] = { ...fake.choreTypes[1]!, active: false };
          fake.assignments['2026-10'] = {
            month: '2026-10',
            exists: true,
            rules: [
              rule(DISHES_ID, TARO.userId, [MONDAY]),
              rule(GARBAGE_ID, JIRO.userId, [WEDNESDAY]),
              rule(FAKE_DUTY_ID_1, JIRO.userId, [THURSDAY]),
            ],
          };
          await openEmptyMonthEditor();
        },
      );
      When('「先月と同じにする」を押す', () => {
        fireEvent.click(screen.getByTestId('copy-last-month-button'));
      });
      Then('「使わないお手伝いは入れませんでした」と出て、使う種類の行だけが入る', async () => {
        expect(await screen.findByTestId('copy-result')).toHaveTextContent(
          COPY_LAST_MONTH_SKIPPED_INACTIVE,
        );
        expect(within(sectionOf('皿洗い')).getAllByTestId('rule-row')).toHaveLength(1);
        expect(screen.queryAllByTestId('rule-row')).toHaveLength(1);
      });
    },
  );

  Scenario('先月の割り当てがなければ、そう伝える', ({ Given, When, Then }) => {
    Given('先月の割り当てがない状態で管理者の花子さんが 11月の入力欄を開く', () =>
      openEmptyMonthEditor(),
    );
    When('「先月と同じにする」を押す', () => {
      fireEvent.click(screen.getByTestId('copy-last-month-button'));
    });
    Then('「先月の割り当てはありません」と出て、入力欄は変わらない', async () => {
      expect(await screen.findByTestId('copy-result')).toHaveTextContent(COPY_LAST_MONTH_NONE);
      expect(screen.queryAllByTestId('rule-row')).toHaveLength(0);
    });
  });

  Scenario('「保存」で割り当てが送られ、カレンダーに戻って担当が出る', ({ Given, When, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に割り当てがない状態で管理者の花子さんがカレンダーを開く',
      () => {
        fake.saveAnswers = [
          {
            status: 200,
            body: makeCalendar('2026-11', {
              duties: [
                duty({ date: '2026-11-16', choreTypeId: DISHES_ID, childUserId: TARO.userId }),
              ],
            }),
          },
        ];
        return openCalendar('admin');
      },
    );
    When(
      '「割り当てを入力する」を押し、「皿洗い」に太郎さんの月曜と木曜の行を足して「保存」を押す',
      async () => {
        await openEditor();
        addRow('皿洗い', TARO, [MONDAY, THURSDAY]);
        pressSave();
      },
    );
    Then(
      '割り当てだけが保存の要求で送られ、カレンダーに戻って 11月の担当「皿洗い=太郎(未)」が出る',
      async () => {
        await screen.findByTestId('calendar-grid');
        expect(screen.queryByTestId('assignment-page')).toBeNull();
        const [put] = putCalls();
        expect(put?.body).toEqual({ rules: [rule(DISHES_ID, TARO.userId, [MONDAY, THURSDAY])] });
        expect(put?.headers.get('Authorization')).toBe('Bearer session-token-1');
        expect(screen.getByText('皿洗い=太郎(未)')).toBeInTheDocument();
        expect(screen.getByTestId('edit-assignment-button')).toBeInTheDocument();
      },
    );
  });

  Scenario(
    '同じ日の同じお手伝いに担当が 2 人いると、重なりがすべて並び入力は残る',
    ({ Given, When, Then }) => {
      Given(
        '保存すると 2 つの重なりが返る状態で管理者の花子さんが 11月の入力欄を開く',
        async () => {
          fake.saveAnswers = [
            {
              status: 422,
              body: {
                error: {
                  reason: 'ASSIGNMENT_OVERLAP',
                  details: {
                    overlaps: [
                      {
                        date: '2026-11-02',
                        weekday: 1,
                        choreTypeId: DISHES_ID,
                        childUserIds: [TARO.userId, JIRO.userId],
                      },
                      {
                        date: '2026-11-09',
                        weekday: 1,
                        choreTypeId: DISHES_ID,
                        childUserIds: [TARO.userId, JIRO.userId],
                      },
                    ],
                  },
                },
              },
            },
          ];
          await openEmptyMonthEditor();
        },
      );
      When('「皿洗い」に太郎さんと次郎さんの月曜の行を足して「保存」を押す', () => {
        addRow('皿洗い', TARO, [MONDAY]);
        addRow('皿洗い', JIRO, [MONDAY]);
        pressSave();
      });
      Then(
        '「11月2日(月) の皿洗いに担当が 2 人います」と「11月9日(月) の皿洗いに担当が 2 人います」が並び、入力欄は残っている',
        async () => {
          const items = await screen.findAllByTestId('overlap-item');
          expect(items.map((i) => i.textContent)).toEqual([
            '11月2日(月) の皿洗いに担当が 2 人います',
            '11月9日(月) の皿洗いに担当が 2 人います',
          ]);
          expect(within(sectionOf('皿洗い')).getAllByTestId('rule-row')).toHaveLength(2);
          expect(screen.queryByTestId('overwrite-dialog')).toBeNull();
        },
      );
    },
  );

  const overwriteAnswer = (hash: string, changes: unknown[]) => ({
    status: 409,
    body: {
      error: {
        reason: 'OVERWRITE_CONFIRMATION_REQUIRED',
        details: { changes, changesHash: hash },
      },
    },
  });
  const change = (date: string, from: string, to: string | null) => ({
    date,
    choreTypeId: DISHES_ID,
    fromChildUserId: from,
    toChildUserId: to,
  });

  Scenario(
    '上書きされる担当があると一覧が出て、確かめて保存し直すと印が送られる',
    ({ Given, When, Then, And }) => {
      Given('保存すると上書きの一覧が返る状態で管理者の花子さんが 11月の入力欄を開く', async () => {
        fake.saveAnswers = [
          overwriteAnswer(FAKE_CHANGES_HASH, [
            change('2026-11-22', TARO.userId, JIRO.userId),
            change('2026-11-29', JIRO.userId, null),
          ]),
          { status: 200, body: makeCalendar('2026-11') },
        ];
        await openEmptyMonthEditor();
      });
      When('「皿洗い」に太郎さんの月曜の行を足して「保存」を押す', () => {
        addRow('皿洗い', TARO, [MONDAY]);
        pressSave();
      });
      Then(
        '「次の担当が上書きされます」と「11月22日 皿洗い: 太郎 → 次郎」と「11月29日 皿洗い: 次郎 → なし」が出る',
        async () => {
          const dialog = await screen.findByTestId('overwrite-dialog');
          expect(dialog).toHaveTextContent(OVERWRITE_CONFIRM_HEADING);
          expect(
            within(dialog)
              .getAllByTestId('overwrite-change')
              .map((i) => i.textContent),
          ).toEqual(['11月22日 皿洗い: 太郎 → 次郎', '11月29日 皿洗い: 次郎 → なし']);
          expect(putCalls()).toHaveLength(1);
          expect(putCalls()[0]?.body).toEqual({ rules: [rule(DISHES_ID, TARO.userId, [MONDAY])] });
        },
      );
      And(
        '「この内容で保存する」を押すと、確かめの印を入れて同じ割り当てが送り直されカレンダーに戻る',
        async () => {
          fireEvent.click(screen.getByTestId('overwrite-confirm-button'));
          await screen.findByTestId('calendar-grid');
          expect(putCalls()).toHaveLength(2);
          expect(putCalls()[1]?.body).toEqual({
            rules: [rule(DISHES_ID, TARO.userId, [MONDAY])],
            confirmedChangesHash: FAKE_CHANGES_HASH,
          });
          expect(screen.queryByTestId('overwrite-dialog')).toBeNull();
        },
      );
    },
  );

  Scenario('「やめる」を押すと上書きの確かめを閉じて入力欄に戻る', ({ Given, When, Then }) => {
    Given('保存すると上書きの一覧が返る状態で管理者の花子さんが 11月の入力欄を開く', async () => {
      fake.saveAnswers = [
        overwriteAnswer(FAKE_CHANGES_HASH, [change('2026-11-22', TARO.userId, null)]),
      ];
      await openEmptyMonthEditor();
    });
    When(
      '「皿洗い」に太郎さんの月曜の行を足して「保存」を押し、上書きの一覧で「やめる」を押す',
      async () => {
        addRow('皿洗い', TARO, [MONDAY]);
        pressSave();
        await screen.findByTestId('overwrite-dialog');
        fireEvent.click(screen.getByTestId('overwrite-cancel-button'));
      },
    );
    Then(
      '上書きの一覧は閉じて入力欄に太郎さんの月曜の行が残り、送り直しの要求は送られていない',
      async () => {
        await waitFor(() => expect(screen.queryByTestId('overwrite-dialog')).toBeNull());
        const row = within(sectionOf('皿洗い')).getByTestId('rule-row');
        expect(within(row).getByTestId('child-select')).toHaveValue(TARO.userId);
        expect(within(row).getByTestId(`weekday-${MONDAY}`)).toBeChecked();
        expect(putCalls()).toHaveLength(1);
      },
    );
  });

  Scenario('送り直す前に担当が変わると、新しい一覧がもう一度出る', ({ Given, When, Then }) => {
    Given(
      '確かめのあとに担当が変わって、新しい上書きの一覧が返る状態で管理者の花子さんが 11月の入力欄を開く',
      async () => {
        fake.saveAnswers = [
          overwriteAnswer(FAKE_CHANGES_HASH, [change('2026-11-22', TARO.userId, JIRO.userId)]),
          overwriteAnswer(FAKE_CHANGES_HASH_2, [change('2026-11-08', JIRO.userId, null)]),
          { status: 200, body: makeCalendar('2026-11') },
        ];
        await openEmptyMonthEditor();
      },
    );
    When(
      '「皿洗い」に太郎さんの月曜の行を足して「保存」を押し、「この内容で保存する」を押す',
      async () => {
        addRow('皿洗い', TARO, [MONDAY]);
        pressSave();
        await screen.findByTestId('overwrite-dialog');
        fireEvent.click(screen.getByTestId('overwrite-confirm-button'));
      },
    );
    Then(
      '新しい一覧「11月8日 皿洗い: 次郎 → なし」が出て、もう一度押すと新しい印で送り直される',
      async () => {
        await waitFor(() =>
          expect(screen.getAllByTestId('overwrite-change').map((i) => i.textContent)).toEqual([
            '11月8日 皿洗い: 次郎 → なし',
          ]),
        );
        expect(putCalls()[1]?.body).toMatchObject({ confirmedChangesHash: FAKE_CHANGES_HASH });
        fireEvent.click(screen.getByTestId('overwrite-confirm-button'));
        await screen.findByTestId('calendar-grid');
        expect(putCalls()).toHaveLength(3);
        expect(putCalls()[2]?.body).toMatchObject({ confirmedChangesHash: FAKE_CHANGES_HASH_2 });
      },
    );
  });

  Scenario('確定した月や、入力できない月の理由が出る', ({ Given, When, Then, And }) => {
    Given(
      '保存すると月が確定していると返る状態で管理者の花子さんが 11月の入力欄を開く',
      async () => {
        fake.saveAnswers = [
          { status: 409, body: { error: { reason: 'MONTH_CONFIRMED' } } },
          { status: 422, body: { error: { reason: 'MONTH_NOT_EDITABLE' } } },
        ];
        await openEmptyMonthEditor();
      },
    );
    When('「皿洗い」に太郎さんの月曜の行を足して「保存」を押す', () => {
      addRow('皿洗い', TARO, [MONDAY]);
      pressSave();
    });
    Then('「この月は確定済みです」と出て、入力欄は残っている', async () => {
      expect(await screen.findByTestId('save-error')).toHaveTextContent(MESSAGES.MONTH_CONFIRMED);
      expect(within(sectionOf('皿洗い')).getAllByTestId('rule-row')).toHaveLength(1);
    });
    And(
      '次に「割り当てを入力できるのは今月と来月だけです」と返ると、その文言に替わる',
      async () => {
        pressSave();
        await waitFor(() =>
          expect(screen.getByTestId('save-error')).toHaveTextContent(MESSAGES.MONTH_NOT_EDITABLE),
        );
      },
    );
  });

  Scenario('保存が失敗したときは、もう一度保存するよう案内する', ({ Given, When, Then }) => {
    Given('保存すると 500 が返る状態で管理者の花子さんが 11月の入力欄を開く', async () => {
      fake.saveAnswers = [{ status: 500, body: { error: { reason: 'INTERNAL' } } }];
      await openEmptyMonthEditor();
    });
    When('「皿洗い」に太郎さんの月曜の行を足して「保存」を押す', () => {
      addRow('皿洗い', TARO, [MONDAY]);
      pressSave();
    });
    Then(
      '「保存できませんでした。もう一度保存してください」と一部が書き換わっていることがある旨が出る',
      async () => {
        const error = await screen.findByTestId('save-error');
        expect(error).toHaveTextContent(ASSIGNMENT_SAVE_FAILED);
        expect(error).toHaveTextContent(ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE);
      },
    );
  });

  Scenario('子供には割り当ての入口が出ない', ({ Given, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に割り当てがない状態で子供の太郎さんがカレンダーを開く',
      () => openCalendar('child'),
    );
    Then('「割り当てを入力する」も「割り当てを変える」も出ず、割り当ての要求も送られない', () => {
      expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
      expect(screen.queryByTestId('edit-assignment-button')).toBeNull();
      expect(fake.calls.filter((c) => c.path.endsWith('/assignment'))).toHaveLength(0);
    });
  });
});
