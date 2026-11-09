import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import {
  CALENDAR_LOAD_FAILED_RETRY,
  MESSAGES,
  MONTH_CONFIRMED_LABEL,
  NOTIFICATION_GROUP_HOWTO,
  NO_ASSIGNMENT_MESSAGE,
  NO_DUTY_LABEL,
} from '@housework/shared';
import { App } from '../../src/App';
import {
  CHILDREN,
  DISHES_ID,
  GARBAGE_ID,
  JIRO,
  TARO,
  callsTo,
  choreType,
  duty,
  fake,
  installFakeApi,
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

const feature = await loadFeature('packages/frontend/test/u5-assignment-calendar/calendar.feature');

// 手順（Given/When/Then）ごとに別のテストとして動き、その間に vi.fn の呼び出し記録が消えるため、
// 画面が動いた先の要素は普通の配列に残す
const scrolledTo: Element[] = [];
function recordScroll(this: Element): void {
  scrolledTo.push(this);
}

async function openAs(role: 'admin' | 'child'): Promise<void> {
  fake.role = role;
  render(<App />);
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
}

async function monthShown(text: string): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('calendar-month')).toHaveTextContent(text));
}

async function listShown(): Promise<HTMLElement[]> {
  return await waitFor(() => {
    const rows = screen.getAllByTestId('day-row');
    expect(rows.length).toBeGreaterThan(0);
    return rows;
  });
}

const rowOf = (date: string): HTMLElement => {
  const row = screen.getAllByTestId('day-row').find((r) => r.getAttribute('data-date') === date);
  if (!row) throw new Error(`${date} の行がありません`);
  return row;
};

const pressRow = (date: string): void => {
  fireEvent.click(within(rowOf(date)).getByRole('button'));
};

const pressNext = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '次の月' }));
};
const pressPrev = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '前の月' }));
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 11月20日に太郎さんの「未」の皿洗いがある状態にする */
function seedChangeableDuty() {
  const target = duty({ date: '2026-11-20', choreTypeId: DISHES_ID, childUserId: TARO.userId });
  setCalendar('2026-11', { duties: [target] });
  return target;
}

