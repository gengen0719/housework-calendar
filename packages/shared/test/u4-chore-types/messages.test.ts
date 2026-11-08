import { describe, expect, it } from 'vitest';
import {
  ALL_REASONS,
  CHORE_TYPE_ALREADY_GONE,
  CHORE_TYPE_NO_LONGER_EXISTS,
  CHORE_TYPE_DELETE_CONFIRM,
  CHORE_TYPE_DEACTIVATE_CONFIRM,
  CHORE_TYPE_IN_USE_DEACTIVATED,
  CHORE_TYPE_NAME_HINT,
  CHORE_TYPE_NAME_TAKEN_INACTIVE,
  CHORE_TYPE_PRICE_CHANGE_NOTE,
  MESSAGES,
  choreTypeNameTakenMessage,
  getMessage,
  type ChoreType,
  type ChoreTypeInput,
} from '../../src/index';

describe('共有パッケージ: U4 で足す印と文言（US2.1）', () => {
  it('新しい理由の印が ALL_REASONS にあり、文言が要件のとおり', () => {
    expect(ALL_REASONS).toContain('INVALID_CHORE_TYPE_NAME');
    expect(ALL_REASONS).toContain('CHORE_TYPE_NAME_TAKEN');
    expect(ALL_REASONS).toContain('INVALID_DESCRIPTION');
    expect(ALL_REASONS).toContain('INVALID_REQUEST');
    expect(ALL_REASONS).toContain('CHORE_TYPE_STATE_CHANGED');
    expect(MESSAGES.INVALID_CHORE_TYPE_NAME).toBe('名前を 1〜20 文字で入力してください');
    expect(MESSAGES.INVALID_DESCRIPTION).toBe('説明は 100 文字までで入力してください');
    expect(getMessage('CHORE_TYPE_STATE_CHANGED')).toBe(MESSAGES.CHORE_TYPE_STATE_CHANGED);
    expect(MESSAGES.INVALID_REQUEST.length).toBeGreaterThan(0);
  });

  it('CHORE_TYPE_IN_USE の文言は「使わない」を案内する', () => {
    expect(MESSAGES.CHORE_TYPE_IN_USE).toBe(
      '割り当てに使われたことがあるので消せません。『使わない』にしてください',
    );
    expect(CHORE_TYPE_IN_USE_DEACTIVATED).toBe(
      '割り当てに使われたことがあるので消せません。『使わない』にしました',
    );
  });

  it('名前の重なりの文言が 2 通りあり、相手が「使う」か「使わない」かで選べる', () => {
    expect(MESSAGES.CHORE_TYPE_NAME_TAKEN).toBe(
      '同じ名前の種類があります。1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように、別の名前で登録してください',
    );
    expect(choreTypeNameTakenMessage(true)).toBe(MESSAGES.CHORE_TYPE_NAME_TAKEN);
    expect(choreTypeNameTakenMessage(false)).toBe(CHORE_TYPE_NAME_TAKEN_INACTIVE);
    expect(CHORE_TYPE_NAME_TAKEN_INACTIVE).toBe(
      '『使わない』になっている同じ名前の種類があります。『使う』に戻すか、別の名前で登録してください',
    );
  });

  it('名前の欄の案内と画面の確かめの文言がある', () => {
    expect(CHORE_TYPE_NAME_HINT).toBe(
      '1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように分けて登録します',
    );
    expect(CHORE_TYPE_PRICE_CHANGE_NOTE).toBe(
      '単価を変えると、このあとに付く記録から新しい単価になります',
    );
    expect(CHORE_TYPE_DEACTIVATE_CONFIRM).toContain('新しい割り当てで選べなくなります');
    expect(CHORE_TYPE_DELETE_CONFIRM).toBe('この種類を消しますか？ 消すと元に戻せません');
    expect(CHORE_TYPE_ALREADY_GONE).toBe('すでに消えています');
    expect(CHORE_TYPE_NO_LONGER_EXISTS).toBe('この種類はもうありません');
  });

  it('U1〜U3 の印が消えていない。型 ChoreType・ChoreTypeInput が使える', () => {
    for (const reason of [
      'NOT_FRIEND',
      'INVALID_FAMILY_NAME',
      'IDEMPOTENCY_KEY_REQUIRED',
      'SERVICE_TEMPORARILY_UNAVAILABLE',
      'IDEMPOTENCY_KEY_REUSED',
      'GROUP_USED_BY_OTHER_FAMILY',
      'INVALID_UNIT_PRICE',
      'CHORE_TYPE_IN_USE',
    ]) {
      expect(ALL_REASONS).toContain(reason);
    }
    const input: ChoreTypeInput = { name: '皿洗い', unitPrice: 100 };
    const type: ChoreType = {
      choreTypeId: 'id-1',
      ...input,
      active: true,
      createdAt: '2026-11-02T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
    };
    expect(type.active).toBe(true);
  });
});
