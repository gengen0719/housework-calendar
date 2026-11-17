import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarPage } from '../../src/pages/CalendarPage';
import { authorized } from './helpers/view';
import {
  installFakeApi,
  resetFake,
  setCalendar,
} from '../u5-assignment-calendar/helpers/fakeCalendarApi';

beforeEach(() => {
  resetFake();
  installFakeApi();
  Element.prototype.scrollIntoView = vi.fn();
  setCalendar('2026-11');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

it('今日以降を初期表示し、過去を展開・再度折りたためる', async () => {
  render(<CalendarPage familyName="家族" authorized={authorized} role="admin" />);
  await screen.findByTestId('calendar-grid');
  expect(screen.getAllByTestId('day-row')).toHaveLength(16);
  expect(screen.getAllByTestId('day-row')[0]).toHaveAttribute('data-date', '2026-11-15');
  const toggle = screen.getByRole('button', { name: '過ぎた日付を表示（14日分）' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(screen.getAllByTestId('day-row')).toHaveLength(30);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(toggle);
  expect(screen.getAllByTestId('day-row')).toHaveLength(16);
});

it('確定ボタンは日付一覧の後に表示する', async () => {
  render(<CalendarPage familyName="家族" authorized={authorized} role="admin" />);
  const list = await screen.findByTestId('calendar-grid');
  expect(
    list.compareDocumentPosition(screen.getByTestId('month-confirm-area')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('前月は全日を折りたたみ、翌月は全日を表示する', async () => {
  setCalendar('2026-10');
  setCalendar('2026-12');
  render(<CalendarPage familyName="家族" authorized={authorized} role="child" />);
  await screen.findByTestId('calendar-grid');
  fireEvent.click(screen.getByTestId('prev-month-button'));
  await screen.findByRole('button', { name: '過ぎた日付を表示（31日分）' });
  expect(screen.queryAllByTestId('day-row')).toHaveLength(0);
  fireEvent.click(screen.getByTestId('toggle-past-days'));
  expect(screen.getAllByTestId('day-row')).toHaveLength(31);
  fireEvent.click(screen.getByTestId('next-month-button'));
  await screen.findByRole('button', { name: '過ぎた日付を表示（14日分）' });
  fireEvent.click(screen.getByTestId('next-month-button'));
  await screen.findByText('2026年12月');
  await screen.findAllByTestId('day-row');
  expect(screen.getAllByTestId('day-row')).toHaveLength(31);
  expect(screen.queryByTestId('toggle-past-days')).toBeNull();
});
