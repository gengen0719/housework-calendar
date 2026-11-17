import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

it('前の月の確定済みカレンダーから、その月のお小遣いを開く', async () => {
  setCalendar('2026-11');
  setCalendar('2026-10', { confirmed: true });
  const open = vi.fn();
  render(
    <CalendarPage familyName="家族" authorized={authorized} role="admin" onOpenAllowance={open} />,
  );
  await screen.findByTestId('month-confirm-button');
  fireEvent.click(screen.getByTestId('prev-month-button'));
  await screen.findByTestId('confirmed-label');
  fireEvent.click(screen.getByRole('button', { name: 'この月のお小遣いを確認' }));
  expect(open).toHaveBeenCalledWith('2026-10');
});

it('月の確定後に金額の確認先が表示される', async () => {
  setCalendar('2026-11');
  const open = vi.fn();
  render(
    <CalendarPage familyName="家族" authorized={authorized} role="admin" onOpenAllowance={open} />,
  );
  fireEvent.click(await screen.findByTestId('month-confirm-button'));
  fireEvent.click(await screen.findByTestId('month-confirm-confirm-button'));
  await screen.findByTestId('confirmed-label');
  const button = screen.getByRole('button', { name: 'この月のお小遣いを確認' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(open).toHaveBeenCalledWith('2026-11');
});
