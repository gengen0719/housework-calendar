import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { MonthConfirmPreview } from '@housework/shared';
import { MonthConfirmDialog } from '../../src/components/MonthConfirmDialog';
import { theme } from '../../src/theme';

function open(preview: MonthConfirmPreview, busy = false) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <MonthConfirmDialog preview={preview} busy={busy} onConfirm={onConfirm} onCancel={onCancel} />
    </ThemeProvider>,
  );
  return { onConfirm, onCancel };
}

afterEach(() => {
  cleanup();
});

describe('MonthConfirmDialog（U7）', () => {
  it('確定の確認を出す（未が 0 件なら件数の注意なし）', () => {
    open({ month: '2027-01', action: 'confirm', todoCount: 0 });
    const dialog = screen.getByTestId('month-confirm-dialog');
    expect(dialog).toHaveTextContent('2027-01を確定しますか？ 確定すると変更できなくなります');
    expect(dialog).not.toHaveTextContent('未の担当');
  });

  it('未が 1 件以上なら件数の注意を添える', () => {
    open({ month: '2027-01', action: 'confirm', todoCount: 2 });
    expect(screen.getByTestId('month-confirm-dialog')).toHaveTextContent(
      '未の担当が 2 件あります。確定すると、これらは記録もやらなかったにもできなくなります',
    );
  });

  it('todoCount がなくても確定の確認が出る', () => {
    open({ month: '2027-01', action: 'confirm' });
    const dialog = screen.getByTestId('month-confirm-dialog');
    expect(dialog).toHaveTextContent('2027-01を確定しますか？');
    expect(dialog).not.toHaveTextContent('未の担当');
  });

  it('確定の取り消しの確認を出す', () => {
    open({ month: '2027-01', action: 'unconfirm' });
    expect(screen.getByTestId('month-confirm-dialog')).toHaveTextContent(
      '2027-01の確定を取り消しますか？ 取り消すと、また変更できるようになります',
    );
  });

  it('開いたときフォーカスが「はい」に移る', async () => {
    open({ month: '2027-01', action: 'confirm', todoCount: 0 });
    await waitFor(() => expect(screen.getByTestId('month-confirm-confirm-button')).toHaveFocus());
  });

  it('「はい」で onConfirm、「やめる」で onCancel が呼ばれる', () => {
    const { onConfirm, onCancel } = open({ month: '2027-01', action: 'confirm', todoCount: 0 });
    fireEvent.click(screen.getByTestId('month-confirm-confirm-button'));
    fireEvent.click(screen.getByTestId('month-confirm-cancel-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc キーで onCancel が呼ばれる', () => {
    const { onCancel } = open({ month: '2027-01', action: 'unconfirm' });
    fireEvent.keyDown(screen.getByTestId('month-confirm-dialog'), {
      key: 'Escape',
      code: 'Escape',
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('送信中は「はい」が aria-busy で押せず、onConfirm が呼ばれない', () => {
    const { onConfirm } = open({ month: '2027-01', action: 'confirm', todoCount: 0 }, true);
    const button = screen.getByTestId('month-confirm-confirm-button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
