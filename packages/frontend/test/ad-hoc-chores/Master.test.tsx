import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/client';
import { ChoreTypesPage } from '../../src/pages/ChoreTypesPage';

vi.mock('../../src/api/client');
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const authorized = async <T,>(fn: (token: string) => Promise<T>) => fn('token');
describe('Given 管理者の設定 / When 臨時マスタを管理 / Then 通常用と分離', () => {
  it('FR2: 臨時用だけを表示し、用途つきで新規登録する', async () => {
    vi.mocked(api.listChoreTypes).mockResolvedValue([
      {
        choreTypeId: 'a',
        purpose: 'adhoc',
        name: 'お昼ご飯',
        unitPrice: 100,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        choreTypeId: 'r',
        name: '皿洗い',
        unitPrice: 20,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
    ]);
    render(
      <ChoreTypesPage role="admin" authorized={authorized} onBack={vi.fn()} purpose="adhoc" />,
    );
    expect(await screen.findByText('お昼ご飯')).toBeVisible();
    expect(screen.queryByText('皿洗い')).toBeNull();
    expect(screen.queryByTestId('delete-button')).toBeNull();
    fireEvent.click(screen.getByTestId('add-button'));
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '窓ふき' } });
    fireEvent.change(screen.getByLabelText('単価（円）'), { target: { value: '200' } });
    fireEvent.submit(screen.getByTestId('chore-type-form'));
    await waitFor(() => expect(api.createChoreType).toHaveBeenCalled());
    expect(vi.mocked(api.createChoreType).mock.calls[0]?.[1]).toMatchObject({
      purpose: 'adhoc',
      name: '窓ふき',
      unitPrice: 200,
    });
  });
});
