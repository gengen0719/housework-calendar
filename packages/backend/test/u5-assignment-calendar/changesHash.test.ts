import { describe, expect, it } from 'vitest';
import type { HashedChange } from '../../src/services/assignmentPlanner';
import { computeChangesHash } from '../../src/services/changesHash';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
} from '../fixtures/fakeSecrets';

const rows: HashedChange[] = [
  {
    date: '2027-01-18',
    choreTypeId: FAKE_CHORE_TYPE_ID_2,
    fromChildUserId: FAKE_CHILD_USER_ID_1,
    toChildUserId: FAKE_CHILD_USER_ID_2,
    version: 2,
  },
  {
    date: '2027-01-18',
    choreTypeId: FAKE_CHORE_TYPE_ID_1,
    fromChildUserId: FAKE_CHILD_USER_ID_2,
    toChildUserId: null,
    version: 1,
  },
  {
    date: '2027-01-04',
    choreTypeId: FAKE_CHORE_TYPE_ID_1,
    fromChildUserId: FAKE_CHILD_USER_ID_1,
    toChildUserId: FAKE_CHILD_USER_ID_2,
    version: 3,
  },
];

describe('computeChangesHash（上書きの確かめの印）', () => {
  it('16 進数 64 文字を返す', () => {
    expect(computeChangesHash('fam', '2027-01', rows)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('入力の順番に左右されない', () => {
    const forward = computeChangesHash('fam', '2027-01', rows);
    expect(computeChangesHash('fam', '2027-01', [...rows].reverse())).toBe(forward);
    expect(
      computeChangesHash('fam', '2027-01', [rows[1], rows[2], rows[0]] as HashedChange[]),
    ).toBe(forward);
  });

  it('入力の配列は書き換えない', () => {
    const copy = rows.map((row) => ({ ...row }));
    computeChangesHash('fam', '2027-01', copy);
    expect(copy).toEqual(rows);
  });

  it('version が変わると変わる', () => {
    const changed = rows.map((row, index) => (index === 0 ? { ...row, version: 3 } : row));
    expect(computeChangesHash('fam', '2027-01', changed)).not.toBe(
      computeChangesHash('fam', '2027-01', rows),
    );
  });

  it('家族・月・子供・行き先なしが変わると変わる', () => {
    const base = computeChangesHash('fam', '2027-01', rows);
    expect(computeChangesHash('other', '2027-01', rows)).not.toBe(base);
    expect(computeChangesHash('fam', '2027-02', rows)).not.toBe(base);
    const toggled = rows.map((row, index) =>
      index === 1 ? { ...row, toChildUserId: FAKE_CHILD_USER_ID_1 } : row,
    );
    expect(computeChangesHash('fam', '2027-01', toggled)).not.toBe(base);
  });

  it('一覧が空でも決まった値になる', () => {
    expect(computeChangesHash('fam', '2027-01', [])).toBe(computeChangesHash('fam', '2027-01', []));
  });
});
