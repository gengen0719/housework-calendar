import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ASSIGNMENT_MAX_CHORE_TYPES } from '@housework/shared';
import * as calendarRepository from '../../src/repositories/calendarRepository';
import {
  chunkSize,
  splitIntoChunks,
  TRANSACTION_ITEM_LIMIT,
  type DutyOperation,
} from '../../src/services/assignmentPlanner';
import type { DutyRecord } from '../../src/models';
import { FAKE_CHILD_USER_ID_1, FAKE_CHILD_USER_ID_2 } from '../fixtures/fakeSecrets';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';

const existing = (date: string, choreTypeId: string): DutyRecord => ({
  dutyId: randomUUID(),
  familyId: FAMILY_ID,
  month: '2027-01',
  date,
  choreTypeId,
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 1,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2026-12-20T00:00:00.000Z',
});

/** 作る・消す・変えるを混ぜた、大きな操作の並び（種類は 4 つ） */
function mixedOperations(count: number): DutyOperation[] {
  const types = Array.from({ length: 4 }, () => randomUUID());
  return Array.from({ length: count }, (_, index): DutyOperation => {
    const date = `2027-01-${String((index % 28) + 1).padStart(2, '0')}`;
    const choreTypeId = types[index % 4] as string;
    if (index % 3 === 0) {
      return {
        kind: 'create',
        date,
        choreTypeId,
        childUserId: FAKE_CHILD_USER_ID_2,
        dutyId: randomUUID(),
      };
    }
    if (index % 3 === 1) {
      return {
        kind: 'change',
        duty: existing(date, choreTypeId),
        toChildUserId: FAKE_CHILD_USER_ID_2,
      };
    }
    return { kind: 'delete', duty: existing(date, choreTypeId) };
  });
}

describe('保存の取引の項目数（NFR2.28）', () => {
  it('作る・消す・変えるを混ぜた 500 件でも、どのチャンクも 100 項目を超えない', () => {
    const chunks = splitIntoChunks(mixedOperations(500));
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks)
      expect(chunkSize(chunk)).toBeLessThanOrEqual(TRANSACTION_ITEM_LIMIT);
  });

  it('チャンクをつなぐと、元の操作が順番もそのまま 1 つも欠けず重複しない', () => {
    const operations = mixedOperations(200);
    const rejoined = splitIntoChunks(operations).flat();
    expect(rejoined).toEqual(operations);
  });

  it('同じ入力からいつも同じチャンクになる', () => {
    const operations = mixedOperations(150);
    const sizes = (chunks: DutyOperation[][]) => chunks.map((chunk) => chunk.length);
    expect(sizes(splitIntoChunks(operations))).toEqual(sizes(splitIntoChunks(operations)));
  });

  it('実際の取引の項目数（書く項目と確かめ）を数えた値が、チャンクの大きさと一致する', () => {
    setupWorld();
    const operations = mixedOperations(60);
    const [chunk] = splitIntoChunks(operations);
    expect(chunk).toBeDefined();
    const items: unknown[] = [];
    for (const operation of chunk ?? []) {
      if (operation.kind === 'create') {
        items.push(
          ...calendarRepository.buildCreateDutyItems({
            ...existing(operation.date, operation.choreTypeId),
            dutyId: operation.dutyId,
          }),
        );
      } else if (operation.kind === 'change') {
        items.push(
          calendarRepository.buildChangeChildItem(
            operation.duty,
            operation.toChildUserId,
            'rule',
            new Date(),
          ),
        );
      } else {
        items.push(...calendarRepository.buildDeleteDutyItems(operation.duty));
      }
    }
    // 月の確かめ 1 + 作る・変えるに出る種類の数（4）
    items.push(calendarRepository.buildMonthGuard(FAMILY_ID, '2027-01'));
    for (let index = 0; index < 4; index++) {
      items.push(calendarRepository.buildChoreTypeGuard(FAMILY_ID, randomUUID()));
    }
    expect(items.length).toBe(chunkSize(chunk ?? []));
  });

  it('割り当ての書き込みは、種類が最大の 90 個でも 92 項目で、100 に収まる', () => {
    setupWorld();
    const choreTypeIds = Array.from({ length: ASSIGNMENT_MAX_CHORE_TYPES }, () => randomUUID());
    const items = [
      calendarRepository.buildAssignmentPut({
        familyId: FAMILY_ID,
        month: '2027-01',
        rules: [],
        choreTypeIds: new Set(choreTypeIds),
        updatedAt: '2027-01-13T03:00:00.000Z',
        updatedByUserId: 'user-mother',
      }),
      calendarRepository.buildMonthGuard(FAMILY_ID, '2027-01'),
      ...choreTypeIds.map((id) => calendarRepository.buildChoreTypeGuard(FAMILY_ID, id)),
    ];
    expect(items).toHaveLength(92);
    expect(items.length).toBeLessThanOrEqual(TRANSACTION_ITEM_LIMIT);
  });
});
