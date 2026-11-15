/**
 * allowanceService のログの確かめ（NFR2.74〜NFR2.76、NFR4.89）。
 * 成功・異常 3 種・失敗（ログが出ない）・上限 20 行の各場面を処理し、
 * - ALLOWANCE_COMPUTED と異常の行の項目名が許可した一覧と完全に一致すること
 * - 目印の文字・数字が全行に含まれないこと（名前・金額・単価・加算・減額の値を残さない）
 * - ログの出す順序（異常の warn → ALLOWANCE_COMPUTED の info）
 * を確かめる。
 * setupAllowanceWorld 内部で captureLogs() が呼ばれており、w.logs を通してログを取る。
 */
import { describe, expect, it, vi } from 'vitest';
import type { AllowanceAdjustmentLine } from '@housework/shared';
import { getAllowances, type AdjustmentSource } from '../../src/services/allowanceService';
import {
  FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
  FAKE_U9_MARKER_ADJUSTMENT_REASON,
  FAKE_U9_MARKER_CHORE_NAME,
  FAKE_U9_MARKER_DISPLAY_NAME,
  FAKE_U9_MARKER_UNIT_PRICE,
  FAKE_U9_DEPARTED_USER_ID,
  fakeU9ChoreTypeId,
} from '../fixtures/fakeSecrets';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  asRead,
  CHILDREN,
  CHORES,
  ctxAdmin,
  dateOf,
  FAMILY_ID,
  MONTH,
  PEOPLE,
  setupAllowanceWorld,
} from './helpers/allowanceWorld';

const COMPUTED_KEYS = [
  'anomalyCount',
  'childCount',
  'departedChildCount',
  'doneCount',
  'durationMs',
  'dutyCount',
  'event',
  'familyId',
  'lineCount',
  'month',
].sort();

const WITHOUT_PRICE = 'ALLOWANCE_DUTY_WITHOUT_PRICE';
const TYPE_MISSING = 'ALLOWANCE_CHORE_TYPE_MISSING';

const metaKeys = new Set(['level', 'timestamp', 'env', 'entry', 'requestId']);
const domainKeys = (row: Record<string, unknown>): string[] =>
  Object.keys(row)
    .filter((k) => !metaKeys.has(k))
    .sort();

