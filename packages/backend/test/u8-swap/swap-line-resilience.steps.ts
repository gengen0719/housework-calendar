import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { MESSAGES } from '@housework/shared';
import { expect } from 'vitest';
import { CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';
import {
  HANAKO_LINE_ID,
  TARO_LINE_ID,
  swapAcceptPostback,
  swapMessage,
  swapOfferPostback,
} from './helpers/lineEvents';
import { startLineWorld, stopLineWorld, type LineSwapWorld } from './helpers/lineWorld';
import { CHORES, childId, seedDuty, seedOffer, storedDuty, storedOffer } from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u8-swap/swap-line-resilience.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const DATE = '2027-01-09';
const as = (lineUserId: string) => ({ lineUserId });

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: LineSwapWorld;
  let statuses: number[];

  BeforeEachScenario(() => {
    w = startLineWorld();
    statuses = [];
  });
  AfterEachScenario(() => {
    stopLineWorld();
  });

  const taroDuty = (): void =>
    seedDuty(w.world.calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: CHORES.dishes.choreTypeId,
      childUserId: childId('taro'),
    });
  const openOffer = (): void => {
    taroDuty();
    seedOffer(w.world.calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion: 1,
    });
  };
  const send = async (event: unknown): Promise<void> => {
    statuses.push((await w.send(event)).statusCode ?? 0);
  };
  const dishes = () => storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId);
  const logsOf = (event: string) => w.logs.filter((l) => l.event === event);

  Scenario(
    '引き受けを書いたあとに reply が失敗しても、結果は残り 200 を返し、再送で二重に書かれない',
    ({ Given, When, Then, And }) => {
      Given('太郎の皿洗いに太郎の申し出が受け付け中で、LINE の返事が 500 で失敗する', () => {
        openOffer();
        w.line.setReplyMode('http-500');
      });
      When('花子が引き受けるボタンを押し、LINE が同じイベントを再送する', async () => {
        const event = swapAcceptPostback(
          'evt-resend',
          DUTY_ID,
          FAKE_U8_OFFER_ID_1,
          as(HANAKO_LINE_ID),
        );
        await send(event);
        await send(event);
      });
      Then('200 が返り、担当は花子になって version は 2 のままである', () => {
        expect(statuses).toEqual([200, 200]);
        expect(dishes()).toMatchObject({ childUserId: childId('hanako'), version: 2 });
      });
      And('返事の失敗は警告に残り、再送では返事も書き込みもやり直されない', () => {
        expect(logsOf('LINE_REPLY_FAILED')).toEqual([expect.objectContaining({ level: 'warn' })]);
        expect(w.line.replies()).toHaveLength(1);
        expect(w.world.hooks.transactionSizes).toHaveLength(1);
      });
    },
  );

  Scenario(
    '担当を選んだあとに reply が失敗すると、申し出は残り、選び直しは文だけになる',
    ({ Given, When, Then, And }) => {
      Given('太郎に 1/9 の皿洗いの未の担当があり、LINE の返事が失敗する', () => {
        taroDuty();
        w.line.setReplyMode('timeout');
      });
      When('太郎が担当を選び、返事が直ったあとでもう一度選ぶ', async () => {
        await send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
        w.line.setReplyMode('ok');
        await send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
      });
      Then('申し出は受け付け中のまま残る', () => {
        expect(statuses).toEqual([200, 200]);
        expect(storedOffer(w.world.calendar, DUTY_ID)?.status).toBe('open');
      });
      And('二度目は「この担当はもう申し出ています」の文だけが返る', () => {
        const batches = w.replyBatches();
        expect(batches.at(-1)).toEqual([{ type: 'text', text: MESSAGES.ALREADY_OFFERED }]);
      });
    },
  );

  Scenario(
    '取引が 2 回続けて断られると、失敗の文を返して 200 を返す',
    ({ Given, When, Then, And }) => {
      Given(
        '太郎に 1/9 の皿洗いの未の担当と 1/10 の洗濯物たたみの申し出があり、取引が続けて断られる',
        () => {
          taroDuty();
          seedDuty(w.world.calendar, {
            dutyId: FAKE_U8_DUTY_ID_B,
            date: '2027-01-10',
            choreTypeId: CHORES.laundry.choreTypeId,
            childUserId: childId('taro'),
          });
          seedOffer(w.world.calendar, {
            dutyId: FAKE_U8_DUTY_ID_B,
            offerId: FAKE_U8_OFFER_ID_2,
            offererUserId: childId('taro'),
            dutyVersion: 1,
          });
          for (const n of [1, 2, 3, 4]) w.world.hooks.failTransaction(n, 'ConditionalCheckFailed');
        },
      );
      When('太郎が皿洗いを選び、花子が洗濯物たたみを引き受ける', async () => {
        await send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
        await send(
          swapAcceptPostback(w.nextId(), FAKE_U8_DUTY_ID_B, FAKE_U8_OFFER_ID_2, as(HANAKO_LINE_ID)),
        );
      });
      Then(
        '「うまく申し出られませんでした。もう一度お試しください」と「うまく引き受けられませんでした。もう一度お試しください」が返る',
        () => {
          expect(w.replyBatches()).toEqual([
            [{ type: 'text', text: 'うまく申し出られませんでした。もう一度お試しください' }],
            [{ type: 'text', text: 'うまく引き受けられませんでした。もう一度お試しください' }],
          ]);
        },
      );
      And('どちらも 200 で処理済みになり、失敗の印のログが 1 件ずつ残る', () => {
        expect(statuses).toEqual([200, 200]);
        expect(logsOf('LINE_EVENT_DONE')).toHaveLength(2);
        const rejected = logsOf('SWAP_REJECTED').filter((l) => l.reason === 'INTERNAL');
        expect(rejected.map((l) => l.op)).toEqual(['offer', 'accept']);
        expect(storedOffer(w.world.calendar, DUTY_ID)).toBeUndefined();
      });
    },
  );

  Scenario(
    '思いがけない失敗は 500 にして処理中の記録を消し、再送で一度だけ書かれる',
    ({ Given, When, Then, And }) => {
      Given('太郎の皿洗いに太郎の申し出が受け付け中で、最初の取引が思いがけない失敗をする', () => {
        openOffer();
        w.world.hooks.failTransaction(1, 'ThrottlingError');
      });
      When('花子が引き受けるボタンを押し、LINE が同じイベントを再送する', async () => {
        const event = swapAcceptPostback(
          'evt-throttle',
          DUTY_ID,
          FAKE_U8_OFFER_ID_1,
          as(HANAKO_LINE_ID),
        );
        await send(event);
        expect(w.line.replies()).toHaveLength(0);
        expect(w.world.events.has('evt-throttle')).toBe(false);
        await send(event);
      });
      Then('最初は 500 で返事がなく、再送は 200 で返事が 1 回返る', () => {
        expect(statuses).toEqual([500, 200]);
        expect(w.line.replies()).toHaveLength(1);
        expect(logsOf('REQUEST_ERROR')).toHaveLength(1);
      });
      And('担当は花子に一度だけ代わる', () => {
        expect(dishes()).toMatchObject({ childUserId: childId('hanako'), version: 2 });
      });
    },
  );

  Scenario('種類の名前が読めなくても、言い換えた名前で返事を出す', ({ Given, When, Then }) => {
    Given('太郎の皿洗いに太郎の申し出が受け付け中で、種類の読み取りが失敗する', () => {
      openOffer();
      w.world.mock
        .on(QueryCommand, { TableName: CHORE_TYPES_TABLE })
        .rejects(new Error('種類の読み取りの失敗'));
    });
    When('花子が引き受ける', async () => {
      await send(swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(HANAKO_LINE_ID)));
    });
    Then('「花子が 1月9日 のお手伝いを引き受けました」が返り、担当は花子に代わる', () => {
      expect(statuses).toEqual([200]);
      expect(w.replyBatches()).toEqual([
        [{ type: 'text', text: '花子が 1月9日 のお手伝いを引き受けました' }],
      ]);
      expect(dishes()?.childUserId).toBe(childId('hanako'));
    });
  });

  Scenario(
    '1 回の Webhook に複数のイベントがあっても、それぞれ独立に処理される',
    ({ Given, When, Then }) => {
      Given('太郎の皿洗いに太郎の申し出が受け付け中である', openOffer);
      When('太郎の「家事交代」と花子の引き受けを 1 回の Webhook で送る', async () => {
        const response = await w.sendMany([
          swapMessage(w.nextId(), as(TARO_LINE_ID)),
          swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(HANAKO_LINE_ID)),
        ]);
        statuses.push(response.statusCode ?? 0);
      });
      Then('返事が 2 回返り、担当は花子に代わっている', () => {
        expect(statuses).toEqual([200]);
        expect(w.line.replies()).toHaveLength(2);
        expect(dishes()?.childUserId).toBe(childId('hanako'));
      });
    },
  );

  Scenario('読み取りの回数は担当の数で増えない', ({ Given, When, Then, And }) => {
    let listReads = 0;
    let offerReads = 0;
    let acceptReads = 0;
    Given('太郎に 11 日分の皿洗いの未の担当がある', () => {
      for (let i = 0; i < 11; i += 1) {
        seedDuty(w.world.calendar, {
          dutyId: fakeU8DutyId(i + 1),
          date: `2027-01-${String(8 + i).padStart(2, '0')}`,
          choreTypeId: CHORES.dishes.choreTypeId,
          childUserId: childId('taro'),
        });
      }
    });
    When('太郎が「家事交代」と送り、1 件選び、花子が引き受ける', async () => {
      await send(swapMessage(w.nextId(), as(TARO_LINE_ID)));
      listReads = w.calendarReads();
      await send(swapOfferPostback(w.nextId(), fakeU8DutyId(1), as(TARO_LINE_ID)));
      offerReads = w.calendarReads() - listReads;
      const offerId = String(storedOffer(w.world.calendar, fakeU8DutyId(1))?.offerId);
      await send(swapAcceptPostback(w.nextId(), fakeU8DutyId(1), offerId, as(HANAKO_LINE_ID)));
      acceptReads = w.calendarReads() - listReads - offerReads;
    });
    Then('一覧の読み取りは 3 回以内で、選ぶ・引き受けるはそれぞれ 5 回以内である', () => {
      expect(statuses).toEqual([200, 200, 200]);
      expect(listReads).toBeLessThanOrEqual(3);
      expect(offerReads).toBeLessThanOrEqual(5);
      expect(acceptReads).toBeLessThanOrEqual(5);
    });
    And('LINE のプロフィールの取得は 0 回である', () => {
      expect(w.line.unexpected()).toHaveLength(0);
    });
  });
});
