import type { ChoreType } from '@housework/shared';
import type { Table } from '../../u1-skeleton-family/helpers/fakeDynamo';
import { FAMILY_ID } from '../../u2-invitation/helpers/seed';

export const OTHER_FAMILY_ID = 'fam-suzuki';

export interface SeedChoreTypeOptions {
  choreTypeId: string;
  name: string;
  unitPrice?: number;
  description?: string;
  active?: boolean;
  createdAt?: string;
  familyId?: string;
}

/** ChoreTypes の項目（種類と名前の印）を、メモリ上のテーブルに直接置く。 */
export function seedChoreType(table: Table, options: SeedChoreTypeOptions): void {
  const familyId = options.familyId ?? FAMILY_ID;
  const createdAt = options.createdAt ?? '2026-11-01T00:00:00.000Z';
  table.set(`${familyId}#TYPE#${options.choreTypeId}`, {
    familyId,
    sk: `TYPE#${options.choreTypeId}`,
    choreTypeId: options.choreTypeId,
    name: options.name,
    unitPrice: options.unitPrice ?? 100,
    ...(options.description ? { description: options.description } : {}),
    active: options.active ?? true,
    createdAt,
    updatedAt: createdAt,
  });
  table.set(`${familyId}#NAME#${options.name}`, {
    familyId,
    sk: `NAME#${options.name}`,
    choreTypeId: options.choreTypeId,
  });
}

/** テーブルの中の種類の項目（名前の印を除く） */
export function typeItems(table: Table): Record<string, unknown>[] {
  return [...table.values()].filter((item) => String(item.sk).startsWith('TYPE#'));
}

/** テーブルの中の名前の印 */
export function nameMarkers(table: Table): Record<string, unknown>[] {
  return [...table.values()].filter((item) => String(item.sk).startsWith('NAME#'));
}

export const DISH_WASHING = 'type-dishes';

export function summarize(list: ChoreType[]): string[] {
  return list.map((type) => `${type.name} ${type.unitPrice}${type.active ? '' : ' (使わない)'}`);
}
