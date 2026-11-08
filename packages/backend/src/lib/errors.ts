import type { Reason } from '@housework/shared';

/** 画面用 API が決まりで断るときの失敗。入口が `{ error: { reason, details? } }` の形にして返す。 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: Reason,
    readonly details?: Record<string, unknown>,
  ) {
    super(reason);
    this.name = 'ApiError';
  }
}
