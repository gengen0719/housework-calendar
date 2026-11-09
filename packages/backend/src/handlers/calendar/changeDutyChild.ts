import type { Duty } from '@housework/shared';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { requireAdmin } from '../../middleware/requireAdmin';
import type { AuthContext } from '../../middleware/requireAuth';
import { requireMembership } from '../../middleware/requireMembership';
import * as calendarService from '../../services/calendarService';
import { requireDutyIdParam, uuidSchema } from './params';

/** PATCH の本文は `childUserId`（小文字の UUID）だけ。知らない項目は捨てる（zod の既定の strip。NFR4.47） */
export const dutyChangeBodySchema = z.object({ childUserId: uuidSchema });

export interface ChangeDutyChildContext {
  now: Date;
}

/**
 * F4: 日ごとの担当の子供を変える（C1 PATCH /duties/:dutyId）。管理者だけ（BR6.1、BR6.9）。
 * 確かめの順番: requireAuth（入口）→ requireMembership → requireAdmin → dutyId の形（404）→ 担当（404。家族の範囲）→
 * 本文の大きさ（413）と形（422 INVALID_REQUEST）→ 子供（404）→ 月の確定（409）→ 「未」か（409）→ 書き込み。
 * 本文は担当の 404 のあとで読む（ほかの家族の dutyId には、本文が誤っていても 404。NFR4.52）。
 */
export async function changeDutyChild(
  auth: AuthContext,
  dutyIdParam: string,
  readBody: () => unknown,
  context: ChangeDutyChildContext,
): Promise<Duty> {
  const ctx = requireAdmin(requireMembership(auth));
  const dutyId = requireDutyIdParam(dutyIdParam);
  const result = await calendarService.changeDutyChild(
    ctx,
    dutyId,
    () => {
      const parsed = dutyChangeBodySchema.safeParse(readBody());
      if (!parsed.success) throw new ApiError(422, 'INVALID_REQUEST');
      return parsed.data.childUserId;
    },
    { now: context.now },
  );
  if (result.ok) return result.value;
  switch (result.reason) {
    case 'NOT_FOUND':
      throw new ApiError(404, 'NOT_FOUND');
    case 'MONTH_CONFIRMED':
    case 'DUTY_NOT_TODO':
      throw new ApiError(409, result.reason);
    case 'INTERNAL':
      throw new ApiError(500, 'INTERNAL');
  }
}
