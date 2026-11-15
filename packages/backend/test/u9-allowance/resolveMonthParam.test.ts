import { describe, expect, it } from 'vitest';
import { resolveMonthParam } from '../../src/handlers/allowances/params';
import { JST_BEFORE_BOUNDARY_ISO, JST_MONTH_BOUNDARY_ISO } from './helpers/clock';
describe('入口の月', () => {
  it('current を日本時間の月にする', () => {
    expect(resolveMonthParam('current', new Date(JST_BEFORE_BOUNDARY_ISO))).toBe('2027-01');
    expect(resolveMonthParam('current', new Date(JST_MONTH_BOUNDARY_ISO))).toBe('2027-02');
  });
  it.each(['Current', 'current ', 'CURRENT', '', '2000-00', '2101-01'])(
    '不正な月 %s は 422',
    (raw) => {
      expect(() => resolveMonthParam(raw, new Date(JST_BEFORE_BOUNDARY_ISO))).toThrowError(
        expect.objectContaining({ status: 422, reason: 'INVALID_MONTH' }),
      );
    },
  );
});
