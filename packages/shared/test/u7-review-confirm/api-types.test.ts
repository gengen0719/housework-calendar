import { describe, expect, it } from 'vitest';
import type {
  Duty,
  MonthConfirmPreview,
  StatusChangeAction,
  StatusChangePreview,
  StatusChangeRequest,
  StatusChangeResponse,
} from '../../src/index';

describe('共有パッケージ: U7 の型（StatusChangeAction ほか）', () => {
  it('StatusChangeAction は 4 つの操作だけを受け付ける', () => {
    const actions: StatusChangeAction[] = ['cancel', 'markDone', 'markSkipped', 'unmarkSkipped'];
    expect(actions).toHaveLength(4);
    // ほかの文字列は型で弾く（表にない操作）
    // @ts-expect-error record は FR6.1 の表の操作ではない
    const invalid: StatusChangeAction = 'record';
    void invalid;
  });

  it('StatusChangeRequest は action と version を持つ', () => {
    const request: StatusChangeRequest = { action: 'cancel', version: 3 };
    expect(request.action).toBe('cancel');
    expect(request.version).toBe(3);
    // @ts-expect-error status は本文で受け取らない（裏側が決める。NFR4.67）
    const spoofed: StatusChangeRequest = { action: 'markDone', version: 1, status: 'done' };
    void spoofed;
  });

  it('StatusChangeResponse は Duty（U5 の型）', () => {
    const duty: Duty = {
      dutyId: 'd1',
      date: '2027-01-05',
      choreTypeId: 'c1',
      choreName: '皿洗い',
      childUserId: 'u1',
      status: 'done',
      origin: 'rule',
      version: 2,
      recordedAt: '2027-01-05T07:00:00.000Z',
      recordedBy: 'admin',
      recordedByName: 'お母さん',
      unitPrice: 120,
    };
    const response: StatusChangeResponse = duty;
    expect(response.status).toBe('done');
  });

  it('StatusChangePreview は 1 行の変化と注意を持つ', () => {
    const preview: StatusChangePreview = {
      date: '2027-01-05',
      choreName: '皿洗い',
      childName: '太郎',
      fromStatus: 'done',
      toStatus: 'todo',
      countNote: 'お小遣いの回数から外れます',
    };
    expect(preview.countNote).toContain('回数');
    // countNote は注意がないとき null
    const noNote: StatusChangePreview = { ...preview, fromStatus: 'skipped', countNote: null };
    expect(noNote.countNote).toBeNull();
  });

  it('MonthConfirmPreview は confirm/unconfirm と任意の件数', () => {
    const confirm: MonthConfirmPreview = { month: '2027-01', action: 'confirm', todoCount: 2 };
    const unconfirm: MonthConfirmPreview = { month: '2027-01', action: 'unconfirm' };
    expect(confirm.action).toBe('confirm');
    expect(unconfirm.todoCount).toBeUndefined();
    // @ts-expect-error reopen は確定・取り消しの action ではない
    const invalid: MonthConfirmPreview = { month: '2027-01', action: 'reopen' };
    void invalid;
  });
});
