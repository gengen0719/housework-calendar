import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Allowance,
  AllowanceAdjustmentLine,
  AllowanceChoreLine,
  AllowanceMonthView,
  Role,
} from '../../src/index';

describe('共有パッケージ: U9 の型（許可した項目と完全に一致する。NFR4.91）', () => {
  it('AllowanceChoreLine の項目が許可した一覧と一致する', () => {
    expectTypeOf<keyof AllowanceChoreLine>().toEqualTypeOf<
      'choreTypeId' | 'choreName' | 'unitPrice' | 'count' | 'amount'
    >();
    expectTypeOf<AllowanceChoreLine['amount']>().toBeNumber();
    expect(true).toBe(true);
  });

  it('AllowanceAdjustmentLine の項目が許可した一覧と一致する', () => {
    expectTypeOf<keyof AllowanceAdjustmentLine>().toEqualTypeOf<
      'adjustmentId' | 'amount' | 'reason'
    >();
    expect(true).toBe(true);
  });

  it('Allowance の項目が許可した一覧と一致し、LINE の ID・役割・家族 ID・管理者の情報がない', () => {
    expectTypeOf<keyof Allowance>().toEqualTypeOf<
      'childUserId' | 'displayName' | 'current' | 'month' | 'lines' | 'adjustments' | 'total'
    >();
    expectTypeOf<Allowance['lines']>().toEqualTypeOf<AllowanceChoreLine[]>();
    expectTypeOf<Allowance['adjustments']>().toEqualTypeOf<AllowanceAdjustmentLine[]>();
    expectTypeOf<Allowance['current']>().toBeBoolean();
    expect(true).toBe(true);
  });

  it('AllowanceMonthView の項目が許可した一覧と一致する', () => {
    expectTypeOf<keyof AllowanceMonthView>().toEqualTypeOf<
      'month' | 'confirmed' | 'today' | 'firstMonth' | 'lastMonth' | 'allowances'
    >();
    expectTypeOf<AllowanceMonthView['allowances']>().toEqualTypeOf<Allowance[]>();
    expectTypeOf<AllowanceMonthView['confirmed']>().toBeBoolean();
    expect(true).toBe(true);
  });

  it('Role に system が混ざっていない', () => {
    expectTypeOf<Role>().toEqualTypeOf<'admin' | 'child'>();
    // @ts-expect-error system は共有の Role に入れない
    const role: Role = 'system';
    expect(role).toBe('system');
  });
});
