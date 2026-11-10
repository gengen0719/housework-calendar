import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import type { StatusChangePreview } from '@housework/shared';
import { StatusChangeDialog } from '../../src/components/StatusChangeDialog';
import { theme } from '../../src/theme';

const cancelPreview: StatusChangePreview = {
  date: '2027-01-05',
  choreName: '皿洗い',
  childName: '太郎',
  fromStatus: 'done',
  toStatus: 'todo',
  countNote: 'お小遣いの回数から外れます',
};

function open(over: { busy?: boolean; preview?: StatusChangePreview } = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <StatusChangeDialog
        preview={over.preview ?? cancelPreview}
        busy={over.busy}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ThemeProvider>,
  );
  return { onConfirm, onCancel };
}

afterEach(() => {
  cleanup();
});

describe('StatusChangeDialog（U7）', () => {
  it('取り消しは 1 行の変化と「お小遣いの回数から外れます」を出す', () => {
    open();
    expect(screen.getByTestId('status-change-dialog')).toHaveTextContent(
      '1/5 皿洗い 太郎: 済 → 未 に戻します',
    );
    expect(screen.getByTestId('status-change-note')).toHaveTextContent(
      'お小遣いの回数から外れます',
    );
  });

  it('済にするは「『済』にします」と単価の注意を出す', () => {
    open({
      preview: {
        ...cancelPreview,
        fromStatus: 'todo',
        toStatus: 'done',
        countNote: '100 円で数えます',
      },
    });
    expect(screen.getByTestId('status-change-dialog')).toHaveTextContent(
      '1/5 皿洗い 太郎 を『済』にします',
    );
    expect(screen.getByTestId('status-change-note')).toHaveTextContent('100 円で数えます');
  });

  it('注意がない（countNote が null）ときは注意の欄を出さない', () => {
    open({
      preview: { ...cancelPreview, fromStatus: 'skipped', toStatus: 'todo', countNote: null },
    });
    expect(screen.queryByTestId('status-change-note')).toBeNull();
  });

  it('開いたときフォーカスが「はい」に移る', async () => {
    open();
    await waitFor(() => expect(screen.getByTestId('status-change-confirm-button')).toHaveFocus());
  });

  it('「はい」で onConfirm、「やめる」で onCancel が呼ばれる', () => {
    const { onConfirm, onCancel } = open();
    fireEvent.click(screen.getByTestId('status-change-confirm-button'));
    fireEvent.click(screen.getByTestId('status-change-cancel-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc キーで onCancel が呼ばれる', () => {
    const { onCancel } = open();
    fireEvent.keyDown(screen.getByTestId('status-change-dialog'), {
      key: 'Escape',
      code: 'Escape',
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('送信中は「はい」が aria-busy で押せず、onConfirm が呼ばれない', () => {
    const { onConfirm } = open({ busy: true });
    const button = screen.getByTestId('status-change-confirm-button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('名前の中のタグは文字として出る', () => {
    open({ preview: { ...cancelPreview, choreName: '<script>x</script>' } });
    const dialog = screen.getByTestId('status-change-dialog');
    expect(dialog).toHaveTextContent('<script>x</script>');
    expect(dialog.querySelector('script')).toBeNull();
  });
});
