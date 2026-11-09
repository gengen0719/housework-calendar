import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { Authorized } from '../../src/hooks/useSession';
import { CalendarPage } from '../../src/pages/CalendarPage';
import {
  defaultCalendarResponse,
  emptyMonthCalendar,
} from '../u5-assignment-calendar/helpers/calendarStub';

const liff = vi.hoisted(() => ({
  init: vi.fn(),
  isInClient: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  getIDToken: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: liff }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 応答の today の月のカレンダーを返す差し替え（CalendarPage が月と今日の位置を応答だけで決めることの確かめ） */
function stubCalendar(today: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const match = /^\/v1\/months\/(\d{4}-\d{2})\/calendar$/.exec(url);
      if (!match) return new Response('{}', { status: 404 });
      return Response.json(emptyMonthCalendar(match[1] as string, today));
    }),
  );
}

const authorized: Authorized = (call) => call('token');

describe('CalendarPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('2026 年 11 月は 30 日分の行と今日の印が出る', async () => {
    stubCalendar('2026-11-15');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T03:00:00.000Z'));
    render(<CalendarPage familyName="田中家" authorized={authorized} />);
    const rows = await screen.findAllByTestId('day-row');
    vi.useRealTimers();
    expect(screen.getByTestId('calendar-month')).toHaveTextContent('2026年11月');
    expect(rows).toHaveLength(30);
    expect(rows[14]).toHaveAttribute('aria-current', 'date');
    expect(rows[14]).toHaveTextContent('15日(日)');
    expect(rows[0]).not.toHaveAttribute('aria-current');
  });

  it('31 日ある月（2026 年 7 月）は 31 日分の行が出る', async () => {
    stubCalendar('2026-07-01');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T03:00:00.000Z'));
    render(<CalendarPage familyName="田中家" authorized={authorized} />);
    const rows = await screen.findAllByTestId('day-row');
    vi.useRealTimers();
    expect(rows).toHaveLength(31);
    expect(rows[0]).toHaveTextContent('1日(水)');
  });
});

describe('家族を作る操作の識別子', () => {
  beforeEach(() => {
    liff.init.mockReset().mockResolvedValue(undefined);
    liff.isInClient.mockReset().mockReturnValue(true);
    liff.getIDToken.mockReset().mockReturnValue('id-token');
  });

  it('通信が切れて同じ名前で送り直したときは同じ識別子を使う', async () => {
    const keys: Array<string | null> = [];
    let attempt = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (url === '/v1/sessions') {
          return Response.json({ sessionToken: 't', expiresAt: 'x' }, { status: 201 });
        }
        if (url === '/v1/me') {
          return Response.json({ userId: 'u', displayName: '花子', family: null });
        }
        // U3: 管理者のカレンダーの枠はお知らせ先を読む。この確かめの対象ではない
        if (url === '/v1/family/notification-group') return Response.json(null);
        // U5: カレンダーの読み込みは、この確かめの対象ではない
        const calendar = defaultCalendarResponse(init?.method ?? 'GET', url);
        if (calendar) return calendar;
        keys.push(headers.get('Idempotency-Key'));
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return Response.json({ familyId: 'f', name: '田中家', role: 'admin' }, { status: 201 });
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByTestId('create-family-button'));
    fireEvent.change(screen.getByTestId('family-name-input'), { target: { value: '田中家' } });
    fireEvent.click(screen.getByTestId('save-family-button'));
    expect(await screen.findByTestId('family-name-error')).toHaveTextContent(
      '表示できませんでした。もう一度お試しください',
    );
    fireEvent.click(screen.getByTestId('save-family-button'));
    await waitFor(() => expect(screen.getByTestId('calendar-page')).toBeInTheDocument());

    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('名前を変えて保存し直したときは新しい識別子を使う', async () => {
    const keys: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/v1/sessions') {
          return Response.json({ sessionToken: 't', expiresAt: 'x' }, { status: 201 });
        }
        if (url === '/v1/me') {
          return Response.json({ userId: 'u', displayName: '花子', family: null });
        }
        keys.push(new Headers(init?.headers).get('Idempotency-Key'));
        return Response.json({ error: { reason: 'INVALID_FAMILY_NAME' } }, { status: 422 });
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByTestId('create-family-button'));
    const input = screen.getByTestId('family-name-input');
    fireEvent.change(input, { target: { value: ' ' } });
    fireEvent.click(screen.getByTestId('save-family-button'));
    await screen.findByTestId('family-name-error');
    fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('save-family-button'));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('友だちでなくなっていた人が保存すると友だち登録の案内に切り替わる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/v1/sessions') {
          return Response.json({ sessionToken: 't', expiresAt: 'x' }, { status: 201 });
        }
        if (url === '/v1/me') {
          return Response.json({ userId: 'u', displayName: '花子', family: null });
        }
        return Response.json({ error: { reason: 'NOT_FRIEND' } }, { status: 403 });
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByTestId('create-family-button'));
    fireEvent.change(screen.getByTestId('family-name-input'), { target: { value: '田中家' } });
    fireEvent.click(screen.getByTestId('save-family-button'));
    expect(await screen.findByTestId('register-page')).toBeInTheDocument();
  });

  it('401 が続くときは読み込み直す画面になる（取り直しは 1 回だけ）', async () => {
    const fn = vi.fn(async (url: string) => {
      if (url === '/v1/sessions') {
        return Response.json({ sessionToken: 't', expiresAt: 'x' }, { status: 201 });
      }
      return Response.json({ error: { reason: 'UNAUTHENTICATED' } }, { status: 401 });
    });
    vi.stubGlobal('fetch', fn);
    render(<App />);
    expect(await screen.findByTestId('error-retry')).toBeInTheDocument();
    expect(fn.mock.calls.filter(([u]) => u === '/v1/sessions')).toHaveLength(2);
    expect(fn.mock.calls.filter(([u]) => u === '/v1/me')).toHaveLength(2);
  });

  it('LINE ログインへ移るあいだは読み込み中のままにする', async () => {
    liff.isInClient.mockReturnValue(false);
    liff.isLoggedIn.mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn());
    render(<App />);
    await waitFor(() => expect(liff.login).toHaveBeenCalled());
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
