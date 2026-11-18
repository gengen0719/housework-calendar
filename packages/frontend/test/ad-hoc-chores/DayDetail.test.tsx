import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayDetail } from '../../src/pages/DayDetail';
import * as api from '../../src/api/client';

vi.mock('../../src/api/client');
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const props = {
  date: '2027-01-14',
  today: '2027-01-13',
  duties: [],
  children: [{ userId: 'child', displayName: '太郎' }],
  isAdmin: true,
  authorized: async <T,>(fn: (token: string) => Promise<T>) => fn('token'),
  onChanged: vi.fn(),
  onRefresh: vi.fn(),
  onClose: vi.fn(),
};
describe('Given 日付詳細 / When 臨時依頼 / Then 内容と担当を選ぶ', () => {
  it('FR1: 依頼を開くと臨時マスタの名前と単価を選べる', async () => {
    vi.mocked(api.listChoreTypes).mockResolvedValue([
      {
        choreTypeId: 'type',
        name: 'お昼ご飯',
        unitPrice: 100,
        active: true,
        purpose: 'adhoc',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    render(<DayDetail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '臨時のお手伝いを依頼' }));
    expect(await screen.findByRole('option', { name: 'お昼ご飯（100円）' })).toBeInTheDocument();
  });
  it('FR1: 過去日と子供には追加入口を出さない', () => {
    render(<DayDetail {...props} isAdmin={false} />);
    expect(screen.queryByText('臨時のお手伝いを依頼')).toBeNull();
  });
  it('FR3/NFR2: 保存失敗で入力を残し、再試行できる', async () => {
    vi.mocked(api.listChoreTypes).mockResolvedValue([
      {
        choreTypeId: 'type',
        name: 'お昼ご飯',
        unitPrice: 100,
        active: true,
        purpose: 'adhoc',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    vi.mocked(api.createAdhocDuty)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({} as never);
    render(<DayDetail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '臨時のお手伝いを依頼' }));
    await screen.findByRole('option', { name: 'お昼ご飯（100円）' });
    fireEvent.click(screen.getByRole('button', { name: '依頼する' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('臨時のお手伝い')).toHaveValue('type');
    fireEvent.click(screen.getByRole('button', { name: '依頼する' }));
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
    expect(api.createAdhocDuty).toHaveBeenLastCalledWith('token', {
      date: props.date,
      choreTypeId: 'type',
      childUserId: 'child',
    });
  });
  it('FR2: 通常用・使用停止を候補にせず、空なら登録を案内', async () => {
    vi.mocked(api.listChoreTypes).mockResolvedValue([
      {
        choreTypeId: 'regular',
        name: '皿洗い',
        unitPrice: 100,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    render(<DayDetail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '臨時のお手伝いを依頼' }));
    expect(
      await screen.findByText('家族の設定で使用する臨時のお手伝いを登録してください'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '依頼する' })).toBeDisabled();
  });
});
