import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdjustmentPage } from '../../src/pages/AdjustmentPage';
import * as api from '../../src/api/client';
import type { AdjustmentView } from '@housework/shared';
import { authorized, view } from '../u9-allowance/helpers/view';
const child = () => ({ userId: view().allowances[0]!.childUserId, displayName: '太郎' });
let saved = vi.fn<() => void>();
let back = vi.fn<() => void>();
beforeEach(() => {
  saved = vi.fn();
  back = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function show(children = [child()]) {
  return render(
    <AdjustmentPage
      authorized={authorized}
      month="2027-01"
      children={children}
      onBack={() => back()}
      onSaved={() => saved()}
    />,
  );
}
function fill(amount = '200', reason = '追加の理由') {
  fireEvent.change(screen.getByLabelText('子供'), { target: { value: child().userId } });
  fireEvent.change(screen.getByLabelText('種類'), { target: { value: 'subtract' } });
  fireEvent.change(screen.getByLabelText('金額（円）'), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText('理由'), { target: { value: reason } });
}
const submit = () => fireEvent.click(screen.getByTestId('adjustment-save'));
describe('調整の入力と不明な結果', () => {
  it('子供と種類は明示的に選ぶ', () => {
    show();
    expect(screen.getByLabelText('子供')).toHaveValue('');
    expect(screen.getByLabelText('種類')).toHaveValue('');
  });
  it.each(['0', '-1', '1.5', '1e3', '', '9007199254740992'])(
    '金額%sの誤りでも入力を残す',
    (amount) => {
      const send = vi.spyOn(api, 'addAdjustment');
      show();
      fill(amount);
      submit();
      expect(send).not.toHaveBeenCalled();
      expect(screen.getByLabelText('理由')).toHaveValue('追加の理由');
    },
  );
  it('空の理由に欄別エラー', () => {
    show();
    fill('200', ' ');
    submit();
    expect(screen.getByLabelText('理由')).toHaveAttribute('aria-invalid', 'true');
  });
  it('子供なしは保存できない', () => {
    show([]);
    expect(screen.getByTestId('adjustment-save')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('家族の設定');
  });
  it('保存中の多重押下を止める', async () => {
    const send = vi
      .spyOn(api, 'addAdjustment')
      .mockImplementation(() => new Promise(() => undefined));
    show();
    fill();
    submit();
    submit();
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('保存中');
  });
  it('保存成功後は入力を再送せず戻り先だけに知らせる', async () => {
    vi.spyOn(api, 'addAdjustment').mockResolvedValue({
      ...{ childUserId: child().userId, kind: 'subtract', amount: 200, reason: '追加の理由' },
      adjustmentId: child().userId,
      month: '2027-01',
      createdAt: '2027-01-13T00:00:00Z',
    });
    show();
    fill();
    submit();
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  });
  it('通信断は同じキー・入力を維持し編集を止める', async () => {
    const send = vi
      .spyOn(api, 'addAdjustment')
      .mockRejectedValue(new api.ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE'));
    show();
    fill();
    submit();
    await screen.findByText(/結果が不明です/);
    expect(screen.getByLabelText('理由')).toBeDisabled();
    submit();
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  });
  it('24時間を超えた不明要求は送信せず一覧確認にする', async () => {
    const send = vi
      .spyOn(api, 'addAdjustment')
      .mockRejectedValue(new api.ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE'));
    show();
    fill();
    submit();
    await screen.findByText(/結果が不明です/);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000);
    submit();
    await screen.findByText('24時間を過ぎました。一覧で登録結果を確認してください');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('確定を検出したら変更を止める', async () => {
    vi.spyOn(api, 'addAdjustment').mockRejectedValue(new api.ApiFailure(409, 'MONTH_CONFIRMED'));
    show();
    fill();
    submit();
    await screen.findByRole('alert');
    expect(screen.getByTestId('adjustment-save')).toBeDisabled();
  });
  it('画面離脱後の旧応答を適用しない', async () => {
    let complete!: (value: AdjustmentView) => void;
    vi.spyOn(api, 'addAdjustment').mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const r = show();
    fill();
    submit();
    r.unmount();
    complete({} as AdjustmentView);
    await Promise.resolve();
    expect(saved).not.toHaveBeenCalled();
  });
  it('やめるは保存せず戻る', () => {
    const send = vi.spyOn(api, 'addAdjustment');
    show();
    fireEvent.click(screen.getByText('やめる'));
    expect(back).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});
