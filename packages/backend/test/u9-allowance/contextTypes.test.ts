import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Role } from '@housework/shared';
import {
  requireMembership,
  type FamilyContext,
  type FamilyScope,
  type ReadContext,
  type SystemContext,
} from '../../src/middleware/requireMembership';
import * as choreTypeService from '../../src/services/choreTypeService';
import * as calendarService from '../../src/services/calendarService';

/** 実行はしない。型だけを確かめるための関数（tsc が検査する）。 */
function typeOnly(): void {
  const system: SystemContext = { familyId: 'f', role: 'system' };
  // @ts-expect-error 書き込みの窓口に role: system の文脈は渡せない
  void calendarService.confirmMonth(system, '2027-01');
  // @ts-expect-error 文脈の role に system は書けない（FamilyContext の role は admin／child のみ）
  const bad: FamilyContext = { familyId: 'f', userId: 'u', role: 'system' };
  void bad;
  const scope: FamilyScope = { familyId: 'f' };
  void choreTypeService.list(scope);
}
void typeOnly;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('文脈の型（NFR2.73、NFR4.90、ADR-U9-01）', () => {
  it('requireMembership の戻りは FamilyContext で、role は admin／child のみ', () => {
    expectTypeOf(requireMembership).returns.toEqualTypeOf<FamilyContext>();
    expectTypeOf<FamilyContext['role']>().toEqualTypeOf<Role>();
    expectTypeOf<'system'>().not.toExtend<Role>();
  });

  it('ReadContext は FamilyContext | SystemContext', () => {
    expectTypeOf<ReadContext>().toEqualTypeOf<FamilyContext | SystemContext>();
    expectTypeOf<SystemContext['role']>().toEqualTypeOf<'system'>();
    expectTypeOf<FamilyContext>().toExtend<FamilyScope>();
    expectTypeOf<SystemContext>().toExtend<FamilyScope>();
  });

  it('choreTypeService.list は FamilyScope を受ける', () => {
    expectTypeOf(choreTypeService.list).parameter(0).toEqualTypeOf<FamilyScope>();
  });

  it('requireMembership は system を作らない（メンバーでなければ 403）', () => {
    expect(() => requireMembership({ userId: 'u' } as never)).toThrow();
  });

  it('handlers と entries/api.ts は SystemContext を import していない', () => {
    const root = join(__dirname, '../../src');
    const files = [...sourceFiles(join(root, 'handlers')), join(root, 'entries/api.ts')];
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/SystemContext/);
    }
  });
});
