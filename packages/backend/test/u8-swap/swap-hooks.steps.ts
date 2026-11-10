import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { logger } from '../../src/lib/logger';
import {
  notifyDutyReassigned,
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import {
  notifyDutyRecorded,
  onDutyRecorded,
  resetDutyRecordedHooks,
} from '../../src/services/dutyRecordedHook';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_U8_MARKER_DISPLAY_NAME,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u8-swap/swap-hooks.feature');

const FAMILY = 'fam-yamada';

const makeEvents = (
  count: number,
  kind: DutyReassignedEvent['kind'] = 'status-changed',
): DutyReassignedEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    familyId: FAMILY,
    dutyId: fakeU8DutyId(i),
    date: '2027-01-05',
    choreTypeId: FAKE_CHORE_TYPE_ID_1,
    kind,
    fromChildUserId: FAKE_CHILD_USER_ID_1,
  }));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let lines: Record<string, unknown>[];
  let called: string[];
  let running: number;
  let maxRunning: number;
  let order: string[];
  let outcome: 'resolved' | 'threw';

  const rows = (event: string): Record<string, unknown>[] => lines.filter((l) => l.event === event);

  BeforeEachScenario(() => {
    lines = [];
    called = [];
    order = [];
    running = 0;
    maxRunning = 0;
    outcome = 'threw';
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(JSON.parse(String(line)) as Record<string, unknown>);
    });
  });
  AfterEachScenario(() => {
    resetDutyReassignedHooks();
    resetDutyRecordedHooks();
    vi.restoreAllMocks();
  });

  const call = async (events: DutyReassignedEvent[]): Promise<void> => {
    await notifyDutyReassigned(events);
    outcome = 'resolved';
  };
  const slowHook = (): void =>
    onDutyReassigned(async (e) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(1);
      called.push(e.dutyId);
      running -= 1;
    });
  const noopHook = (): void => onDutyReassigned(async (e) => void called.push(e.dutyId));

  Scenario(
    '300 件のイベントでも同時に動く関数は 4 件を超えず、全件が 1 回ずつ呼ばれる',
    ({ Given, When, Then, And }) => {
      Given('時間のかかる関数が 1 つ登録されている', slowHook);
      When('状態が変わった担当 300 件のイベントを渡す', () => call(makeEvents(300)));
      Then('同時に動いた関数の数は最大 4 だった', () => {
        expect(maxRunning).toBe(4);
      });
      And('300 件すべてのイベントが 1 回ずつ呼ばれた', () => {
        expect(called).toHaveLength(300);
        expect(new Set(called).size).toBe(300);
      });
    },
  );

  Scenario('1 つのイベントの中では登録の順に呼ばれる', ({ Given, When, Then }) => {
    Given('関数 A と関数 B が、この順に登録されている', () => {
      onDutyReassigned(async () => {
        order.push('A開始');
        await sleep(5);
        order.push('A終了');
      });
      onDutyReassigned(async () => void order.push('B開始'));
    });
    When('1 件のイベントを渡す', () => call(makeEvents(1)));
    Then('関数 A が終わってから関数 B が呼ばれた', () => {
      expect(order).toEqual(['A開始', 'A終了', 'B開始']);
    });
  });

  Scenario(
    '関数が投げても残りのイベントは続き、投げた件ごとに警告が 1 件出る',
    ({ Given, When, Then, And }) => {
      Given('3 件目と 7 件目のイベントで投げる関数が登録されている', () => {
        onDutyReassigned(async (e) => {
          called.push(e.dutyId);
          if (e.dutyId === fakeU8DutyId(2) || e.dutyId === fakeU8DutyId(6)) {
            throw new Error(`失敗 ${FAKE_U8_MARKER_DISPLAY_NAME}`);
          }
        });
      });
      When('状態が変わった担当 10 件のイベントを渡す', () => call(makeEvents(10)));
      Then('10 件すべてのイベントで関数が呼ばれた', () => {
        expect(called).toHaveLength(10);
      });
      And('警告 DUTY_HOOK_FAILED が 2 件出た', () => {
        const failed = rows('DUTY_HOOK_FAILED');
        expect(failed).toHaveLength(2);
        expect(failed.map((f) => f.dutyId).sort()).toEqual(
          [fakeU8DutyId(2), fakeU8DutyId(6)].sort(),
        );
        expect(failed[0]).toMatchObject({
          level: 'warn',
          familyId: FAMILY,
          kind: 'status-changed',
        });
      });
      And('警告には名前も単価も含まれない', () => {
        // 警告の項目は familyId・dutyId・kind とエラーの種類だけ（子供の ID・種類の ID・単価を書かない）
        for (const row of rows('DUTY_HOOK_FAILED')) {
          const text = JSON.stringify(row);
          expect(text).not.toContain(FAKE_CHILD_USER_ID_1);
          expect(text).not.toContain(FAKE_CHORE_TYPE_ID_1);
          expect(Object.keys(row)).not.toContain('unitPrice');
        }
      });
    },
  );

  Scenario(
    '300 件のうち開いた申し出が 10 件、投げる件が 2 件のとき、ログは必要な行だけ出る',
    ({ Given, And, When, Then }) => {
      Given('申し出を閉じる関数が登録されている', () => {
        onDutyReassigned(async (e) => {
          const index = Number(e.dutyId.slice(-4));
          if (index >= 290 && index < 292) throw new Error('失敗');
          if (index < 10) {
            logger.info({
              event: 'SWAP_OFFER_CLOSED',
              familyId: e.familyId,
              dutyId: e.dutyId,
              via: e.kind,
            });
          }
        });
      });
      And('300 件のうち 10 件は開いた申し出があり 2 件は関数が投げる', () => undefined);
      When('状態が変わった担当 300 件のイベントを渡す', () => call(makeEvents(300)));
      Then('SWAP_OFFER_CLOSED が 10 件出た', () => {
        expect(rows('SWAP_OFFER_CLOSED')).toHaveLength(10);
      });
      And('DUTY_HOOKS_DONE が 1 件出て、件数は 300、失敗は 2、並行数は 4 である', () => {
        const done = rows('DUTY_HOOKS_DONE');
        expect(done).toHaveLength(1);
        expect(done[0]).toMatchObject({
          level: 'info',
          familyId: FAMILY,
          count: 300,
          failed: 2,
          concurrency: 4,
        });
        expect(typeof done[0]?.durationMs).toBe('number');
      });
      And('DUTY_HOOK_FAILED が 2 件出た', () => {
        expect(rows('DUTY_HOOK_FAILED')).toHaveLength(2);
      });
      And('条件で断られた 288 件はログに出ない', () => {
        // 300 件のうち、閉じた 10 件と投げた 2 件のほかに、個別の行は出ない
        const individual = lines.filter(
          (l) => typeof l.dutyId === 'string' && l.event !== 'DUTY_HOOKS_DONE',
        );
        expect(individual).toHaveLength(12);
      });
    },
  );

  Scenario(
    '種類が 1 つだけのとき DUTY_HOOKS_DONE の kind は文字列になる',
    ({ Given, When, Then }) => {
      Given('何もしない関数が登録されている', noopHook);
      When('状態が変わった担当 5 件のイベントを渡す', () => call(makeEvents(5)));
      Then('DUTY_HOOKS_DONE の kind は文字列 status-changed である', () => {
        expect(rows('DUTY_HOOKS_DONE')[0]?.kind).toBe('status-changed');
      });
    },
  );

  Scenario(
    '種類が混ざるとき DUTY_HOOKS_DONE の kind は種類ごとの件数になる',
    ({ Given, When, Then }) => {
      Given('何もしない関数が登録されている', noopHook);
      When('担当の子供が変わった 2 件と状態が変わった 3 件のイベントを渡す', () =>
        call([...makeEvents(2, 'child-changed'), ...makeEvents(3, 'status-changed')]),
      );
      Then('DUTY_HOOKS_DONE の kind は種類ごとの件数で、合計は件数と一致する', () => {
        const done = rows('DUTY_HOOKS_DONE')[0] as { kind: Record<string, number>; count: number };
        expect(done.kind).toEqual({ 'child-changed': 2, 'status-changed': 3 });
        expect(Object.values(done.kind).reduce((a, b) => a + b, 0)).toBe(done.count);
      });
    },
  );

  Scenario('イベントが 1 件だけでも DUTY_HOOKS_DONE は出る', ({ Given, When, Then }) => {
    Given('何もしない関数が登録されている', noopHook);
    When('1 件のイベントを渡す', () => call(makeEvents(1)));
    Then('DUTY_HOOKS_DONE が 1 件出て、件数は 1 である', () => {
      const done = rows('DUTY_HOOKS_DONE');
      expect(done).toHaveLength(1);
      expect(done[0]).toMatchObject({ count: 1, failed: 0 });
    });
  });

  Scenario('登録された関数がなければ何もせず、ログも出ない', ({ Given, When, Then }) => {
    Given('関数は登録されていない', () => undefined);
    When('状態が変わった担当 5 件のイベントを渡す', () => call(makeEvents(5)));
    Then('ログは 1 行も出ない', () => {
      expect(lines).toEqual([]);
    });
  });

  Scenario('イベントの一覧が空のとき何もしない', ({ Given, When, Then }) => {
    Given('何もしない関数が登録されている', noopHook);
    When('空のイベントの一覧を渡す', () => call([]));
    Then('ログは 1 行も出ない', () => {
      expect(lines).toEqual([]);
      expect(called).toEqual([]);
    });
  });

  Scenario('関数が投げても呼び出し元には何も投げず、結果は変わらない', ({ Given, When, Then }) => {
    Given('すべてのイベントで投げる関数が登録されている', () => {
      onDutyReassigned(async () => {
        throw new Error('失敗');
      });
    });
    When('状態が変わった担当 3 件のイベントを渡す', () => call(makeEvents(3)));
    Then('呼び出しは正常に終わる', () => {
      expect(outcome).toBe('resolved');
      expect(rows('DUTY_HOOKS_DONE')[0]).toMatchObject({ count: 3, failed: 3 });
    });
  });

  Scenario('担当が済になったことを伝える仕組みは 1 件ずつのまま動く', ({ Given, When, Then }) => {
    Given('済になったことを伝える関数が 1 つ登録されている', () => {
      onDutyRecorded(async (e) => void called.push(e.dutyId));
    });
    When('済になった担当 1 件を伝える', () =>
      notifyDutyRecorded({
        familyId: FAMILY,
        dutyId: fakeU8DutyId(0),
        date: '2027-01-05',
        choreTypeId: FAKE_CHORE_TYPE_ID_1,
        childUserId: FAKE_CHILD_USER_ID_1,
      }),
    );
    Then('関数は 1 回呼ばれ、DUTY_HOOKS_DONE は出ない', () => {
      expect(called).toEqual([fakeU8DutyId(0)]);
      expect(rows('DUTY_HOOKS_DONE')).toHaveLength(0);
    });
  });

  Scenario('打ち切りの警告は段階 1 では出ない', ({ Given, When, Then }) => {
    Given('時間のかかる関数が 1 つ登録されている', slowHook);
    When('状態が変わった担当 300 件のイベントを渡す', () => call(makeEvents(300)));
    Then('DUTY_HOOKS_TRUNCATED は出ない', () => {
      expect(rows('DUTY_HOOKS_TRUNCATED')).toHaveLength(0);
    });
  });
});
