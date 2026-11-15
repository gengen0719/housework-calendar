import '@testing-library/jest-dom/vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import type { AllowanceMonthView } from '@housework/shared';
import { AllowancePage } from '../../src/pages/AllowancePage';
import { theme } from '../../src/theme';
import { FAKE_CHILD_USER_ID_1 } from '../fixtures/fakeSecrets';
import { authorized, view } from './helpers/view';

const feature = await loadFeature('packages/frontend/test/u9-allowance/allowance-page.feature');
function open(value: AllowanceMonthView) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
  return render(
    <ThemeProvider theme={theme}>
      <AllowancePage
        authorized={authorized}
        currentUserId={FAKE_CHILD_USER_ID_1}
        role="child"
        onBack={() => undefined}
      />
    </ThemeProvider>,
  );
}
describeFeature(feature, ({ Scenario, AfterEachScenario }) => {
  AfterEachScenario(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  Scenario('家族の内訳と合計を見る', ({ Given, When, Then }) => {
    Given('子供二人の内訳がある', () => undefined);
    When('子供がお小遣いを開く', () => undefined);
    Then('全員の合計と自分の目印が見える', async () => {
      open(view());
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
        '2027年1月のお小遣い',
      );
      expect(screen.getByRole('heading', { name: '太郎 1,400円（あなた）' })).toBeVisible();
      expect(screen.getByRole('heading', { name: '次郎 0円' })).toBeVisible();
      expect(screen.getByText('皿洗い 100円 x 8回 = 800円')).toBeVisible();
      expect(screen.getByText('風呂掃除 150円 x 4回 = 600円')).toBeVisible();
      expect(screen.getByText('今月の記録はまだありません（0 円）')).toBeVisible();
      expect(screen.getByText('確定していません')).toBeVisible();
    });
  });
  Scenario('確定の状態を見る', ({ Given, When, Then }) => {
    Given('月が確定している', () => undefined);
    When('お小遣いを開く', () => undefined);
    Then('確定済みと表示され操作ボタンはない', async () => {
      open(view({ confirmed: true }));
      expect(await screen.findByText('確定済み')).toBeVisible();
      expect(screen.queryByRole('button', { name: /確定|加算|減額/ })).toBeNull();
    });
  });
  Scenario('子供がまだいない', ({ Given, When, Then }) => {
    Given('子供がいない', () => undefined);
    When('お小遣いを開く', () => undefined);
    Then('子供がいない案内が見える', async () => {
      open(view({ allowances: [] }));
      expect(await screen.findByText('お小遣いを表示する子供がまだいません')).toBeVisible();
    });
  });
  Scenario('マイナスと名前をそのまま見る', ({ Given, When, Then }) => {
    Given('名前にタグがあり合計がマイナス', () => undefined);
    When('お小遣いを開く', () => undefined);
    Then('タグは文字でマイナスは残る', async () => {
      const value = view();
      value.allowances[0]!.displayName = '<b>太郎</b>';
      value.allowances[0]!.total = -200;
      const { container } = open(value);
      expect(
        await screen.findByRole('heading', { name: '<b>太郎</b> -200円（あなた）' }),
      ).toBeVisible();
      expect(container.querySelector('b')).toBeNull();
    });
  });
  Scenario('読み取りをやり直す', ({ Given, When, Then }) => {
    Given('読み取りに失敗する', () => undefined);
    When('読み込み直すを押す', () => undefined);
    Then('同じ月を読み直して表示する', async () => {
      open(view());
      const fetcher = vi.mocked(fetch);
      fetcher
        .mockReset()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue(new Response(JSON.stringify(view())));
      // 最初の要求は描画の効果で既に始まるため、新しい画面で失敗を差し込む。
      cleanup();
      render(<AllowancePage authorized={authorized} onBack={() => undefined} role="admin" />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '表示できませんでした。もう一度お試しください',
      );
      fireEvent.click(screen.getByRole('button', { name: '読み込み直す' }));
      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
        '2027年1月のお小遣い',
      );
    });
  });
});
