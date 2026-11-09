import type { Duty } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import type { DutyRecord } from '../../models';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership, type FamilyContext } from '../../middleware/requireMembership';
import * as choreTypeService from '../../services/choreTypeService';
import * as familyMemberService from '../../services/familyMemberService';
import { recordDuty as recordDutyService } from '../../services/recordingService';
import { requireDutyIdParam } from './params';

/**
 * 本文は version だけ。status・recordedAt・recordedBy・unitPrice などの余分な項目は strip で捨てる（NFR4.61）。
 * 数の形は 0 以上の安全な整数（security-design.md）。
 */
export const recordBodySchema = z.object({
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export interface RecordDutyContext {
  now: Date;
}

/**
 * F3: 画面から担当を記録する（C1 POST /duties/:dutyId/record）。子供本人だけ（BR7.4、BR7.10）。
 * 確かめの順番（security-design.md、NFR4.60）: requireAuth（入口）→ requireMembership →
 * dutyId の形（小文字 UUID でなければ DynamoDB を読まずに 404）→ 担当の 404（家族の範囲）→
 * 本文を遅延して読む（422）→ 本人の担当か（403）→ 月の確定・「×」・明日以降・version（409・422）→ 書き込み。
 * 本文は担当の 404 のあとで読む（ほかの家族の dutyId には、本文が誤っていても 404。NFR4.60）。
 * 画面は todayOnly: false（月をまたいでよい。AC5.1.8）。
 */
export async function recordDuty(
  auth: AuthContext,
  dutyIdParam: string,
  readBody: () => unknown,
  context: RecordDutyContext,
): Promise<Duty> {
  const ctx = requireMembership(auth);
  const dutyId = requireDutyIdParam(dutyIdParam);
  const result = await recordDutyService(
    ctx,
    dutyId,
    () => {
      const parsed = recordBodySchema.safeParse(readBody());
      if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
      return parsed.data.version;
    },
    { todayOnly: false, now: context.now, route: 'api' },
  );
  if (result.ok) return await dutyView(ctx, result.duty);
  switch (result.reason) {
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'NOT_OWN_DUTY':
      throw new ApiError(403, 'NOT_OWN_DUTY');
    case 'MONTH_CONFIRMED':
    case 'DUTY_SKIPPED_BY_ADMIN':
    case 'DUTY_CHANGED':
    case 'DUTY_ALREADY_DONE':
      throw new ApiError(409, result.reason);
    case 'FUTURE_DUTY':
      throw new ApiError(422, 'FUTURE_DUTY');
    // NOT_TODAY_DUTY は画面（todayOnly: false）では起きない
    default:
      throw new ApiError(500, 'INTERNAL');
  }
}

/** 記録後の担当を画面用の Duty にする（種類の名前と、記録した人の表示名を読む）。 */
async function dutyView(ctx: FamilyContext, duty: DutyRecord): Promise<Duty> {
  const type = await choreTypeService.get(ctx, duty.choreTypeId);
  let recordedByName: string | null = null;
  if (duty.recordedBy) {
    const child = await familyMemberService.findFamilyChild(ctx, duty.recordedBy);
    if (child.ok) recordedByName = child.value.displayName;
  }
  return {
    dutyId: duty.dutyId,
    date: duty.date,
    choreTypeId: duty.choreTypeId,
    choreName: type?.name ?? '',
    childUserId: duty.childUserId,
    status: duty.status,
    origin: duty.origin,
    version: duty.version,
    recordedAt: duty.recordedAt ?? null,
    recordedBy: duty.recordedBy ?? null,
    recordedByName,
    unitPrice: duty.unitPrice ?? null,
  };
}
