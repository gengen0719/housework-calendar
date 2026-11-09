import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERWRITE_CONFIRM_HEADING, type OverwriteChange } from '@housework/shared';
import { OverwriteConfirmDialog } from '../../src/components/OverwriteConfirmDialog';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
} from '../fixtures/fakeSecrets';

const CHORE_NAMES: Record<string, string> = {
  [FAKE_CHORE_TYPE_ID_1]: '皿洗い',
  [FAKE_CHORE_TYPE_ID_2]: 'ごみ出し',
};
const CHILD_NAMES: Record<string, string> = {
  [FAKE_CHILD_USER_ID_1]: '太郎',
  [FAKE_CHILD_USER_ID_2]: '次郎',
};
const choreName = (id: string) => CHORE_NAMES[id] ?? '';
const childName = (id: string) => CHILD_NAMES[id] ?? '';

const change = (over: Partial<OverwriteChange> = {}): OverwriteChange => ({
  date: '2026-11-22',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  fromChildUserId: FAKE_CHILD_USER_ID_1,
  toChildUserId: FAKE_CHILD_USER_ID_2,
  ...over,
});

function renderDialog(
  changes: OverwriteChange[],
  over: Partial<Parameters<typeof OverwriteConfirmDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <OverwriteConfirmDialog
      changes={changes}
      choreName={choreName}
      childName={childName}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onConfirm, onCancel };
}

afterEach(cleanup);

describe('OverwriteConfirmDialog', () => {
  it('見出しと、変わる担当を 1 件 1 行で「日付 種類: 前 → 後」の形に出す', () => {
    renderDialog([change(), change({ date: '2026-11-23', choreTypeId: FAKE_CHORE_TYPE_ID_2 })]);

    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(OVERWRITE_CONFIRM_HEADING);
    const rows = screen.getAllByTestId('overwrite-change');
    expect(rows.map((r) => r.textContent)).toEqual([
      '11月22日 皿洗い: 太郎 → 次郎',
      '11月23日 ごみ出し: 太郎 → 次郎',
    ]);
  });

  it('作り直したあとに担当がなければ、行き先を「なし」と出す', () => {
    renderDialog([change({ toChildUserId: null })]);

    expect(screen.getByTestId('overwrite-change').textContent).toBe('11月22日 皿洗い: 太郎 → なし');
  });

  it('「この内容で保存する」で onConfirm、「やめる」で onCancel が 1 回ずつ呼ばれる', () => {
    const { onConfirm, onCancel } = renderDialog([change()]);

    fireEvent.click(screen.getByTestId('overwrite-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('overwrite-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('保存中（busy）は「この内容で保存する」を押せず、「やめる」は押せる', () => {
    const { onConfirm, onCancel } = renderDialog([change()], { busy: true });

    const confirm = screen.getByTestId('overwrite-confirm-button');
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    expect(screen.getByTestId('overwrite-cancel-button')).toBeEnabled();
    fireEvent.click(screen.getByTestId('overwrite-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('名前が引けない ID は空の文字で出し、画面を壊さない', () => {
    renderDialog([
      change({
        choreTypeId: 'unknown-chore',
        fromChildUserId: 'unknown-child',
        toChildUserId: null,
      }),
    ]);

    expect(screen.getByTestId('overwrite-change').textContent).toBe('11月22日 :  → なし');
  });

  it('名前に HTML が入っていても、タグとして解釈せず文字のまま出す', () => {
    renderDialog([change()], {
      choreName: () => '<b>皿洗い</b>',
      childName: () => '<img src=x onerror=alert(1)>',
    });

    const row = screen.getByTestId('overwrite-change');
    expect(row.querySelector('b')).toBeNull();
    expect(row.querySelector('img')).toBeNull();
    expect(row.textContent).toContain('<b>皿洗い</b>');
    expect(row.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('変わる担当が 0 件でも、一覧は空のまま 2 つのボタンを出す', () => {
    renderDialog([]);

    expect(screen.queryAllByTestId('overwrite-change')).toHaveLength(0);
    expect(screen.getByTestId('overwrite-confirm-button')).toBeEnabled();
    expect(screen.getByTestId('overwrite-cancel-button')).toBeEnabled();
  });
});
