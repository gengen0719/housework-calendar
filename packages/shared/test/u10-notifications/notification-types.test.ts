import { expectTypeOf, it } from 'vitest';
import type { NotificationKind, NotificationTrigger, NotificationState } from '../../src';
it('通知種類は2つだけ', () => {
  expectTypeOf<NotificationKind>().toEqualTypeOf<'dailyReminder' | 'monthlySummary'>();
});
it('入力に家族を持たない', () => {
  expectTypeOf<keyof NotificationTrigger>().toEqualTypeOf<'kind' | 'targetDate'>();
});
it('終端を含む状態を定義', () => {
  expectTypeOf<NotificationState>().toEqualTypeOf<
    'prepared' | 'sending' | 'sent' | 'skipped' | 'failed' | 'expired'
  >();
});
