import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import {
  DISHES_ID,
  JIRO,
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

const feature = await loadFeature('packages/frontend/test/u6-recording/calendar-record.feature');

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

async function openAs(role: 'admin' | 'child'): Promise<void> {
  fake.role = role;
  render(<App />);
  await waitFor(() => expect(screen.queryByTestId('loading')).toBeNull());
  await screen.findByTestId('calendar-page');
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

const recordButtonIn = (date: string): HTMLElement | null =>
  within(rowOf(date)).queryByTestId('record-button');

const pressPrev = (): void => {
  fireEvent.click(screen.getByRole('button', { name: '前の月' }));
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 太郎（または指定の子供）の皿洗いの担当を 1 件、指定の月・日・状態で置く。 */
function seedDutyFor(
  month: string,
  date: string,
  over: Partial<Parameters<typeof duty>[0]> = {},
): ReturnType<typeof duty> {
  const target = duty({ date, choreTypeId: DISHES_ID, childUserId: TARO.userId, ...over });
  const existing = fake.calendars[month];
  setCalendar(month, {
    ...(existing ?? {}),
    duties: [...(existing?.duties ?? []), target],
  });
  return target;
}

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  BeforeEachScenario(() => {
    resetFake();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
    fake.today = '2026-11-15';
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

  const pressRecord = (date: string): void => {
    const button = recordButtonIn(date);
    if (!button) throw new Error(`${date} に「やった」ボタンがありません`);
    fireEvent.click(button);
  };
  const confirmRecord = async (): Promise<void> => {
    fireEvent.click(await screen.findByTestId('record-confirm-button'));
  };

  Scenario('自分の「未」の今日以前の担当に「やった」ボタンが出る', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがある状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        await openAs('child');
      },
    );
    Then('11月15日の行に太郎の「やった」ボタンが出る', async () => {
      await listShown();
      expect(recordButtonIn('2026-11-15')).toBeInTheDocument();
    });
  });

  Scenario(
    '「やった」を押すと確認が出て、記録すると「済」になり読み直す',
    ({ Given, When, Then }) => {
      let target: ReturnType<typeof duty>;
      Given(
        '今日が 11月15日で、太郎の今日の「未」の皿洗いがある状態で子供の太郎が画面を開く',
        async () => {
          target = seedDutyFor('2026-11', '2026-11-15');
          await openAs('child');
        },
      );
      When('太郎が「やった」を押し、確認で「記録する」を押す', async () => {
        await listShown();
        pressRecord('2026-11-15');
        await confirmRecord();
      });
      Then(
        'POST /record が version つきで送られ、太郎の担当が「済」になってカレンダーを読み直す',
        async () => {
          await waitFor(() => {
            const calls = callsTo('POST', `/v1/duties/${target.dutyId}/record`);
            expect(calls).toHaveLength(1);
            expect(calls[0]?.body).toEqual({ version: target.version });
          });
          // 記録のあとカレンダーを読み直す（GET カレンダーが 2 回以上）
          await waitFor(() =>
            expect(callsTo('GET', '/v1/months/2026-11/calendar').length).toBeGreaterThanOrEqual(2),
          );
        },
      );
    },
  );

  Scenario('「記録する」を押している間はボタンが押せない', ({ Given, When, Then }) => {
    let release: () => void = () => undefined;
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがあり、記録の応答が遅れる状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        await openAs('child');
        // 記録の fetch を待たせる（POST /record は fake.gates を見ないので、recordAnswers で代用せず fetch を直に遅らせる）
        const original = globalThis.fetch as typeof fetch;
        vi.stubGlobal(
          'fetch',
          vi.fn(async (input: string, init?: RequestInit) => {
            if ((init?.method ?? 'GET') === 'POST' && String(input).endsWith('/record')) {
              await new Promise<void>((resolve) => {
                release = resolve;
              });
            }
            return original(input, init);
          }),
        );
      },
    );
    When('太郎が「やった」を押し、確認で「記録する」を押す', async () => {
      await listShown();
      pressRecord('2026-11-15');
      await confirmRecord();
    });
    Then('記録する間はボタンが aria-busy で押せない', async () => {
      const confirm = await screen.findByTestId('record-confirm-button');
      await waitFor(() => expect(confirm).toHaveAttribute('aria-busy', 'true'));
      expect(confirm).toBeDisabled();
      release();
      await wait(10);
    });
  });

  Scenario('明日以降の担当には理由だけが出る（ボタンなし）', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、太郎の明日の「未」の皿洗いがある状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-16');
        await openAs('child');
      },
    );
    Then(
      '11月16日の行に「まだ来ていない日の担当は記録できません」が出て、「やった」ボタンは出ない',
      async () => {
        await listShown();
        expect(rowOf('2026-11-16')).toHaveTextContent('まだ来ていない日の担当は記録できません');
        expect(recordButtonIn('2026-11-16')).toBeNull();
      },
    );
  });

  Scenario('「×」の担当には理由が出る', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「×」の皿洗いがある状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15', { status: 'skipped' });
        await openAs('child');
      },
    );
    Then(
      '11月15日の行に「お母さんが『やらなかった』にしています」が出て、「やった」ボタンは出ない',
      async () => {
        await listShown();
        expect(rowOf('2026-11-15')).toHaveTextContent('お母さんが『やらなかった』にしています');
        expect(recordButtonIn('2026-11-15')).toBeNull();
      },
    );
  });

  Scenario('確定した月の担当には理由が出る', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、11月が確定していて太郎の今日の「未」の皿洗いがある状態で子供の太郎が画面を開く',
      async () => {
        const target = duty({
          date: '2026-11-15',
          choreTypeId: DISHES_ID,
          childUserId: TARO.userId,
        });
        setCalendar('2026-11', { confirmed: true, duties: [target] });
        await openAs('child');
      },
    );
    Then('11月15日の行に「この月は確定済みです」が出て、「やった」ボタンは出ない', async () => {
      await listShown();
      expect(within(rowOf('2026-11-15')).getByTestId('record-reason')).toHaveTextContent(
        'この月は確定済みです',
      );
      expect(recordButtonIn('2026-11-15')).toBeNull();
    });
  });

  Scenario('前の月の担当にも「やった」ボタンが出る（確定していない月）', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、太郎の 10月28日の「未」の皿洗いがある状態で子供の太郎が画面を開き、前の月に移る',
      async () => {
        setCalendar('2026-11');
        seedDutyFor('2026-10', '2026-10-28');
        await openAs('child');
        await listShown();
        pressPrev();
        await waitFor(() =>
          expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026年10月'),
        );
      },
    );
    Then('10月28日の行に太郎の「やった」ボタンが出る', async () => {
      await listShown();
      expect(recordButtonIn('2026-10-28')).toBeInTheDocument();
    });
  });

  Scenario('他の子供の担当にはボタンも理由も出ない', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、次郎の今日の「未」の皿洗いがある状態で子供の太郎が画面を開く',
      async () => {
        const target = duty({
          date: '2026-11-15',
          choreTypeId: DISHES_ID,
          childUserId: JIRO.userId,
        });
        setCalendar('2026-11', { duties: [target] });
        await openAs('child');
      },
    );
    Then('11月15日の行に「やった」ボタンも理由も出ない', async () => {
      await listShown();
      expect(recordButtonIn('2026-11-15')).toBeNull();
      expect(within(rowOf('2026-11-15')).queryByTestId('record-reason')).toBeNull();
    });
  });

  Scenario('管理者には「やった」ボタンが出ない', ({ Given, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがある状態で管理者の花子が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        await openAs('admin');
      },
    );
    Then('11月15日の行に「やった」ボタンは出ない', async () => {
      await listShown();
      expect(recordButtonIn('2026-11-15')).toBeNull();
    });
  });

  Scenario('409 DUTY_CHANGED のときは「変更されました」と読み直す', ({ Given, When, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがあり、記録が 409 DUTY_CHANGED になる状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        fake.recordAnswers = [{ status: 409, body: { error: { reason: 'DUTY_CHANGED' } } }];
        await openAs('child');
      },
    );
    When('太郎が「やった」を押し、確認で「記録する」を押す', async () => {
      await listShown();
      pressRecord('2026-11-15');
      await confirmRecord();
    });
    Then('「この担当は先に変更されました」が出て、カレンダーを読み直す', async () => {
      expect(await screen.findByTestId('record-error')).toHaveTextContent(
        'この担当は先に変更されました',
      );
      await waitFor(() =>
        expect(callsTo('GET', '/v1/months/2026-11/calendar').length).toBeGreaterThanOrEqual(2),
      );
    });
  });

  Scenario('409 DUTY_SKIPPED_BY_ADMIN のときは理由が出て読み直す', ({ Given, When, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがあり、記録が 409 DUTY_SKIPPED_BY_ADMIN になる状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        fake.recordAnswers = [
          { status: 409, body: { error: { reason: 'DUTY_SKIPPED_BY_ADMIN' } } },
        ];
        await openAs('child');
      },
    );
    When('太郎が「やった」を押し、確認で「記録する」を押す', async () => {
      await listShown();
      pressRecord('2026-11-15');
      await confirmRecord();
    });
    Then('「お母さんが『やらなかった』にしています」が出て、カレンダーを読み直す', async () => {
      expect(await screen.findByTestId('record-error')).toHaveTextContent(
        'お母さんが『やらなかった』にしています',
      );
      await waitFor(() =>
        expect(callsTo('GET', '/v1/months/2026-11/calendar').length).toBeGreaterThanOrEqual(2),
      );
    });
  });

  Scenario('500 INTERNAL のときは記録のエラーの文言が出る', ({ Given, When, Then }) => {
    Given(
      '今日が 11月15日で、太郎の今日の「未」の皿洗いがあり、記録が 500 INTERNAL になる状態で子供の太郎が画面を開く',
      async () => {
        seedDutyFor('2026-11', '2026-11-15');
        fake.recordAnswers = [{ status: 500, body: { error: { reason: 'INTERNAL' } } }];
        await openAs('child');
      },
    );
    When('太郎が「やった」を押し、確認で「記録する」を押す', async () => {
      await listShown();
      pressRecord('2026-11-15');
      await confirmRecord();
    });
    Then('「うまく記録できませんでした。もう一度お試しください」が出る', async () => {
      expect(await screen.findByTestId('record-error')).toHaveTextContent(
        'うまく記録できませんでした。もう一度お試しください',
      );
    });
  });

  Scenario('種類の名前の中のタグは文字として出る', ({ Given, When, Then }) => {
    Given(
      '今日が 11月15日で、種類の名前が「<b>皿洗い</b>」の太郎の今日の「未」の担当がある状態で子供の太郎が画面を開く',
      async () => {
        fake.choreTypes = [choreType({ choreTypeId: DISHES_ID, name: '<b>皿洗い</b>' })];
        seedDutyFor('2026-11', '2026-11-15');
        await openAs('child');
      },
    );
    When('太郎が「やった」を押す', async () => {
      await listShown();
      pressRecord('2026-11-15');
    });
    Then('確認の問いかけにタグの文字がそのまま出て、太字の要素は作られない', async () => {
      const dialog = await screen.findByTestId('record-confirm-dialog');
      expect(dialog).toHaveTextContent('<b>皿洗い</b>を記録しますか');
      expect(dialog.querySelector('b')).toBeNull();
    });
  });
});
