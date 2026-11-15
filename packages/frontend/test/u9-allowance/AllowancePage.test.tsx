import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AllowancePage } from '../../src/pages/AllowancePage';
import { FAKE_CHILD_USER_ID_1 } from '../fixtures/fakeSecrets';
import { authorized, view } from './helpers/view';
describe('お小遣いの表示の境目', () => {
  it('月が不正なら専用の案内を出す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('{"error":{"reason":"INVALID_MONTH"}}', { status: 422 })),
    );
    render(<AllowancePage authorized={authorized} onBack={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('月の指定が正しくありません');
  });
  it('調整だけの子供にゼロ円の案内を出さない', async () => {
    const value = view();
    value.allowances = [
      {
        ...value.allowances[0]!,
        lines: [],
        adjustments: [{ adjustmentId: FAKE_CHILD_USER_ID_1, amount: -200, reason: '減額' }],
        total: -200,
      },
    ];
    show(value);
    expect(await screen.findByRole('heading', { name: '太郎 -200円' })).toBeVisible();
    expect(screen.getByText('減額 -200円')).toBeVisible();
    expect(screen.queryByText(/記録はまだありません/)).toBeNull();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  function show(value = view(), role: 'admin' | 'child' = 'admin') {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(value)))),
    );
    return render(
      <AllowancePage
        authorized={authorized}
        role={role}
        currentUserId={FAKE_CHILD_USER_ID_1}
        onBack={() => undefined}
      />,
    );
  }
  it('管理者には自分の目印を付けない', async () => {
    show();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/あなた/)).toBeNull();
  });
  it('今日でない月はこの月の記録という', async () => {
    show(view({ today: '2027-02-01' }));
    expect(await screen.findByText('この月の記録はまだありません（0 円）')).toBeVisible();
  });
  it('ゼロ円の内訳も隠さない', async () => {
    const value = view();
    value.allowances = [value.allowances[0]!];
    value.allowances[0]!.lines[0]!.unitPrice = 0;
    value.allowances[0]!.lines[0]!.amount = 0;
    show(value);
    expect(await screen.findByText('皿洗い 0円 x 8回 = 0円')).toBeVisible();
    expect(screen.queryByText(/記録はまだ/)).toBeNull();
  });
  it('単価が違う内訳は別々に出す', async () => {
    const value = view();
    const child = value.allowances[0]!;
    child.lines = [
      { ...child.lines[0]!, count: 3, amount: 300 },
      { ...child.lines[0]!, unitPrice: 120, count: 1, amount: 120 },
    ];
    child.total = 420;
    show(value);
    expect(await screen.findByText('皿洗い 100円 x 3回 = 300円')).toBeVisible();
    expect(screen.getByText('皿洗い 120円 x 1回 = 120円')).toBeVisible();
  });
  it('調整の理由と金額は文字で描き、合計を再計算しない', async () => {
    const value = view();
    value.allowances[0]!.adjustments = [
      { adjustmentId: FAKE_CHILD_USER_ID_1, amount: -300, reason: '<img src=x>' },
    ];
    value.allowances[0]!.total = -200;
    const { container } = show(value);
    expect(await screen.findByText('<img src=x> -300円')).toBeVisible();
    expect(screen.getByRole('heading', { name: '太郎 -200円' })).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });
  it('範囲の端で月ボタンを無効にする', async () => {
    show(view({ firstMonth: view().month, lastMonth: view().month }));
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('button', { name: '前の月' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '次の月' })).toBeDisabled();
  });
  it('メンバーでないときは共通の案内', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"error":{"reason":"NOT_FAMILY_MEMBER"}}', { status: 403 }),
        ),
    );
    render(<AllowancePage authorized={authorized} onBack={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'このアプリは家族のメンバーだけが使えます',
    );
  });
  it('戻るは受け取った操作を呼ぶ', async () => {
    const back = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => new Promise(() => undefined)),
    );
    render(<AllowancePage authorized={authorized} onBack={back} />);
    expect(screen.getByRole('status')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
