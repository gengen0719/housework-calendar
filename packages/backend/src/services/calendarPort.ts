import type { FamilyContext } from '../middleware/requireMembership';

/**
 * C8 カレンダーの窓口の形。種類が割り当てに一度でも使われたかを答える（BR5.9、BR6.10）。
 * 本物（calendarService.isChoreTypeAssigned。強い整合性の Query）は entries/api.ts で取り付ける。
 * ここに残す仮の窓口は、いつも「使われていない」を返す（U4 のテストが使う。resetCalendarPort で戻せる）。
 * choreTypeService は、この形だけに頼り、calendarService を import しない（循環 import を避ける）。
 */
export interface CalendarPort {
  isChoreTypeAssigned(ctx: FamilyContext, choreTypeId: string): Promise<boolean>;
}

const stubPort: CalendarPort = {
  isChoreTypeAssigned: async () => false,
};

let port: CalendarPort = stubPort;

export function isChoreTypeAssigned(ctx: FamilyContext, choreTypeId: string): Promise<boolean> {
  return port.isChoreTypeAssigned(ctx, choreTypeId);
}

/** 窓口を差し替える（テストと、U5 の本物の窓口の取り付け用）。 */
export function setCalendarPort(replacement: CalendarPort): void {
  port = replacement;
}

/** 仮の窓口に戻す。 */
export function resetCalendarPort(): void {
  port = stubPort;
}
