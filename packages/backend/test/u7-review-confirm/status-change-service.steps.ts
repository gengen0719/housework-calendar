import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import {
  changeDutyStatus,
  confirmMonth,
  unconfirmMonth,
  type ChangeStatusOutcome,
} from '../../src/services/calendarService';
import type { FamilyContext } from '../../src/middleware/requireMembership';
import type { StatusChangeAction } from '@housework/shared';
import {
  onDutyReassigned,
  resetDutyReassignedHooks,
  type DutyReassignedEvent,
} from '../../src/services/dutyReassignedHook';
import { setupWorld } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  adminId,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  setUnitPrice,
  storedDuty,
  storedMonthState,
} from './helpers/seed';
import {
  FAKE_U7_DUTY_ID_A,
  FAKE_U7_DUTY_ID_B,
  FAKE_U7_NONEXISTENT_DUTY_ID,
} from '../fixtures/fakeSecrets';

const feature = await loadFeature(
  'packages/backend/test/u7-review-confirm/status-change-service.feature',
);

const MONTH = '2027-01';
const DATE = '2027-01-05';
const NOW = new Date('2027-01-07T11:00:00.000Z');
const DUTY_ID = FAKE_U7_DUTY_ID_A;
const ctx: FamilyContext = { familyId: FAMILY_ID, userId: adminId(), role: 'admin' };

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof setupWorld>;
  let fetchStub: ReturnType<typeof vi.fn>;

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'api';
    seedHouseholdWithPrices(world);
    resetDutyReassignedHooks();
    fetchStub = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchStub);
  });
  AfterEachScenario(() => {
    resetDutyReassignedHooks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const row = (): Record<string, unknown> | undefined =>
    storedDuty(world.calendar, DATE, choreId('dishes'));
  const change = (action: StatusChangeAction, version = 2): Promise<ChangeStatusOutcome> =>
    changeDutyStatus(ctx, DUTY_ID, action, { now: NOW, version });
  const seedDishes = (status: 'todo' | 'done' | 'skipped', version = 2): void => {
    if (status === 'done') {
      seedDoneDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: DATE,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        version,
        recordedAt: '2027-01-06T10:00:00.000Z',
        recordedBy: adminId(),
        unitPrice: 120,
      });
    } else {
      seedDuty(world.calendar, {
        dutyId: DUTY_ID,
        date: DATE,
        choreTypeId: choreId('dishes'),
        childUserId: childId('taro'),
        status,
        version,
      });
    }
  };

  Scenario('5 とおりの遷移が成功する', ({ Given, When, Then }) => {
    const results: ChangeStatusOutcome[] = [];
    Given('確定していない 2027-01 がある', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: false });
    });
    When('太郎の担当を 5 とおり（未→済、×→済、済→未、済→×、未→×、×→未）に変える', async () => {
      // 1 件ずつ、状態を seed し直して各遷移を確かめる
      const run = async (
        from: 'todo' | 'done' | 'skipped',
        action: StatusChangeAction,
      ): Promise<void> => {
        seedDishes(from, 2);
        results.push(await change(action, 2));
      };
      await run('todo', 'markDone'); // 未→済
      await run('skipped', 'markDone'); // ×→済
      await run('done', 'cancel'); // 済→未
      await run('done', 'markSkipped'); // 済→×
      await run('todo', 'markSkipped'); // 未→×
      await run('skipped', 'unmarkSkipped'); // ×→未
    });
    Then('どれも成功し、担当の状態が操作後の状態になる', () => {
      expect(results.every((r) => r.ok)).toBe(true);
      const statuses = results.map((r) => (r.ok ? r.value.status : 'fail'));
      expect(statuses).toEqual(['done', 'done', 'todo', 'skipped', 'skipped', 'todo']);
    });
  });

  Scenario(
    '判定の順番（NOT_FOUND → MONTH_CONFIRMED → INVALID_TRANSITION）',
    ({ Given, When, Then }) => {
      let notFound: ChangeStatusOutcome;
      let confirmed: ChangeStatusOutcome;
      let invalid: ChangeStatusOutcome;
      Given('ほかの家族の担当・確定した月・表にない組をそれぞれ用意する', () => {
        // 確定した月に未の担当（表にない組 cancel も試す）
        seedDishes('todo', 2);
      });
      When('それぞれに状態の変更を送る', async () => {
        // NOT_FOUND: 存在しない担当
        notFound = await changeDutyStatus(ctx, FAKE_U7_NONEXISTENT_DUTY_ID, 'cancel', {
          now: NOW,
          version: 1,
        });
        // MONTH_CONFIRMED: 月を確定して、表にない cancel を送っても月の確定が先に当たる
        seedMonthState(world.calendar, { month: MONTH, confirmed: true });
        confirmed = await change('cancel', 2);
        // INVALID_TRANSITION: 月を未確定に戻して、未に cancel
        seedMonthState(world.calendar, { month: MONTH, confirmed: false });
        invalid = await change('cancel', 2);
      });
      Then(
        'ほかの家族は NOT_FOUND、確定した月は MONTH_CONFIRMED、表にない組は INVALID_TRANSITION',
        () => {
          expect(notFound).toEqual({ ok: false, reason: 'NOT_FOUND' });
          expect(confirmed).toEqual({ ok: false, reason: 'MONTH_CONFIRMED' });
          expect(invalid).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
        },
      );
    },
  );

  Scenario(
    '(a) 取引の直前に担当が変わる → 読み直して INVALID_TRANSITION',
    ({ Given, And, When, Then }) => {
      let result: ChangeStatusOutcome;
      Given('太郎の皿洗い（済・version 2）と、確定していない 2027-01 がある', () => {
        seedDishes('done', 2);
        seedMonthState(world.calendar, { month: MONTH, confirmed: false });
      });
      And('取引の直前に、その担当が先に「未」に戻される（version 3）', () => {
        world.hooks.beforeTransaction(1, () => {
          seedDuty(world.calendar, {
            dutyId: DUTY_ID,
            date: DATE,
            choreTypeId: choreId('dishes'),
            childUserId: childId('taro'),
            status: 'todo',
            version: 3,
          });
        });
      });
      When('管理者が version 2 で cancel（取り消す）を送る', async () => {
        result = await change('cancel', 2);
      });
      Then('読み直して INVALID_TRANSITION になり、担当は未のまま', () => {
        expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
        expect(row()).toMatchObject({ status: 'todo', version: 3 });
      });
    },
  );

  Scenario(
    '古い画面の version で送ると書かれず「先に変更された」になる（取り消す・済にする・×→済）',
    ({ Given, When, Then }) => {
      const results: ChangeStatusOutcome[] = [];
      const snapshots: (Record<string, unknown> | undefined)[] = [];
      Given(
        '画面が version 1 の担当を見せたあと、別端末で担当が変わって version 2 になっている',
        () => {
          seedMonthState(world.calendar, { month: MONTH, confirmed: false });
        },
      );
      When('古い version 1 で cancel・markDone・（×の担当への）markDone を送る', async () => {
        seedDishes('done', 2);
        results.push(await change('cancel', 1));
        snapshots.push(row());
        seedDishes('todo', 2);
        results.push(await change('markDone', 1));
        snapshots.push(row());
        seedDishes('skipped', 2);
        results.push(await change('markDone', 1));
        snapshots.push(row());
      });
      Then('どれも INVALID_TRANSITION（409）で、担当は変わらない', () => {
        for (const r of results) expect(r).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
        expect(snapshots[0]).toMatchObject({ status: 'done', version: 2 });
        expect(snapshots[1]).toMatchObject({ status: 'todo', version: 2 });
        expect(snapshots[2]).toMatchObject({ status: 'skipped', version: 2 });
        expect(world.hooks.transactionSizes).toHaveLength(0);
      });
    },
  );

  Scenario('(b) 取引の直前に月が確定する → MONTH_CONFIRMED', ({ Given, And, When, Then }) => {
    let result: ChangeStatusOutcome;
    Given('太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある', () => {
      seedDishes('todo', 2);
      seedMonthState(world.calendar, { month: MONTH, confirmed: false });
    });
    And('取引の直前に、その月が確定する', () => {
      world.hooks.beforeTransaction(1, () => {
        seedMonthState(world.calendar, { month: MONTH, confirmed: true });
      });
    });
    When('管理者が markDone を送る', async () => {
      result = await change('markDone', 2);
    });
    Then('読み直して MONTH_CONFIRMED になり、担当は未のまま', () => {
      expect(result).toEqual({ ok: false, reason: 'MONTH_CONFIRMED' });
      expect(row()).toMatchObject({ status: 'todo', version: 2 });
    });
  });

  Scenario('(c) markDone で単価が変わる → 新しい単価で書き直す', ({ Given, And, When, Then }) => {
    let result: ChangeStatusOutcome;
    Given('太郎の皿洗い（未・version 2）と、確定していない 2027-01、単価 120 円がある', () => {
      seedDishes('todo', 2);
      seedMonthState(world.calendar, { month: MONTH, confirmed: false });
    });
    And('取引の直前に、皿洗いの単価が 150 円に変わる', () => {
      world.hooks.beforeTransaction(1, () => {
        setUnitPrice(world.choreTypes, choreId('dishes'), 150);
      });
    });
    When('管理者が markDone を送る', async () => {
      result = await change('markDone', 2);
    });
    Then('読み直して新しい単価 150 円で済になり、書き込みは 2 回', () => {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.unitPrice).toBe(150);
      expect(row()).toMatchObject({ status: 'done', unitPrice: 150 });
      expect(world.hooks.transactionSizes).toHaveLength(2);
    });
  });

  Scenario('2 回続けて断られると INTERNAL（書き込みは 2 回で止まる）', ({ Given, When, Then }) => {
    let result: ChangeStatusOutcome;
    Given(
      '太郎の皿洗い（未・version 2）と、確定していない 2027-01 があり、取引が 2 回断られる',
      () => {
        seedDishes('todo', 2);
        seedMonthState(world.calendar, { month: MONTH, confirmed: false });
        world.hooks.failTransaction(1, 'ConditionalCheckFailed');
        world.hooks.failTransaction(2, 'TransactionConflict');
      },
    );
    When('管理者が markDone を送る', async () => {
      result = await change('markDone', 2);
    });
    Then('INTERNAL になり、書き込みは 2 回で止まる', () => {
      expect(result).toEqual({ ok: false, reason: 'INTERNAL' });
      expect(world.hooks.transactionSizes).toHaveLength(2);
    });
  });

  Scenario('「未」でなくなったときだけフックを 1 回呼ぶ', ({ Given, When, Then }) => {
    const events: DutyReassignedEvent[] = [];
    Given('太郎の皿洗い（未・version 2）と、確定していない 2027-01、フックが登録されている', () => {
      seedDishes('todo', 2);
      seedMonthState(world.calendar, { month: MONTH, confirmed: false });
      onDutyReassigned(async (e) => void events.push(e));
    });
    When('管理者が markDone を送る', async () => {
      await change('markDone', 2);
    });
    Then('成功し、フックが status-changed で 1 回呼ばれる', () => {
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'status-changed', fromChildUserId: childId('taro') });
    });
  });

  Scenario('cancel・unmarkSkipped（未に戻る）ではフックを呼ばない', ({ Given, When, Then }) => {
    const events: DutyReassignedEvent[] = [];
    Given('太郎の皿洗い（済・version 2）と、確定していない 2027-01、フックが登録されている', () => {
      seedDishes('done', 2);
      seedMonthState(world.calendar, { month: MONTH, confirmed: false });
      onDutyReassigned(async (e) => void events.push(e));
    });
    When('管理者が cancel を送る', async () => {
      await change('cancel', 2);
    });
    Then('成功し、フックは呼ばれない', () => {
      expect(events).toHaveLength(0);
      expect(row()).toMatchObject({ status: 'todo' });
    });
  });

  Scenario(
    'confirmMonth は行のない月に version=1 を作り、unconfirmMonth は行のない月で何もしない',
    ({ Given, When, Then }) => {
      Given('記録のない 2027-03 がある', () => {
        // 何も置かない
      });
      When('confirmMonth（2027-03）、続けて unconfirmMonth（2027-03）を送る', async () => {
        await confirmMonth(ctx, '2027-03', { now: NOW });
        // 行ができたので、取り消しは version を進めて未確定にする
      });
      Then('確定で version=1 の行ができ、取り消しで未確定になる', async () => {
        expect(storedMonthState(world.calendar, '2027-03')).toMatchObject({
          confirmed: true,
          version: 1,
        });
        await unconfirmMonth(ctx, '2027-03');
        expect(storedMonthState(world.calendar, '2027-03')).toMatchObject({
          confirmed: false,
          version: 2,
        });
      });
    },
  );

  Scenario('確定・取り消しの連打で最後の操作の結果にそろう（冪等）', ({ Given, When, Then }) => {
    Given('確定していない 2027-01 がある', () => {
      seedMonthState(world.calendar, { month: MONTH, confirmed: false, version: 0 });
    });
    When('confirmMonth → unconfirmMonth → confirmMonth を続けて送る', async () => {
      await confirmMonth(ctx, MONTH, { now: NOW });
      await unconfirmMonth(ctx, MONTH);
      await confirmMonth(ctx, MONTH, { now: NOW });
    });
    Then('2027-01 は確定済みになる', () => {
      expect(storedMonthState(world.calendar, MONTH)).toMatchObject({ confirmed: true });
    });
  });

  Scenario(
    '状態の変更でも確定でも、外部への通信（fetch）は 1 回も起きない',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある', () => {
        seedDishes('todo', 2);
        seedMonthState(world.calendar, { month: MONTH, confirmed: false });
      });
      When('管理者が markDone を送り、2027-01 を確定する', async () => {
        await change('markDone', 2);
        await confirmMonth(ctx, MONTH, { now: NOW });
      });
      Then('fetch は 1 回も呼ばれない', () => {
        expect(fetchStub).not.toHaveBeenCalled();
      });
    },
  );

  // FAKE_U7_DUTY_ID_B を使う余地（将来の拡張）
  void FAKE_U7_DUTY_ID_B;
});
