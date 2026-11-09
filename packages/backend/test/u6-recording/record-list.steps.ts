import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { handleRecord } from '../../src/handlers/line/recordHandler';
import type { LineEvent } from '../../src/handlers/line/types';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld, stubLineFetch, type FetchCall } from '../u1-skeleton-family/helpers/world';
import {
  MONTH,
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
} from './helpers/seed';
import { recordListPostback } from './helpers/events';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_U6_DUTY_ID_B,
  FAKE_U6_DUTY_ID_C,
  FAKE_U6_DUTY_ID_D,
  FAKE_U6_DUTY_ID_E,
  fakeU6ChoreTypeId,
  fakeU6DutyId,
} from '../fixtures/fakeSecrets';

const feature = await loadFeature('packages/backend/test/u6-recording/record-list.feature');

type World = ReturnType<typeof setupWorld>;
const asEvent = (e: unknown): LineEvent => e as LineEvent;

/** 固定の「今日」。2027-01-07（JST）。recordedAt は UTC 07:42 = JST 16:42 */
const TODAY = '2027-01-07';
const NOW = new Date('2027-01-07T07:00:00.000Z');
const RECORDED_AT = '2027-01-07T07:42:00.000Z';

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let lineStub: { calls: FetchCall[]; replies: () => FetchCall[] };
  let event: LineEvent;
  let dutySeq = 0;

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'line';
    lineStub = stubLineFetch();
    dutySeq = 0;
    seedHouseholdWithPrices(world);
    event = asEvent(recordListPostback('list-1', { lineUserId: 'U_taro' }));
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const run = async (): Promise<void> => {
    await handleRecord(event, NOW);
  };

  /** 返事の中身（メッセージの配列）を取り出す。 */
  const replyBody = (): { messages: Record<string, unknown>[] } => {
    const calls = lineStub.replies();
    expect(calls).toHaveLength(1);
    return calls[0]?.body as { messages: Record<string, unknown>[] };
  };
  const texts = (): string[] =>
    replyBody()
      .messages.filter((m) => m.type === 'text')
      .map((m) => String(m.text));
  const carousels = (): Record<string, unknown>[] =>
    replyBody().messages.filter((m) => m.type === 'flex');
  const bubbleCount = (): number => {
    const flex = carousels()[0] as { contents?: { contents?: unknown[] } } | undefined;
    return flex?.contents?.contents?.length ?? 0;
  };

  /** 太郎の今日の「未」の担当を 1 件置く（種類は皿洗い）。 */
  const seedTodo = (choreTypeId: string, date = TODAY): void => {
    seedDuty(world.calendar, {
      dutyId: fakeU6DutyId(dutySeq++),
      date,
      choreTypeId,
      childUserId: childId('taro'),
      status: 'todo',
    });
  };
  /** n 件の「未」を、n 個の別々の種類で置く。 */
  const seedTodos = (count: number): void => {
    for (let i = 0; i < count; i++) {
      const choreTypeId = fakeU6ChoreTypeId(i);
      seedChoreType(world.choreTypes, { choreTypeId, name: `仕事${i}`, unitPrice: 100 });
      seedTodo(choreTypeId);
    }
  };

  Scenario(
    '「未」が 1 件のときは carousel と見出しの文を 1 回の返事で返す',
    ({ Given, When, Then }) => {
      Given('山田家がいて、太郎の今日の担当に「未」が 1 件ある', () => {
        seedTodo(choreId('dishes'));
      });
      When('太郎が「やった」を押す', run);
      Then('「どのお手伝いを記録しますか」と 1 個のバブルの carousel が同じ返事に出る', () => {
        expect(texts()).toContain('どのお手伝いを記録しますか');
        expect(bubbleCount()).toBe(1);
      });
    },
  );

  Scenario('「未」が 12 件のときは 12 個のバブル、案内文なし', ({ Given, When, Then }) => {
    Given('山田家がいて、太郎の今日の担当に「未」が 12 件ある', () => {
      seedTodos(12);
    });
    When('太郎が「やった」を押す', run);
    Then('12 個のバブルが出て、あふれの案内文はない', () => {
      expect(bubbleCount()).toBe(12);
      expect(texts()).not.toContain('ほかの担当はアプリから記録してください');
    });
  });

  Scenario('「未」が 13 件のときは先頭 12 個のバブルとあふれの案内文', ({ Given, When, Then }) => {
    Given('山田家がいて、太郎の今日の担当に「未」が 13 件ある', () => {
      seedTodos(13);
    });
    When('太郎が「やった」を押す', run);
    Then('先頭 12 個のバブルと「ほかの担当はアプリから記録してください」が出る', () => {
      expect(bubbleCount()).toBe(12);
      expect(texts()).toContain('ほかの担当はアプリから記録してください');
    });
  });

  Scenario(
    '「未」0 件で「済」1 件のときは案内文と選べない並びが同じ返事に出る',
    ({ Given, When, Then }) => {
      Given('山田家がいて、太郎の今日の担当が皿洗い「済」1 件だけ', () => {
        seedDoneDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_A,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          recordedAt: RECORDED_AT,
          recordedBy: childId('taro'),
          unitPrice: 100,
        });
      });
      When('太郎が「やった」を押す', run);
      Then('「今日記録できる担当はありません」と「皿洗い（済 16:42）」が同じ返事に出る', () => {
        const body = texts().join('\n');
        expect(body).toContain('今日記録できる担当はありません');
        expect(body).toContain('皿洗い（済 16:42）');
        expect(carousels()).toHaveLength(0);
      });
    },
  );

  Scenario('今日の担当が 0 件のときは案内文だけで選べない並びなし', ({ Given, When, Then }) => {
    Given('山田家がいて、太郎の今日の担当が 0 件', () => {
      // 何も置かない
    });
    When('太郎が「やった」を押す', run);
    Then('「今日記録できる担当はありません」だけが出て、選べない並びはない', () => {
      expect(texts()).toEqual(['今日記録できる担当はありません']);
      expect(carousels()).toHaveLength(0);
    });
  });

  Scenario('今日の月が確定しているときは確定済みの文だけ', ({ Given, When, Then }) => {
    Given('山田家がいて、今日の月が確定していて、太郎の今日の担当に「未」がある', () => {
      seedMonthState(world.calendar, MONTH, true);
      seedTodo(choreId('dishes'));
    });
    When('太郎が「やった」を押す', run);
    Then('「この月は確定済みです」だけが出る', () => {
      expect(texts()).toEqual(['この月は確定済みです']);
      expect(carousels()).toHaveLength(0);
    });
  });

  Scenario(
    '「未」と「済」が混在するとき、carousel と選べない並びが同じ返事に出る',
    ({ Given, When, Then }) => {
      Given('山田家がいて、太郎の今日の担当に「未」1 件と「済」1 件がある', () => {
        seedTodo(choreId('laundry'));
        seedDoneDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_B,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          recordedAt: RECORDED_AT,
          recordedBy: childId('taro'),
          unitPrice: 100,
        });
      });
      When('太郎が「やった」を押す', run);
      Then('carousel と「皿洗い（済 16:42）」が同じ返事に出る', () => {
        expect(bubbleCount()).toBe(1);
        expect(texts().join('\n')).toContain('皿洗い（済 16:42）');
      });
    },
  );

  Scenario('「×」の担当は選べない並びに出る', ({ Given, When, Then }) => {
    Given('山田家がいて、太郎の今日の担当に「未」1 件と「×」1 件がある', () => {
      seedTodo(choreId('dishes'));
      seedDuty(world.calendar, {
        dutyId: FAKE_U6_DUTY_ID_C,
        date: TODAY,
        choreTypeId: choreId('laundry'),
        childUserId: childId('taro'),
        status: 'skipped',
      });
    });
    When('太郎が「やった」を押す', run);
    Then('carousel と「洗濯物たたみ（×）」が同じ返事に出る', () => {
      expect(bubbleCount()).toBe(1);
      expect(texts().join('\n')).toContain('洗濯物たたみ（×）');
    });
  });

  Scenario('ほかの日・ほかの子供の担当は含まれない', ({ Given, When, Then }) => {
    Given(
      '山田家がいて、太郎の今日の担当「未」のほかに、花子の今日の担当と太郎の別の日の担当がある',
      () => {
        seedTodo(choreId('dishes'));
        // 花子の今日の担当
        seedDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_D,
          date: TODAY,
          choreTypeId: choreId('laundry'),
          childUserId: childId('hanako'),
          status: 'todo',
        });
        // 太郎の別の日の担当
        seedDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_E,
          date: '2027-01-06',
          choreTypeId: choreId('garbage'),
          childUserId: childId('taro'),
          status: 'todo',
        });
      },
    );
    When('太郎が「やった」を押す', run);
    Then('carousel のバブルは 1 個だけ', () => {
      expect(bubbleCount()).toBe(1);
    });
  });

  Scenario(
    '読み取りは月の状態と今日の担当と種類の一覧だけで、担当の数で増えない',
    ({ Given, When, Then }) => {
      Given('山田家がいて、太郎の今日の担当に「未」が 3 件ある', () => {
        seedTodos(3);
      });
      When('太郎が「やった」を押す', run);
      Then('Calendar の Query は今日の担当の 1 回だけで、ChoreTypes の Query は 1 回', () => {
        const calendarQueries = world.hooks.readLog.filter(
          (e) => e.operation === 'Query' && e.table === CALENDAR_TABLE,
        );
        const choreQueries = world.hooks.readLog.filter(
          (e) => e.operation === 'Query' && e.table === CHORE_TYPES_TABLE,
        );
        expect(calendarQueries).toHaveLength(1);
        expect(choreQueries).toHaveLength(1);
      });
    },
  );
});
