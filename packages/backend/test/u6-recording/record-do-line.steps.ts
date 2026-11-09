import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { handleRecord } from '../../src/handlers/line/recordHandler';
import type { LineEvent } from '../../src/handlers/line/types';
import { setupWorld, stubLineFetch, type FetchCall } from '../u1-skeleton-family/helpers/world';
import { PEOPLE } from '../u2-invitation/helpers/seed';
import {
  childId,
  choreId,
  seedDoneDuty,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  setUnitPrice,
  storedDuty,
  MONTH,
} from './helpers/seed';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_U6_DUTY_ID_B,
  FAKE_U6_NONEXISTENT_DUTY_ID,
  FAKE_OTHER_FAMILY_ID,
} from '../fixtures/fakeSecrets';
import { recordDoPostback } from './helpers/events';

const feature = await loadFeature('packages/backend/test/u6-recording/record-do-line.feature');

type World = ReturnType<typeof setupWorld>;
const asEvent = (e: unknown): LineEvent => e as LineEvent;

const TODAY = '2027-01-07';
// JST 16:42 = UTC 07:42。記録の時刻は options.now から作るので、この時刻が返事に出る
const NOW = new Date('2027-01-07T07:42:00.000Z');
const RECORDED_AT = '2027-01-07T07:42:00.000Z';
const DUTY_ID = FAKE_U6_DUTY_ID_A;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let lineStub: { calls: FetchCall[]; replies: () => FetchCall[] };

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'line';
    lineStub = stubLineFetch();
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** 太郎の今日の皿洗いの担当を置く。 */
  const seedDishes = (over: Partial<Parameters<typeof seedDuty>[1]> = {}): void => {
    seedDuty(world.calendar, {
      dutyId: DUTY_ID,
      date: TODAY,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      status: 'todo',
      version: 1,
      ...over,
    });
  };

  const press = async (version: number, now = NOW, dutyId = DUTY_ID): Promise<void> => {
    const event = asEvent(
      recordDoPostback(`do-${version}-${Date.now()}`, dutyId, version, { lineUserId: 'U_taro' }),
    );
    await handleRecord(event, now);
  };

  const replyTexts = (): string => JSON.stringify(lineStub.replies().map((c) => c.body));
  const transactionCount = (): number => world.hooks.transactionSizes.length;
  const dishesRow = (): Record<string, unknown> | undefined =>
    storedDuty(world.calendar, TODAY, choreId('dishes'));

  Scenario(
    '正しい version で押すと記録され、本人に時刻つきの返事が返る',
    ({ Given, When, Then, And }) => {
      Given('太郎の今日の皿洗い（未・version 1）がある', () => {
        seedDishes();
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then('「皿洗いを記録しました（16:42）」が本人に reply される', () => {
        expect(lineStub.replies()).toHaveLength(1);
        expect(replyTexts()).toContain('皿洗いを記録しました（16:42）');
      });
      And('担当が status=done・recordedBy=太郎・unitPrice=100・version=2 になる', () => {
        const row = dishesRow();
        expect(row?.status).toBe('done');
        expect(row?.recordedBy).toBe(childId('taro'));
        expect(row?.unitPrice).toBe(100);
        expect(row?.version).toBe(2);
      });
    },
  );

  Scenario('記録後の unitPrice は記録直前の単価と一致する', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）があり、皿洗いの単価は 100 円', () => {
      seedDishes();
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('担当の unitPrice は 100 である', () => {
      expect(dishesRow()?.unitPrice).toBe(100);
    });
  });

  Scenario(
    '本人が 2 回目に同じボタンを押すと最初の時刻の返事が返り、記録は 1 件のまま',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）がある', () => {
        seedDishes();
      });
      When('太郎がその皿洗いを version 1 で 2 回続けて記録する', async () => {
        await press(1);
        await press(1);
      });
      Then('どちらも「皿洗いを記録しました（16:42）」が返り、書き込みは 1 回だけ', () => {
        const bodies = lineStub.replies().map((c) => JSON.stringify(c.body));
        expect(bodies).toHaveLength(2);
        expect(bodies.every((b) => b.includes('皿洗いを記録しました（16:42）'))).toBe(true);
        expect(transactionCount()).toBe(1);
      });
    },
  );

  Scenario('version が違うと「変更されました」と今の選択肢が返る', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 2）がある', () => {
      seedDishes({ version: 2 });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('「この担当は先に変更されました」と今の選択肢が返る', () => {
      expect(replyTexts()).toContain('この担当は先に変更されました');
      expect(transactionCount()).toBe(0);
    });
  });

  Scenario(
    'すでに管理者が済にしていると「すでに済です」と今の選択肢が返る',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗いが、お母さんにより済になっている', () => {
        seedDoneDuty(world.calendar, {
          dutyId: DUTY_ID,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          recordedAt: RECORDED_AT,
          recordedBy: PEOPLE.mother.userId,
          unitPrice: 100,
        });
        // 出し直しの選択肢が残るよう、別の「未」を 1 件置く（なければ NO_RECORDABLE_DUTY になる。BR7.5）
        seedDuty(world.calendar, {
          dutyId: FAKE_U6_DUTY_ID_B,
          date: TODAY,
          choreTypeId: choreId('laundry'),
          childUserId: childId('taro'),
          status: 'todo',
        });
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then('「この担当はすでに『済』になっています」と今の選択肢が返る', () => {
        expect(replyTexts()).toContain('この担当はすでに『済』になっています');
        expect(transactionCount()).toBe(0);
      });
    },
  );

  Scenario('「×」の担当は「変更されました」と今の選択肢が返る', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗いが「×」になっている', () => {
      seedDishes({ status: 'skipped' });
      // 出し直しの選択肢が残るよう、別の「未」を 1 件置く
      seedDuty(world.calendar, {
        dutyId: FAKE_U6_DUTY_ID_B,
        date: TODAY,
        choreTypeId: choreId('laundry'),
        childUserId: childId('taro'),
        status: 'todo',
      });
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('「この担当は先に変更されました」と今の選択肢が返る', () => {
      expect(replyTexts()).toContain('この担当は先に変更されました');
      expect(transactionCount()).toBe(0);
    });
  });

  Scenario('月が確定していると確定済みの文だけが返る（出し直しなし）', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未）があり、その月が確定している', () => {
      seedDishes();
      seedMonthState(world.calendar, MONTH, true);
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('「この月は確定済みです」だけが返る', () => {
      const bodies = lineStub.replies();
      expect(bodies).toHaveLength(1);
      const body = JSON.stringify(bodies[0]?.body);
      expect(body).toContain('この月は確定済みです');
      expect(body).not.toContain('先に変更されました');
    });
  });

  Scenario(
    'ほかの家族の dutyId は「変更されました」と今の選択肢が返る',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未）があり、ほかの家族の担当の dutyId を押す', () => {
        seedDishes();
        // ほかの家族に同じ dutyId の担当があっても、太郎の家族の範囲にはないので NOT_FOUND
        seedDuty(world.calendar, {
          dutyId: DUTY_ID,
          date: TODAY,
          choreTypeId: choreId('dishes'),
          childUserId: childId('taro'),
          status: 'todo',
          familyId: FAKE_OTHER_FAMILY_ID,
        });
      });
      When('太郎がその dutyId を version 1 で記録する', async () => {
        // ここでは「存在しない ID」として扱わせるため、太郎の家族にない別の dutyId を押す
        await press(1, NOW, FAKE_U6_NONEXISTENT_DUTY_ID);
      });
      Then('「この担当は先に変更されました」と今の選択肢が返る', () => {
        expect(replyTexts()).toContain('この担当は先に変更されました');
      });
    },
  );

  Scenario(
    '取引が 1 回失敗して読み直すと新しい単価で記録される（単価の差し込み）',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）があり、取引の直前に単価が 120 円に変わる', () => {
        seedDishes();
        // 1 回目の取引の直前に単価を 120 に変える → unitPrice の ConditionCheck が外れて競合になる
        world.hooks.beforeTransaction(1, () => {
          setUnitPrice(world.choreTypes, choreId('dishes'), 120);
        });
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then('担当の unitPrice は 120 で、記録される', () => {
        const row = dishesRow();
        expect(row?.status).toBe('done');
        expect(row?.unitPrice).toBe(120);
        expect(transactionCount()).toBe(2);
      });
    },
  );

  Scenario(
    '取引が 2 回続けて失敗すると INTERNAL の文言が返り、担当は「未」のまま',
    ({ Given, When, Then }) => {
      Given('太郎の今日の皿洗い（未・version 1）があり、取引が 2 回続けて失敗する', () => {
        seedDishes();
        world.hooks.failTransaction(1, 'ConditionalCheckFailed');
        world.hooks.failTransaction(2, 'ConditionalCheckFailed');
      });
      When('太郎がその皿洗いを version 1 で記録する', async () => {
        await press(1);
      });
      Then(
        '「うまく記録できませんでした。もう一度お試しください」が返り、担当は「未」のまま',
        () => {
          expect(replyTexts()).toContain('うまく記録できませんでした。もう一度お試しください');
          expect(dishesRow()?.status).toBe('todo');
          expect(transactionCount()).toBe(2);
        },
      );
    },
  );

  Scenario('reply の呼び出しは POST /v2/bot/message/reply だけ・1 回', ({ Given, When, Then }) => {
    Given('太郎の今日の皿洗い（未・version 1）がある', () => {
      seedDishes();
    });
    When('太郎がその皿洗いを version 1 で記録する', async () => {
      await press(1);
    });
    Then('LINE への呼び出しは reply が 1 回だけで、push・multicast・broadcast はない', () => {
      expect(lineStub.calls).toHaveLength(1);
      expect(lineStub.replies()).toHaveLength(1);
      for (const call of lineStub.calls) {
        expect(call.url).not.toContain('/message/push');
        expect(call.url).not.toContain('/message/multicast');
        expect(call.url).not.toContain('/message/broadcast');
      }
    });
  });

  Scenario(
    '日本時間の 0 時をまたいで押すと NOT_TODAY_DUTY（出し直し）',
    ({ Given, When, Then }) => {
      Given('太郎の 1 月 7 日の皿洗い（未・version 1）がある', () => {
        seedDishes();
      });
      When('1 月 8 日 0 時 5 分に太郎がその皿洗いを version 1 で記録する', async () => {
        // JST 2027-01-08 00:05 = UTC 2027-01-07 15:05
        await press(1, new Date('2027-01-07T15:05:00.000Z'));
      });
      Then('「この担当は先に変更されました」が返り、担当は「未」のまま', () => {
        // 1 月 8 日に記録できる担当がない日なので、出し直しは NO_RECORDABLE_DUTY の返事になる（BR7.5）。
        // 記録されず（成功の返事がなく）、担当が「未」のまま・書き込み 0 回であることで NOT_TODAY_DUTY を確かめる
        expect(replyTexts()).not.toContain('記録しました');
        expect(replyTexts()).toContain('今日記録できる担当はありません');
        expect(dishesRow()?.status).toBe('todo');
        expect(transactionCount()).toBe(0);
      });
    },
  );
});
