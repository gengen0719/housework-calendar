import '@testing-library/jest-dom/vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { AllowancePage } from '../../src/pages/AllowancePage';
import { authorized, view } from '../u9-allowance/helpers/view';
const feature = await loadFeature('packages/frontend/test/u11-adjustments/adjustment-form.feature');
describeFeature(feature, ({ AfterEachScenario, Scenario }) => {
  AfterEachScenario(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  Scenario('お小遣いから加算減額の入力へ進む', ({ Given, When, Then }) => {
    Given('管理者がお小遣いを表示している', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(view())))),
      );
      render(<AllowancePage authorized={authorized} role="admin" onBack={() => undefined} />);
      await screen.findByRole('heading', { level: 1 });
    });
    When('加算減額の入口を開く', () => {
      fireEvent.click(screen.getByRole('button', { name: '加算・減額' }));
    });
    Then('理由と金額と子供を選ぶ欄がある', () => {
      expect(screen.getByLabelText('理由')).toBeVisible();
      expect(screen.getByLabelText('金額（円）')).toBeVisible();
      expect(screen.getByLabelText('子供')).toBeVisible();
    });
  });
});
