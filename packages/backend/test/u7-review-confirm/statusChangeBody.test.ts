import { describe, expect, it } from 'vitest';
import { statusChangeBodySchema } from '../../src/handlers/calendar/changeDutyStatus';

describe('statusChangeBodySchema（本文は action と version だけ）', () => {
  it.each(['cancel', 'markDone', 'markSkipped', 'unmarkSkipped'] as const)(
    '%s と version 0 以上の整数を通す',
    (action) => {
      expect(statusChangeBodySchema.parse({ action, version: 0 })).toEqual({ action, version: 0 });
    },
  );

  it('余分な項目は strip で捨てる', () => {
    const parsed = statusChangeBodySchema.parse({
      action: 'markDone',
      version: 3,
      unitPrice: 99999,
      recordedBy: 'x',
      status: 'done',
    });
    expect(parsed).toEqual({ action: 'markDone', version: 3 });
  });

  it('action が 4 つ以外・欠けるときは外れる', () => {
    expect(statusChangeBodySchema.safeParse({ action: 'delete', version: 1 }).success).toBe(false);
    expect(statusChangeBodySchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it('version が欠ける・文字列・負・小数・安全な整数を超えるときは外れる', () => {
    for (const version of [undefined, '1', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(statusChangeBodySchema.safeParse({ action: 'cancel', version }).success).toBe(false);
    }
  });

  it('本文がない・配列・null のときは外れる', () => {
    for (const body of [undefined, null, [], 'x']) {
      expect(statusChangeBodySchema.safeParse(body).success).toBe(false);
    }
  });
});