describe('allowanceLogs（NFR2.74〜NFR2.76）', () => {
  it('成功時の ALLOWANCE_COMPUTED は 1 件で、項目名が許可した 10 項目と完全に一致する', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    w.done({ date: dateOf(1) });
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      const rows = w.logs.rows('ALLOWANCE_COMPUTED');
      expect(rows).toHaveLength(1);
      expect(domainKeys(rows[0] ?? {})).toEqual(COMPUTED_KEYS);
      expect(rows[0]?.familyId).toBe(FAMILY_ID);
      expect(rows[0]?.month).toBe(MONTH);
      expect(typeof rows[0]?.durationMs).toBe('number');
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('異常の行（3 種類）の項目名が許可した一覧と完全に一致し、名前も金額も入らない', async () => {
    const w = setupAllowanceWorld();
    // 単価なし
    w.done({ date: dateOf(0), price: null });
    // 一覧にない種類
    w.done({ date: dateOf(1), choreTypeId: fakeU9ChoreTypeId(99), price: 50 });
    // 管理者の担当
    w.done({ date: dateOf(2), childUserId: PEOPLE.mother.userId });
    // 目印の値を仕込む
    const item = w.world.users.get(CHILDREN.taro.userId);
    if (item)
      w.world.users.set(CHILDREN.taro.userId, {
        ...item,
        displayName: FAKE_U9_MARKER_DISPLAY_NAME,
      });
    const key = `${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`;
    const type = w.world.choreTypes.get(key);
    if (type) w.world.choreTypes.set(key, { ...type, name: FAKE_U9_MARKER_CHORE_NAME });
    w.done({ date: dateOf(3), price: FAKE_U9_MARKER_UNIT_PRICE });
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      for (const row of w.logs.rows(WITHOUT_PRICE)) {
        expect(domainKeys(row)).toEqual(['dutyId', 'event', 'familyId'].sort());
      }
      for (const row of w.logs.rows(TYPE_MISSING)) {
        expect(domainKeys(row)).toEqual(['choreTypeId', 'event', 'familyId'].sort());
      }
      expect(
        w.logs.findLeak([
          FAKE_U9_MARKER_DISPLAY_NAME,
          FAKE_U9_MARKER_CHORE_NAME,
          FAKE_U9_MARKER_UNIT_PRICE,
        ]),
      ).toBeUndefined();
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('読み取りが失敗した要求では ALLOWANCE_COMPUTED も異常のログも出ない', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    w.world.hooks.failRead(CALENDAR_TABLE, 'Query');
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH).catch(() => undefined);
      expect(w.logs.lines.filter((l) => String(l.event).startsWith('ALLOWANCE_'))).toHaveLength(0);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('異常のログは ALLOWANCE_COMPUTED より先に出る', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0), price: null });
    w.done({ date: dateOf(1) });
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      const events = w.logs.lines.map((l) => l.event);
      const withoutIdx = events.indexOf(WITHOUT_PRICE);
      const computedIdx = events.indexOf('ALLOWANCE_COMPUTED');
      expect(withoutIdx).toBeGreaterThanOrEqual(0);
      expect(computedIdx).toBeGreaterThanOrEqual(0);
      expect(withoutIdx).toBeLessThan(computedIdx);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('異常のログは種類ごとに 20 行まで（300 件でも 20 行）', async () => {
    const w = setupAllowanceWorld();
    for (let i = 0; i < 300; i++) {
      w.done({
        date: dateOf(i),
        choreTypeId: fakeU9ChoreTypeId(40 + Math.floor(i / 28)),
        price: null,
      });
    }
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      expect(w.logs.rows(WITHOUT_PRICE)).toHaveLength(20);
      expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(300);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('加算・減額の値・理由もログに含まれない', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    w.departed(FAKE_U9_DEPARTED_USER_ID, `${FAKE_U9_MARKER_DISPLAY_NAME}の抜けた子供`);
    w.done({ date: dateOf(1), childUserId: FAKE_U9_DEPARTED_USER_ID });
    const adjustment: AllowanceAdjustmentLine = {
      adjustmentId: 'adj-log-test',
      amount: FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
      reason: FAKE_U9_MARKER_ADJUSTMENT_REASON,
    };
    const slot: AdjustmentSource = async () => new Map([[CHILDREN.taro.userId, [adjustment]]]);
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH, { adjustments: slot });
      expect(
        w.logs.findLeak([
          FAKE_U9_MARKER_DISPLAY_NAME,
          FAKE_U9_MARKER_ADJUSTMENT_REASON,
          FAKE_U9_MARKER_ADJUSTMENT_AMOUNT,
          CHILDREN.taro.userId,
        ]),
      ).toBeUndefined();
      expect(w.logs.rows('ALLOWANCE_COMPUTED')).toHaveLength(1);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('ALLOWANCE_COMPUTED の durationMs は数値で 0 以上', async () => {
    const w = setupAllowanceWorld();
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH);
      const row = w.logs.rows('ALLOWANCE_COMPUTED')[0];
      expect(typeof row?.durationMs).toBe('number');
      expect(row?.durationMs as number).toBeGreaterThanOrEqual(0);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });

  it('種類の Query が失敗した要求では ALLOWANCE_ のログは 1 行もない', async () => {
    const w = setupAllowanceWorld();
    w.done({ date: dateOf(0) });
    w.world.hooks.failRead(CHORE_TYPES_TABLE, 'Query');
    try {
      await getAllowances(asRead(ctxAdmin()), MONTH).catch(() => undefined);
      expect(w.logs.lines.filter((l) => String(l.event).startsWith('ALLOWANCE_'))).toHaveLength(0);
    } finally {
      w.world.mock.reset();
      vi.restoreAllMocks();
    }
  });
});
