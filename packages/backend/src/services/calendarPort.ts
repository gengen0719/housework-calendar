import type { FamilyContext } from '../middleware/requireMembership';

/**
 * C8 カレンダーの窓口（U4 では仮）。種類が割り当てに一度でも使われたかを答える（BR5.9）。
 * U5 が本物を作るまでは、いつも「使われていない」を返す。テストでは setCalendarPort で差し替える。
 * U5 への引き継ぎ: 本物は割り当ての記録を強い整合性の読み取りで確かめる（結果整合の索引は使わない）。
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
