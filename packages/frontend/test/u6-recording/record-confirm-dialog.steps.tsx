import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { RecordConfirmDialog } from '../../src/components/RecordConfirmDialog';
import { theme } from '../../src/theme';

const feature = await loadFeature(
  'packages/frontend/test/u6-recording/record-confirm-dialog.feature',
);

// vi.fn の呼び出し記録は手順（別々の it）の間で消えるので、各シナリオは 1 つの手順で完結させる。
// Given は「開く」準備だけを宣言し、実際の描画・操作・確認は最後の手順でまとめて行う。
function open(over: { busy?: boolean } = {}): { onConfirm: () => void; onCancel: () => void } {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <RecordConfirmDialog
        date="2027-01-05"
        choreName="皿洗い"
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

  Scenario('問いかけと 2 つのボタンが出る', ({ Given, Then }) => {
    Given('確認ダイアログを 1月5日の皿洗いで開く', () => undefined);
    Then('「1/5 皿洗いを記録しますか」と「記録する」「やめる」が出る', () => {
      open();
      expect(screen.getByTestId('record-confirm-dialog')).toHaveTextContent(
        '1/5 皿洗いを記録しますか',
      );
      expect(screen.getByTestId('record-confirm-button')).toHaveTextContent('記録する');
      expect(screen.getByTestId('record-cancel-button')).toHaveTextContent('やめる');
    });
  });

  Scenario('開いたときフォーカスが「記録する」に移る', ({ Given, Then }) => {
    Given('確認ダイアログを 1月5日の皿洗いで開く', () => undefined);
    Then('フォーカスが「記録する」に移る', async () => {
      open();
      await waitFor(() => expect(screen.getByTestId('record-confirm-button')).toHaveFocus());
    });
  });

  Scenario('「やめる」で閉じる', ({ Given, When, Then }) => {
    Given('確認ダイアログを 1月5日の皿洗いで開く', () => undefined);
    When('「やめる」を押す', () => undefined);
    Then('onCancel が呼ばれる', () => {
      const { onCancel } = open();
      fireEvent.click(screen.getByTestId('record-cancel-button'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('Esc キーで閉じる', ({ Given, When, Then }) => {
    Given('確認ダイアログを 1月5日の皿洗いで開く', () => undefined);
    When('Esc キーを押す', () => undefined);
    Then('onCancel が呼ばれる', () => {
      const { onCancel } = open();
      fireEvent.keyDown(screen.getByTestId('record-confirm-dialog'), {
        key: 'Escape',
        code: 'Escape',
      });
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('「記録する」を押すと onConfirm が呼ばれる', ({ Given, When, Then }) => {
    Given('確認ダイアログを 1月5日の皿洗いで開く', () => undefined);
    When('「記録する」を押す', () => undefined);
    Then('onConfirm が呼ばれる', () => {
      const { onConfirm } = open();
      fireEvent.click(screen.getByTestId('record-confirm-button'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  Scenario('送信中はボタンが押せない', ({ Given, Then }) => {
    Given('確認ダイアログを送信中の状態で開く', () => undefined);
    Then('「記録する」が aria-busy で押せない', () => {
      open({ busy: true });
      const confirm = screen.getByTestId('record-confirm-button');
      expect(confirm).toHaveAttribute('aria-busy', 'true');
      expect(confirm).toBeDisabled();
    });
  });
});
