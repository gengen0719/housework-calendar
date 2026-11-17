import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdjustmentMonthView } from '@housework/shared';
import { AdjustmentListPage } from '../../src/pages/AdjustmentListPage';
import * as api from '../../src/api/client';
import { authorized, view } from '../u9-allowance/helpers/view';
function data(): AdjustmentMonthView {
  return {
    month: '2027-01',
    confirmed: false,
    firstMonth: '2026-11',
    lastMonth: '2027-02',
    children: [{ userId: view().allowances[0]!.childUserId, displayName: '太郎' }],
    adjustments: [
      {
        adjustmentId: view().allowances[0]!.childUserId,
        childUserId: view().allowances[0]!.childUserId,
        month: '2027-01',
        kind: 'subtract',
        amount: 200,
        reason: '<img src=x>',
        displayName: '太郎',
        createdAt: '2027-01-01T00:00:00Z',
      },
    ],
  };
}
beforeEach(() => {
  vi.spyOn(api, 'getAdjustments').mockResolvedValue(data());
  vi.spyOn(api, 'deleteAdjustment').mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function show() {
  return render(
    <AdjustmentListPage authorized={authorized} month="2027-01" onBack={() => undefined} />,
  );
}
async function confirm() {
  fireEvent.click(await screen.findByTestId('adjustment-delete'));
  return screen.findByRole('dialog');
}
describe('独立した訂正一覧と確認', () => {
  it('過去の行と理由を文字で表示する', async () => {
    const r = show();
    expect(await screen.findByText('太郎 -200円 <img src=x>')).toBeVisible();
    expect(r.container.querySelector('img')).toBeNull();
  });
  it('取消では送らず確認元へフォーカスを戻す', async () => {
    show();
    const button = await screen.findByTestId('adjustment-delete');
    button.focus();
    const dialog = await confirm();
    fireEvent.click(within(dialog).getByText('やめる'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.deleteAdjustment).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toHaveFocus());
  });
  it('確認後だけ削除し再取得する', async () => {
    show();
    const dialog = await confirm();
    vi.mocked(api.getAdjustments).mockResolvedValue({ ...data(), adjustments: [] });
    fireEvent.click(within(dialog).getByTestId('adjustment-delete-confirm'));
    await screen.findByText('加算・減額はありません');
    expect(api.deleteAdjustment).toHaveBeenCalledTimes(1);
    expect(api.getAdjustments).toHaveBeenCalledTimes(2);
  });
  it('削除応答不明時に再試行できる', async () => {
    vi.mocked(api.deleteAdjustment).mockRejectedValue(
      new api.ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE'),
    );
    show();
    const dialog = await confirm();
    fireEvent.click(within(dialog).getByTestId('adjustment-delete-confirm'));
    await within(dialog).findByRole('alert');
    expect(within(dialog).getByTestId('adjustment-delete-confirm')).not.toBeDisabled();
  });
  it('すでに消えた404は最新一覧で確認する', async () => {
    vi.mocked(api.deleteAdjustment).mockRejectedValue(new api.ApiFailure(404, 'NOT_FOUND'));
    show();
    const dialog = await confirm();
    fireEvent.click(within(dialog).getByTestId('adjustment-delete-confirm'));
    await screen.findByText(/すでに削除されています/);
    expect(api.getAdjustments).toHaveBeenCalledTimes(2);
  });
  it('確定月は変更操作を止める', async () => {
    vi.mocked(api.getAdjustments).mockResolvedValue({ ...data(), confirmed: true });
    show();
    expect(await screen.findByText('確定済み')).toBeVisible();
    expect(screen.getByTestId('adjustment-delete')).toBeDisabled();
    expect(screen.queryByTestId('adjustment-add')).toBeNull();
  });
  it('削除成功後の表示失敗を削除の失敗と混同しない', async () => {
    show();
    const dialog = await confirm();
    vi.mocked(api.getAdjustments).mockRejectedValue(new api.ApiFailure(500, 'INTERNAL'));
    fireEvent.click(within(dialog).getByTestId('adjustment-delete-confirm'));
    expect(await screen.findByText('削除しました。表示を読み込み直します')).toBeVisible();
    await screen.findByRole('alert');
    expect(api.deleteAdjustment).toHaveBeenCalledTimes(1);
  });
  it('登録画面へ進める', async () => {
    show();
    fireEvent.click(await screen.findByTestId('adjustment-add'));
    expect(screen.getByLabelText('理由')).toBeVisible();
  });
  it('離脱後の古い一覧を適用しない', async () => {
    let resolve!: (d: AdjustmentMonthView) => void;
    vi.mocked(api.getAdjustments).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const r = show();
    r.unmount();
    resolve(data());
    await Promise.resolve();
    expect(screen.queryByText('太郎 -200円 <img src=x>')).toBeNull();
  });
});
