import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonthCalendar } from '@housework/shared';
import { CalendarPage } from '../../src/pages/CalendarPage';
import { useMonthCalendar } from '../../src/hooks/useMonthCalendar';

vi.mock('../../src/hooks/useMonthCalendar');
vi.mock('../../src/pages/AssignmentPage', () => ({
  AssignmentPage: () => <div data-testid="assignment-editor">割り当て編集</div>,
}));

const calendar = (patch: Partial<MonthCalendar> = {}): MonthCalendar => ({
  month: '2026-11',
  today: '2026-11-15',
  confirmed: false,
  hasAssignment: true,
  choreTypes: [],
  children: [],
  duties: [],
  ...patch,
});
const authorized = vi.fn();
const settings = vi.fn();
const down = 'ArrowDown';
function show(
  patch: Partial<MonthCalendar> = {},
  role: 'admin' | 'child' = 'admin',
  withSettings = true,
) {
  const value = calendar(patch);
  vi.mocked(useMonthCalendar).mockReturnValue({
    month: value.month,
    state: { kind: 'ready', value },
    previous: vi.fn(),
    next: vi.fn(),
    reload: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  });
  return render(
    <CalendarPage
      familyName={'とても長い家族の名前'.repeat(8)}
      authorized={authorized}
      role={role}
      {...(withSettings ? { onOpenSettings: settings } : {})}
    />,
  );
}
const open = () => fireEvent.click(screen.getByRole('button', { name: '家族のメニュー' }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Given 家族のカレンダー / When 3点メニューを操作 / Then 必要な入口を使える', () => {
  it('FR1: 最初は操作を隠し、家族名と同じ行で開く', () => {
    show();
    const button = screen.getByRole('button', { name: '家族のメニュー' });
    expect(button.parentElement).toContainElement(screen.getByTestId('family-name'));
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('家族の設定')).toBeNull();
    expect(screen.queryByText('割り当てを変える')).toBeNull();
    open();
    expect(screen.getByRole('menuitem', { name: '家族の設定' })).toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });
  it('FR2: 設定項目は既存callbackを1回呼ぶ', async () => {
    show();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: '家族の設定' }));
    expect(settings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
  it('FR3: 入力済みの変更項目から既存編集を始める', async () => {
    show();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: '割り当てを変える' }));
    expect(await screen.findByTestId('assignment-editor')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
  it('FR4: 未入力時は入力ボタンを画面に残し、メニューには入れない', async () => {
    show({ hasAssignment: false });
    expect(screen.getByRole('button', { name: '割り当てを入力する' })).toBeVisible();
    open();
    expect(screen.queryByRole('menuitem', { name: /割り当て/ })).toBeNull();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: '割り当てを入力する' }));
    expect(await screen.findByTestId('assignment-editor')).toBeVisible();
  });
  it.each([
    ['子供', {}, 'child'],
    ['確定済み', { confirmed: true }, 'admin'],
    ['過去月', { month: '2026-10' }, 'admin'],
    ['範囲外', { month: '2027-01' }, 'admin'],
  ] as const)('FR3/NFR2: %sには割り当て変更を出さない', (_name, patch, role) => {
    show(patch, role);
    open();
    expect(screen.queryByRole('menuitem', { name: '割り当てを変える' })).toBeNull();
    expect(screen.queryByTestId('enter-assignment-button')).toBeNull();
    expect(authorized).not.toHaveBeenCalled();
  });
  it('FR2: callbackがなければ設定項目を作らない', () => {
    show({}, 'admin', false);
    open();
    expect(screen.queryByRole('menuitem', { name: '家族の設定' })).toBeNull();
  });
  it('FR1/NFR1: キーボードで開いて選択し、Escapeで閉じてフォーカスを戻す', async () => {
    show();
    const button = screen.getByRole('button', { name: '家族のメニュー' });
    button.focus();
    fireEvent.keyDown(button, { key: down });
    expect(screen.getByRole('menuitem', { name: '家族の設定' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '家族の設定' }), { key: down });
    expect(screen.getByRole('menuitem', { name: '割り当てを変える' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(button).toHaveFocus();
    expect(settings).not.toHaveBeenCalled();
  });
  it('FR1: 外側の操作とボタンの再操作は処理せず閉じる', async () => {
    show();
    open();
    fireEvent.click(document.querySelector('.MuiBackdrop-root')!);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    open();
    fireEvent.click(screen.getByTestId('family-menu-button'));
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(settings).not.toHaveBeenCalled();
    expect(authorized).not.toHaveBeenCalled();
  });
});
