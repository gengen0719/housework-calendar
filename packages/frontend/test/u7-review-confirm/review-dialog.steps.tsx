import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import type { MonthConfirmPreview, StatusChangePreview } from '@housework/shared';
import { MonthConfirmDialog } from '../../src/components/MonthConfirmDialog';
import { StatusChangeDialog } from '../../src/components/StatusChangeDialog';
import { theme } from '../../src/theme';

const feature = await loadFeature('packages/frontend/test/u7-review-confirm/review-dialog.feature');

const statusPreview: StatusChangePreview = {
  date: '2027-01-05',
  choreName: '皿洗い',
  childName: '太郎',
  fromStatus: 'done',
  toStatus: 'todo',
  countNote: 'お小遣いの回数から外れます',
};

// vi.fn の呼び出し記録は手順の間で消えることがあるので、各シナリオは最後の手順で描画・操作・確認まで完結させる。
function openStatus(over: { busy?: boolean; preview?: StatusChangePreview } = {}): {
  onConfirm: () => void;
  onCancel: () => void;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <StatusChangeDialog
        preview={over.preview ?? statusPreview}
        busy={over.busy}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ThemeProvider>,
  );
  return { onConfirm, onCancel };
}

function openMonth(over: { busy?: boolean; preview?: MonthConfirmPreview } = {}): {
  onConfirm: () => void;
  onCancel: () => void;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <MonthConfirmDialog
        preview={over.preview ?? { month: '2027-01', action: 'confirm', todoCount: 0 }}
        busy={over.busy}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </ThemeProvider>,
  );
  return { onConfirm, onCancel };
}

describeFeature(feature, ({ AfterEachScenario, Scenario }) => {
  AfterEachScenario(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  Scenario('Esc キーで閉じる', ({ Given, When, Then }) => {
    Given('状態の変更の確認ダイアログを開く', () => undefined);
    When('Esc キーを押す', () => undefined);
    Then('onCancel が呼ばれる', () => {
      const { onCancel } = openStatus();
      fireEvent.keyDown(screen.getByTestId('status-change-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('「やめる」で閉じる', ({ Given, When, Then }) => {
    Given('月の確定の確認ダイアログを開く', () => undefined);
    When('「やめる」を押す', () => undefined);
    Then('onCancel が呼ばれる', () => {
      const { onCancel } = openMonth();
      fireEvent.click(screen.getByTestId('month-confirm-cancel-button'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('開いたときフォーカスが「はい」に移る', ({ Given, Then, And }) => {
    Given('状態の変更の確認ダイアログを開く', () => undefined);
    Then('状態の変更の「はい」にフォーカスが移る', async () => {
      openStatus();
      await waitFor(() => expect(screen.getByTestId('status-change-confirm-button')).toHaveFocus());
      cleanup();
    });
    And('月の確定の確認ダイアログでも「はい」にフォーカスが移る', async () => {
      openMonth();
      await waitFor(() => expect(screen.getByTestId('month-confirm-confirm-button')).toHaveFocus());
    });
  });

  Scenario('送信中はボタンが押せない', ({ Given, Then }) => {
    Given('確認ダイアログを送信中の状態で開く', () => undefined);
    Then('両方の「はい」が aria-busy で押せない', () => {
      openStatus({ busy: true });
      const status = screen.getByTestId('status-change-confirm-button');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(status).toBeDisabled();
      cleanup();
      openMonth({ busy: true });
      const month = screen.getByTestId('month-confirm-confirm-button');
      expect(month).toHaveAttribute('aria-busy', 'true');
      expect(month).toBeDisabled();
    });
  });

  Scenario('未の件数の注意は 1 件以上のときだけ出る', ({ Given, Then }) => {
    Given('月の確定の確認ダイアログを未の件数を変えて開く', () => undefined);
    Then('3 件のとき注意が出て 0 件のときと取り消しのときは出ない', () => {
      openMonth({ preview: { month: '2027-01', action: 'confirm', todoCount: 3 } });
      expect(screen.getByTestId('month-confirm-dialog')).toHaveTextContent(
        '未の担当が 3 件あります',
      );
      cleanup();
      openMonth({ preview: { month: '2027-01', action: 'confirm', todoCount: 0 } });
      expect(screen.getByTestId('month-confirm-dialog')).not.toHaveTextContent('未の担当が');
      cleanup();
      openMonth({ preview: { month: '2027-01', action: 'unconfirm' } });
      expect(screen.getByTestId('month-confirm-dialog')).not.toHaveTextContent('未の担当が');
      expect(screen.getByTestId('month-confirm-dialog')).toHaveTextContent(
        '2027-01の確定を取り消しますか？',
      );
    });
  });

  Scenario('名前を文字として出す', ({ Given, Then }) => {
    Given('お手伝いの名前と子供の名前にタグを含めて開く', () => undefined);
    Then('タグは文字としてそのまま出て要素にならない', () => {
      openStatus({
        preview: {
          ...statusPreview,
          choreName: '<b>皿洗い</b>',
          childName: '<img src=x onerror=alert(1)>',
        },
      });
      const dialog = screen.getByTestId('status-change-dialog');
      expect(dialog).toHaveTextContent('<b>皿洗い</b>');
      expect(dialog).toHaveTextContent('<img src=x onerror=alert(1)>');
      expect(dialog.querySelector('b')).toBeNull();
      expect(dialog.querySelector('img')).toBeNull();
    });
  });
});