async function changeChildToJiro(date: string): Promise<void> {
  await listShown();
  pressRow(date);
  fireEvent.click(await screen.findByTestId('change-duty-button'));
  fireEvent.change(screen.getByTestId('change-child-select'), { target: { value: JIRO.userId } });
  fireEvent.click(screen.getByTestId('change-child-confirm-button'));
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    resetFake();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
    scrolledTo.length = 0;
    Element.prototype.scrollIntoView = recordScroll;
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

  Scenario('アプリを開くと今月の日ごとの縦の一覧に担当が全部出る', ({ Given, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に皿洗いとごみ出しの担当がある状態で管理者の花子さんが画面を開く',
      async () => {
        setCalendar('2026-11', {
          duties: [
            duty({ date: '2026-11-10', choreTypeId: DISHES_ID, childUserId: TARO.userId }),
            duty({
              date: '2026-11-12',
              choreTypeId: GARBAGE_ID,
              childUserId: JIRO.userId,
              status: 'done',
            }),
            duty({
              date: '2026-11-16',
              choreTypeId: DISHES_ID,
              childUserId: JIRO.userId,
              status: 'skipped',
            }),
          ],
        });
        await openAs('admin');
      },
    );
    Then(
      '2026年11月の 30 日分の行が出て、担当が「皿洗い=太郎(未)」「ごみ出し=次郎(済)」「皿洗い=次郎(×)」のように状態の文字つきで出る',
      async () => {
        expect(await listShown()).toHaveLength(30);
        expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026年11月');
        expect(rowOf('2026-11-10')).toHaveTextContent('皿洗い=太郎(未)');
        expect(rowOf('2026-11-12')).toHaveTextContent('ごみ出し=次郎(済)');
        expect(rowOf('2026-11-16')).toHaveTextContent('皿洗い=次郎(×)');
      },
    );
  });

  Scenario('担当のない日には「担当なし」と出る', ({ Given, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月は 15 日にだけ担当がある状態で管理者の花子さんが画面を開く',
      async () => {
        setCalendar('2026-11', {
          duties: [duty({ date: '2026-11-15', choreTypeId: DISHES_ID, childUserId: TARO.userId })],
        });
        await openAs('admin');
      },
    );
    Then('担当のない 29 日分の行に「担当なし」と出る', async () => {
      await listShown();
      expect(screen.getAllByText(NO_DUTY_LABEL)).toHaveLength(29);
      expect(rowOf('2026-11-15')).not.toHaveTextContent(NO_DUTY_LABEL);
    });
  });

  Scenario('今月は裏側が返した今日の位置を見せる', ({ Given, Then }) => {
    Given(
      '端末の時計と裏側の今日が 2026年11月15日の状態で管理者の花子さんが画面を開く',
      async () => {
        setCalendar('2026-11');
        await openAs('admin');
      },
    );
    Then('15 日の行に今日の印が付き、その行まで 1 回だけ画面が動く', async () => {
      await listShown();
      const marks = screen.getAllByTestId('today-mark');
      expect(marks).toHaveLength(1);
      expect(rowOf('2026-11-15')).toContainElement(marks[0] as HTMLElement);
      await waitFor(() => expect(scrolledTo).toHaveLength(1));
      expect(rowOf('2026-11-15')).toContainElement(scrolledTo[0] as HTMLElement);
      // 再描画（別の日の詳細を開く）では、もう一度は動かない
      pressRow('2026-11-03');
      await wait(20);
      expect(scrolledTo).toHaveLength(1);
    });
  });

  Scenario(
    '月の境目で端末の時計と裏側の今日が食い違うときは、裏側の今日の月で 1 回だけ読み直す',
    ({ Given, Then }) => {
      Given(
        '端末の時計は 10 月で、裏側の今日は 2026年11月1日の状態で管理者の花子さんが画面を開く',
        async () => {
          vi.setSystemTime(new Date('2026-10-31T10:00:00.000Z'));
          fake.today = '2026-11-01';
          setCalendar('2026-10');
          setCalendar('2026-11');
          await openAs('admin');
        },
      );
      Then('10 月を要求したあと 11 月を 1 回だけ要求し直して、11 月の一覧が出る', async () => {
        await monthShown('2026年11月');
        expect(await listShown()).toHaveLength(30);
        const paths = fake.calls.filter((c) => c.path.endsWith('/calendar')).map((c) => c.path);
        expect(paths).toEqual(['/v1/months/2026-10/calendar', '/v1/months/2026-11/calendar']);
      });
    },
  );

  Scenario('確定した月には「確定済み」と出る', ({ Given, Then }) => {
    Given('2026年11月が確定している状態で管理者の花子さんが画面を開く', async () => {
      setCalendar('2026-11', { confirmed: true });
      await openAs('admin');
    });
    Then('月の見出しの近くに「確定済み」と出る', async () => {
      await listShown();
      expect(screen.getByTestId('confirmed-label')).toHaveTextContent(MONTH_CONFIRMED_LABEL);
    });
  });

  Scenario('前の月と次の月を押すとその月を読み直す', ({ Given, When, Then }) => {
    Given(
      '今日が 2026年11月15日で、10 月と 12 月にも担当がある状態で管理者の花子さんが画面を開く',
      async () => {
        for (const month of ['2026-10', '2026-11', '2026-12']) setCalendar(month);
        await openAs('admin');
      },
    );
    When('「前の月」を押し、続けて「次の月」を 2 回押す', async () => {
      await listShown();
      pressPrev();
      await monthShown('2026年10月');
      pressNext();
      await monthShown('2026年11月');
      pressNext();
      await monthShown('2026年12月');
    });
    Then('10 月と 12 月がそれぞれ要求され、最後は 2026年12月の一覧が出る', async () => {
      expect(callsTo('GET', '/v1/months/2026-10/calendar')).toHaveLength(1);
      expect(callsTo('GET', '/v1/months/2026-12/calendar')).toHaveLength(1);
      expect(await listShown()).toHaveLength(31);
    });
  });

  Scenario(
    '月を切り替えたとき、遅れて届いた古い月の応答は画面に出ない',
    ({ Given, When, Then }) => {
      let release: () => void = () => undefined;
      Given('12 月の応答が遅れる状態で管理者の花子さんが 11 月の画面を開く', async () => {
        setCalendar('2026-11');
        setCalendar('2026-12', {
          duties: [duty({ date: '2026-12-01', choreTypeId: DISHES_ID, childUserId: TARO.userId })],
        });
        fake.gates['2026-12'] = new Promise<void>((resolve) => {
          release = resolve;
        });
        await openAs('admin');
        await listShown();
      });
      When(
        '「次の月」を押してすぐ「前の月」を押し、そのあと遅れていた 12 月の応答が届く',
        async () => {
          pressNext();
          pressPrev();
          await monthShown('2026年11月');
          release();
          await wait(30);
        },
      );
      Then('画面は 2026年11月のままで、12 月の要求は取り消されている', async () => {
        expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026年11月');
        expect(await listShown()).toHaveLength(30);
        expect(screen.queryByText('皿洗い=太郎(未)')).toBeNull();
        const december = callsTo('GET', '/v1/months/2026-12/calendar');
        expect(december).toHaveLength(1);
        expect(december[0]?.signal?.aborted).toBe(true);
      });
    },
  );

  Scenario(
    '日付を押すと日の詳細に種類・子供・状態・時刻・記録した人が出る',
    ({ Given, When, Then }) => {
      Given(
        '11月10日に太郎さんが記録した「皿洗い」の担当がある状態で管理者の花子さんが画面を開く',
        async () => {
          setCalendar('2026-11', {
            duties: [
              duty({
                date: '2026-11-10',
                choreTypeId: DISHES_ID,
                childUserId: TARO.userId,
                status: 'done',
                recordedAt: '2026-11-10T09:30:00.000Z',
                recordedByName: '花子',
              }),
            ],
          });
          await openAs('admin');
        },
      );
      When('11月10日の行を押す', async () => {
        await listShown();
        pressRow('2026-11-10');
      });
      Then(
        '日の詳細に「皿洗い」「太郎」「済」と日本時間の「18:30」と記録した人「花子」が出る',
        async () => {
          const detail = await screen.findByTestId('day-detail');
          expect(detail).toHaveTextContent('11月10日');
          const item = within(detail).getByTestId('day-detail-duty');
          expect(within(item).getByTestId('detail-chore')).toHaveTextContent('皿洗い');
          expect(within(item).getByTestId('detail-child')).toHaveTextContent('太郎');
          expect(within(item).getByTestId('detail-status')).toHaveTextContent('済');
          expect(within(item).getByTestId('detail-time')).toHaveTextContent('18:30');
          expect(within(item).getByTestId('detail-recorder')).toHaveTextContent('花子');
        },
      );
    },
  );

  Scenario('管理者は「未」の担当の子供を変えられる', ({ Given, When, Then }) => {
    let target: ReturnType<typeof seedChangeableDuty>;
    Given(
      '11月20日に太郎さんの「未」の皿洗いがある状態で管理者の花子さんが画面を開く',
      async () => {
        target = seedChangeableDuty();
        await openAs('admin');
      },
    );
    When('11月20日の詳細で「担当を変える」を押し、子供に次郎さんを選んで変更する', async () => {
      await changeChildToJiro('2026-11-20');
    });
    Then('担当の変更の要求が送られ、一覧の 11月20日が「皿洗い=次郎(未)」に差し替わる', async () => {
      await waitFor(() => expect(rowOf('2026-11-20')).toHaveTextContent('皿洗い=次郎(未)'));
      const [patch] = callsTo('PATCH', `/v1/duties/${target.dutyId}`);
      expect(patch?.body).toEqual({ childUserId: JIRO.userId });
      expect(patch?.headers.get('Authorization')).toBe('Bearer session-token-1');
      expect(screen.queryByTestId('change-child-select')).toBeNull();
    });
  });

  Scenario(
    '変更の直前に記録が入ると、断られた理由が出て担当は元のままである',
    ({ Given, When, Then }) => {
      Given(
        '11月20日に太郎さんの「未」の皿洗いがあるが、変更の直前に記録されていた状態で管理者の花子さんが画面を開く',
        async () => {
          seedChangeableDuty();
          fake.patchAnswers = [{ status: 409, body: { error: { reason: 'DUTY_NOT_TODO' } } }];
          await openAs('admin');
        },
      );
      When('11月20日の詳細で「担当を変える」を押し、子供に次郎さんを選んで変更する', async () => {
        await changeChildToJiro('2026-11-20');
      });
      Then('「記録を取り消してから変更してください」と出て、担当は元のままである', async () => {
        expect(await screen.findByTestId('change-error')).toHaveTextContent(MESSAGES.DUTY_NOT_TODO);
        expect(rowOf('2026-11-20')).toHaveTextContent('皿洗い=太郎(未)');
      });
    },
  );

  Scenario('確定した月の担当を変えようとすると理由が出る', ({ Given, When, Then }) => {
    Given(
      '11月20日に太郎さんの「未」の皿洗いがあるが、変更の直前に月が確定していた状態で管理者の花子さんが画面を開く',
      async () => {
        seedChangeableDuty();
        fake.patchAnswers = [{ status: 409, body: { error: { reason: 'MONTH_CONFIRMED' } } }];
        await openAs('admin');
      },
    );
    When('11月20日の詳細で「担当を変える」を押し、子供に次郎さんを選んで変更する', async () => {
      await changeChildToJiro('2026-11-20');
    });
    Then('「この月は確定済みです」と出る', async () => {
      expect(await screen.findByTestId('change-error')).toHaveTextContent(MESSAGES.MONTH_CONFIRMED);
    });
  });

  Scenario('子供には「担当を変える」も割り当てのボタンも出ない', ({ Given, When, Then }) => {
    Given('11月20日に太郎さんの「未」の皿洗いがある状態で子供の太郎さんが画面を開く', async () => {
      seedChangeableDuty();
      await openAs('child');
    });
    When('11月20日の行を押す', async () => {
      await listShown();
      pressRow('2026-11-20');
    });
    Then('日の詳細に担当は出るが「担当を変える」は出ず、「割り当てを変える」も出ない', async () => {
      const detail = await screen.findByTestId('day-detail');
      expect(within(detail).getByTestId('detail-chore')).toHaveTextContent('皿洗い');
      expect(screen.queryByTestId('change-duty-button')).toBeNull();
      expect(screen.queryByTestId('edit-assignment-button')).toBeNull();
      expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
    });
  });

  Scenario(
    '割り当てがない月には案内が出て、管理者で今月か来月のときだけ入力のボタンが出る',
    ({ Given, Then, And }) => {
      Given(
        '今日が 2026年11月15日で、どの月にも割り当てがない状態で管理者の花子さんが画面を開く',
        () => openAs('admin'),
      );
      Then('「この月の割り当てはまだありません」と「割り当てを入力する」が出る', async () => {
        expect(await screen.findByTestId('no-assignment-message')).toHaveTextContent(
          NO_ASSIGNMENT_MESSAGE,
        );
        expect(screen.getByTestId('enter-assignment-button')).toHaveTextContent(
          '割り当てを入力する',
        );
        expect(screen.queryAllByTestId('day-row')).toHaveLength(0);
      });
      And('「次の月」を押した 12 月にも「割り当てを入力する」が出る', async () => {
        pressNext();
        await monthShown('2026年12月');
        expect(await screen.findByTestId('enter-assignment-button')).toBeInTheDocument();
      });
      And(
        'さらに「次の月」を押した 2027年1月には案内だけが出て「割り当てを入力する」は出ない',
        async () => {
          pressNext();
          await monthShown('2027年1月');
          expect(await screen.findByTestId('no-assignment-message')).toBeInTheDocument();
          expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
        },
      );
    },
  );

  Scenario('割り当てがない月の案内は子供には入力のボタンなしで出る', ({ Given, Then }) => {
    Given('今日が 2026年11月15日で、どの月にも割り当てがない状態で子供の太郎さんが画面を開く', () =>
      openAs('child'),
    );
    Then(
      '「この月の割り当てはまだありません」だけが出て「割り当てを入力する」は出ない',
      async () => {
        expect(await screen.findByTestId('no-assignment-message')).toHaveTextContent(
          NO_ASSIGNMENT_MESSAGE,
        );
        expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
      },
    );
  });

  Scenario('割り当てがある月の管理者には「割り当てを変える」が出る', ({ Given, Then }) => {
    Given(
      '今日が 2026年11月15日で、11月に割り当てがある状態で管理者の花子さんが画面を開く',
      async () => {
        setCalendar('2026-11');
        await openAs('admin');
      },
    );
    Then('「割り当てを変える」が出て「割り当てを入力する」は出ない', async () => {
      expect(await screen.findByTestId('edit-assignment-button')).toHaveTextContent(
        '割り当てを変える',
      );
      expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
    });
  });

  Scenario(
    '読み込みに失敗すると案内と「読み込み直す」が出て、押すと直る',
    ({ Given, Then, And }) => {
      Given('カレンダーの読み込みが失敗する状態で管理者の花子さんが画面を開く', async () => {
        fake.calendarFails = true;
        await openAs('admin');
      });
      Then('「表示できませんでした。もう一度お試しください」と「読み込み直す」が出る', async () => {
        const retry = await screen.findByTestId('error-retry');
        expect(retry).toHaveTextContent('表示できませんでした。もう一度お試しください');
        expect(screen.getByTestId('retry-button')).toHaveTextContent(CALENDAR_LOAD_FAILED_RETRY);
      });
      And('読み込めるようになってから「読み込み直す」を押すと 11 月の一覧が出る', async () => {
        fake.calendarFails = false;
        setCalendar('2026-11');
        fireEvent.click(screen.getByTestId('retry-button'));
        expect(await listShown()).toHaveLength(30);
        expect(screen.queryByTestId('error-retry')).toBeNull();
      });
    },
  );

  Scenario('種類の名前や子供の名前の中のタグは文字として出る', ({ Given, Then }) => {
    Given(
      '種類の名前が「<b>皿洗い</b>」の担当がある状態で管理者の花子さんが画面を開く',
      async () => {
        fake.choreTypes = [choreType({ choreTypeId: DISHES_ID, name: '<b>皿洗い</b>' })];
        setCalendar('2026-11', {
          duties: [duty({ date: '2026-11-10', choreTypeId: DISHES_ID, childUserId: TARO.userId })],
        });
        await openAs('admin');
      },
    );
    Then('一覧にタグの文字がそのまま出て、太字の要素は作られない', async () => {
      await listShown();
      expect(rowOf('2026-11-10')).toHaveTextContent('<b>皿洗い</b>=太郎(未)');
      expect(document.querySelector('b')).toBeNull();
    });
  });

  Scenario('家族の設定への入口とお知らせ先の案内がカレンダーの画面に残る', ({ Given, Then }) => {
    Given(
      '今日が 2026年11月15日で、お知らせ先のない状態で管理者の花子さんが画面を開く',
      async () => {
        setCalendar('2026-11');
        await openAs('admin');
      },
    );
    Then('家族の名前「田中家」と「家族の設定」のボタンとお知らせ先の案内が出る', async () => {
      expect(screen.getByTestId('family-name')).toHaveTextContent('田中家');
      expect(screen.getByTestId('open-settings-button')).toHaveTextContent('家族の設定');
      expect(await screen.findByTestId('notification-group-hint')).toHaveTextContent(
        NOTIFICATION_GROUP_HOWTO,
      );
      expect(CHILDREN).toHaveLength(2);
    });
  });
});
