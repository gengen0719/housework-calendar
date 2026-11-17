import { err, ok, type Result } from './result';
export interface AdjustmentInput {
  childUserId: string;
  kind: 'add' | 'subtract';
  amount: number;
  reason: string;
}
export interface AdjustmentView extends AdjustmentInput {
  adjustmentId: string;
  month: string;
  createdAt: string;
}
export interface AdjustmentMonthView {
  month: string;
  confirmed: boolean;
  firstMonth: string;
  lastMonth: string;
  children: { userId: string; displayName: string }[];
  adjustments: (AdjustmentView & { displayName: string })[];
}
export type AdjustmentInputFailure =
  'INVALID_REQUEST' | 'INVALID_AMOUNT' | 'REASON_REQUIRED' | 'INVALID_REASON';
export function validateAdjustment(
  input: unknown,
): Result<AdjustmentInput, AdjustmentInputFailure> {
  if (!input || typeof input !== 'object') return err('INVALID_REQUEST');
  const row = input as Record<string, unknown>;
  if (
    typeof row.childUserId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.childUserId) ||
    (row.kind !== 'add' && row.kind !== 'subtract')
  )
    return err('INVALID_REQUEST');
  if (typeof row.amount !== 'number' || !Number.isSafeInteger(row.amount) || row.amount < 1)
    return err('INVALID_AMOUNT');
  if (row.reason === undefined || row.reason === null) return err('REASON_REQUIRED');
  if (typeof row.reason !== 'string') return err('INVALID_REASON');
  const reason = row.reason.normalize('NFC').trim();
  if (!reason) return err('REASON_REQUIRED');
  const hasControl = [...reason].some((character) => {
    const code = character.codePointAt(0)!;
    return (code < 32 && code !== 10) || (code >= 127 && code <= 159);
  });
  if ([...reason].length > 100 || hasControl) return err('INVALID_REASON');
  return ok({ childUserId: row.childUserId, kind: row.kind, amount: row.amount, reason });
}
