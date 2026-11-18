import { datesOfMonth, isEditableMonth, jstDateOf, type Duty } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { requireMembership } from '../../middleware/requireMembership';
import { uuidSchema } from './params';
import * as service from '../../services/adhocDutyService';

const schema = z.object({
  date: z.string().regex(/^20\d\d-\d{2}-\d{2}$/),
  choreTypeId: uuidSchema,
  childUserId: uuidSchema,
});
export async function createAdhocDuty(auth: AuthContext, body: unknown, now: Date): Promise<Duty> {
  const ctx = requireAdmin(requireMembership(auth));
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
  const { date } = parsed.data;
  const month = date.slice(0, 7);
  const today = jstDateOf(now);
  if (!isEditableMonth(month, today) || date < today || !datesOfMonth(month).includes(date))
    throw new ApiError(422, 'MONTH_NOT_EDITABLE');
  return service.create(ctx, parsed.data, today, now);
}
