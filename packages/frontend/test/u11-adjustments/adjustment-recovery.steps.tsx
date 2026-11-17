import '@testing-library/jest-dom/vitest';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { AllowancePage } from '../../src/pages/AllowancePage';
import { authorized } from '../u9-allowance/helpers/view';
const feature = await loadFeature(
  'packages/frontend/test/u11-adjustments/adjustment-recovery.feature',
);
describeFeature(feature, ({ AfterEachScenario, Scenario }) => {
  AfterEachScenario(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  Scenario('合計のエラーから独立した一覧を開く', ({ Given, When, Then }) => {
    Given('管理者の合計が安全な整数の範囲外である', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((path: string) =>
          Promise.resolve(
            path.endsWith('/adjustments')
              ? new Response(
                  JSON.stringify({
                    month: '2027-01',
                    confirmed: false,
                    firstMonth: '2026-11',
                    lastMonth: '2027-02',
                    children: [],
                    adjustments: [],
                  }),
                )
              : new Response(JSON.stringify({ error: { reason: 'ALLOWANCE_OUT_OF_RANGE' } }), {
                  status: 422,
                }),
          ),
        ),
      );
      render(
        <AllowancePage
          authorized={authorized}
          initialMonth="2027-01"
          role="admin"
          onBack={() => undefined}
        />,
      );
      await screen.findByRole('alert');
    });
    When('加算減額の一覧を開く', () => {
      fireEvent.click(screen.getByRole('button', { name: '加算・減額の一覧' }));
    });
    Then('訂正用の一覧が表示される', async () => {
      expect(await screen.findByRole('heading', { name: '2027-01の加算・減額一覧' })).toBeVisible();
    });
  });
});
