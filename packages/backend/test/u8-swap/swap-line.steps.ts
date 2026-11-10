import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { MESSAGES } from '@housework/shared';
import { expect } from 'vitest';
import { handler } from '../../src/entries/line';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { webhookRequest } from '../u1-skeleton-family/helpers/world';
import {
  FAKE_OTHER_FAMILY_ID,
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OUTSIDER_LINE_ID,
  FAKE_U8_UNREGISTERED_GROUP_ID,
} from '../fixtures/fakeSecrets';
import {
  HANAKO_LINE_ID,
  MOTHER_LINE_ID,
  TARO_LINE_ID,
  postbackEvent,
  signedRequest,
  swapAcceptPostback,
  swapMessage,
  swapOfferPostback,
  swapWithdrawPostback,
  textMessage,
} from './helpers/lineEvents';
import { startLineWorld, stopLineWorld, type LineSwapWorld } from './helpers/lineWorld';
import {
  CHORES,
  childId,
  offerCount,
  seedDuty,
  seedOffer,
  storedDuty,
  storedOffer,
} from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u8-swap/swap-line.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const DATE = '2027-01-09';
const GUIDE = MESSAGES.GROUP_NOT_REGISTERED;

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

  const seedTaroDuty = (): void => {
    seedDuty(w.world.calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: CHORES.dishes.choreTypeId,
      childUserId: childId('taro'),
    });
  };
  const send = async (event: unknown): Promise<void> => {
    statuses.push((await w.send(event)).statusCode ?? 0);
  };
  const dbTouched = (): boolean =>
    w.world.hooks.readLog.length > 0 || w.world.hooks.transactionSizes.length > 0;
  const swapReads = (): number =>
    w.world.hooks.readLog.filter((entry) =>
      [CALENDAR_TABLE, CHORE_TYPES_TABLE].includes(entry.table),
    ).length;

  Scenario(
    '署名のない・書き換えられた・秘密のヘッダーのない要求は断られ、何も読み書きしない',
    ({ Given, When, Then, And }) => {
      Given('太郎に申し出られる担当がある', seedTaroDuty);
      When('署名のない「家事交代」と書き換えた本文と秘密のヘッダーのない要求を送る', async () => {
        const event = swapMessage('evt-sig');
        statuses.push((await w.send(event, 'bad-signature')).statusCode ?? 0);
        const tampered = signedRequest([event]);
        tampered.body = (tampered.body ?? '').replace('evt-sig', 'evt-sig-2');
        statuses.push(((await handler(tampered)) as { statusCode: number }).statusCode);
        const noOrigin = webhookRequest({ events: [event] }, { origin: null });
        statuses.push(((await handler(noOrigin)) as { statusCode: number }).statusCode);
      });
      Then('401 と 401 と 403 が返る', () => {
        expect(statuses).toEqual([401, 401, 403]);
      });
      And('返事も DynamoDB の読み書きもない', () => {
        expect(w.line.calls).toHaveLength(0);
        expect(dbTouched()).toBe(false);
        expect(w.world.events.size).toBe(0);
      });
    },
  );

  Scenario(
    '前後の空白や改行を除いて「家事交代」と一致すれば受け付ける',
    ({ Given, When, Then }) => {
      Given('太郎に申し出られる担当がある', seedTaroDuty);
      When('太郎が前後に半角空白・全角空白・改行をつけた「家事交代」を送る', async () => {
        await send(textMessage(w.nextId(), ' 家事交代 '));
        await send(textMessage(w.nextId(), '　家事交代　'));
        await send(textMessage(w.nextId(), '\n家事交代\n'));
      });
      Then('3 回とも担当を選ぶ返事が 1 回ずつ返る', () => {
        expect(statuses).toEqual([200, 200, 200]);
        expect(w.replyBatches()).toHaveLength(3);
        for (const text of w.replyBatches().map((m) => JSON.stringify(m))) {
          expect(text).toContain('代わってほしい担当を選んでください');
        }
      });
    },
  );

  Scenario(
    '似て非なる言葉・文字でないもの・長すぎる文は何も起きない',
    ({ Given, When, Then, And }) => {
      Given('太郎に申し出られる担当がある', seedTaroDuty);
      When(
        '「代わって」「かわって」「家事 交代」「家事交代して」「明日家事交代できる？」と零幅の空白をはさんだ言葉とスタンプと 5001 文字の文を送る',
        async () => {
          for (const text of [
            '代わって',
            'かわって',
            '家事 交代',
            '家事交代して',
            '明日家事交代できる？',
            '家事\u200b交代',
            '家事交代'.padEnd(5001, '。'),
          ]) {
            await send(textMessage(w.nextId(), text));
          }
          const sticker = textMessage(w.nextId(), '家事交代');
          await send({ ...sticker, message: { type: 'sticker', id: 's1' } });
        },
      );
      Then('返事は 0 回で、200 が返る', () => {
        expect(statuses).toHaveLength(8);
        expect(statuses.every((s) => s === 200)).toBe(true);
        expect(w.line.replies()).toHaveLength(0);
      });
      And('二度処理しない記録は書かれず、無視したログに種類だけが残る', () => {
        expect(w.world.events.size).toBe(0);
        const ignored = w.logs.filter((l) => l.event === 'LINE_EVENT_IGNORED');
        expect(ignored).toHaveLength(8);
        for (const row of ignored)
          expect(Object.keys(row).sort()).toEqual(expect.arrayContaining(['event', 'type']));
        expect(JSON.stringify(ignored)).not.toContain('家事');
      });
    },
  );

  Scenario('決まった 3 つの形のボタンの値は受け付ける', ({ Given, When, Then }) => {
    Given('太郎に申し出られる担当がある', seedTaroDuty);
    When('担当を選ぶ形・引き受ける形・取り下げる形のボタンの値を送る', async () => {
      await send(swapOfferPostback(w.nextId(), DUTY_ID));
      await send(swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1));
      await send(swapWithdrawPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1));
    });
    Then('3 回とも返事が返る', () => {
      expect(statuses).toEqual([200, 200, 200]);
      expect(w.line.replies()).toHaveLength(3);
    });
  });

  Scenario('形の外れたボタンの値は何もしない', ({ Given, When, Then, And }) => {
    Given('太郎に申し出られる担当がある', seedTaroDuty);
    When(
      '項目の重複・順序違い・エンコード違い・大文字の ID・余分な項目・前後の空白・300 文字超・返事の宛先なしのボタンの値を送る',
      async () => {
        const base = `action=swap.offer&dutyId=${DUTY_ID}`;
        const accept = `action=swap.accept&dutyId=${DUTY_ID}&offerId=${FAKE_U8_OFFER_ID_1}`;
        const bad = [
          `${base}&dutyId=${DUTY_ID}`,
          `dutyId=${DUTY_ID}&action=swap.offer`,
          `action%3Dswap.offer&dutyId=${DUTY_ID}`,
          `action=swap.offer&dutyId=${DUTY_ID.toUpperCase()}`,
          `${base}&extra=1`,
          ` ${base}`,
          `${base} `,
          `${base}&x=${'a'.repeat(300)}`,
          `action=swap.accept&offerId=${FAKE_U8_OFFER_ID_1}&dutyId=${DUTY_ID}`,
          `${accept}&offerId=${FAKE_U8_OFFER_ID_1}`,
          `action=swap.withdraw&dutyId=${DUTY_ID}`,
        ];
        for (const data of bad) await send(postbackEvent(w.nextId(), data));
        await send(postbackEvent(w.nextId(), base, { noReplyToken: true }));
      },
    );
    Then('返事は 0 回で、200 が返る', () => {
      expect(statuses).toHaveLength(12);
      expect(statuses.every((s) => s === 200)).toBe(true);
      expect(w.line.replies()).toHaveLength(0);
    });
    And('二度処理しない記録は書かれない', () => {
      expect(w.world.events.size).toBe(0);
      expect(offerCount(w.world.calendar)).toBe(0);
    });
  });

  Scenario(
    '1 対 1 の「家事交代」は誰が送っても同じ案内だけを返し、何も読まない',
    ({ Given, When, Then, And }) => {
      Given('太郎に申し出られる担当がある', seedTaroDuty);
      When('太郎とお母さんと家族でない人と記録のない人が 1 対 1 で「家事交代」を送る', async () => {
        for (const lineUserId of [
          TARO_LINE_ID,
          MOTHER_LINE_ID,
          FAKE_U8_OUTSIDER_LINE_ID,
          'U_u8_unknown',
        ]) {
          await send(swapMessage(w.nextId(), { kind: 'user', lineUserId }));
        }
      });
      Then('4 回とも同じ案内が 1 通ずつ返る', () => {
        const batches = w.replyBatches();
        expect(batches).toHaveLength(4);
        expect(new Set(batches.map((m) => JSON.stringify(m))).size).toBe(1);
        expect(batches[0]).toHaveLength(1);
        expect(JSON.stringify(batches[0])).toContain('家族のグループで');
      });
      And('利用者・家族・担当・種類は読まれない', () => {
        expect(w.world.hooks.readLog).toHaveLength(0);
      });
    },
  );

  Scenario('1 対 1 のボタンの値とルームの操作は何もしない', ({ Given, When, Then }) => {
    Given('太郎に申し出られる担当がある', seedTaroDuty);
    When(
      '1 対 1 から担当を選ぶボタンの値を送り、ルームから「家事交代」とボタンの値を送る',
      async () => {
        await send(swapOfferPostback(w.nextId(), DUTY_ID, { kind: 'user' }));
        await send(swapMessage(w.nextId(), { kind: 'room' }));
        await send(swapOfferPostback(w.nextId(), DUTY_ID, { kind: 'room' }));
      },
    );
    Then('返事は 0 回で、二度処理しない記録も書かれない', () => {
      expect(statuses).toEqual([200, 200, 200]);
      expect(w.line.replies()).toHaveLength(0);
      expect(w.world.events.size).toBe(0);
    });
  });

  Scenario(
    '登録されていないグループでは断り、担当を読み書きしない',
    ({ Given, When, Then, And }) => {
      Given('太郎に申し出られる担当がある', seedTaroDuty);
      When('太郎が登録されていないグループで「家事交代」と担当を選ぶボタンの値を送る', async () => {
        const options = { groupId: FAKE_U8_UNREGISTERED_GROUP_ID };
        await send(swapMessage(w.nextId(), options));
        await send(swapOfferPostback(w.nextId(), DUTY_ID, options));
      });
      Then('「このグループは家族のお知らせ先として登録されていません」が 2 回返る', () => {
        expect(w.line.replies()).toHaveLength(2);
        for (const text of w.replyBatches().map((m) => JSON.stringify(m))) {
          expect(text).toContain(GUIDE);
        }
      });
      And('担当と種類は読まれず、書かれない', () => {
        expect(swapReads()).toBe(0);
        expect(w.world.hooks.transactionSizes).toHaveLength(0);
      });
    },
  );

  Scenario('家族でない人・友だちでない人には決まった文で断る', ({ Given, When, Then, And }) => {
    Given('太郎に申し出られる担当があり、家族に入っていない人とブロック中の人がいる', () => {
      seedTaroDuty();
      w.world.users.set('user-outsider', {
        userId: 'user-outsider',
        lineUserId: FAKE_U8_OUTSIDER_LINE_ID,
        displayName: 'ひとり',
        friendStatus: 'friend',
        registeredAt: '2026-11-01T00:00:00.000Z',
        friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
      });
      const hanako = [...w.world.users.entries()].find(
        ([, user]) => user.lineUserId === HANAKO_LINE_ID,
      );
      if (hanako) w.world.users.set(hanako[0], { ...hanako[1], friendStatus: 'blocked' });
    });
    When('家族でない人とブロック中の人が「家事交代」を送る', async () => {
      await send(swapMessage(w.nextId(), { lineUserId: FAKE_U8_OUTSIDER_LINE_ID }));
      await send(swapMessage(w.nextId(), { lineUserId: HANAKO_LINE_ID }));
    });
    Then('どちらにも「このアプリは家族のメンバーだけが使えます」が返る', () => {
      expect(w.line.replies()).toHaveLength(2);
      for (const text of w.replyBatches().map((m) => JSON.stringify(m))) {
        expect(text).toContain(MESSAGES.NOT_FAMILY_MEMBER);
      }
    });
    And('担当と種類は読まれない', () => {
      expect(swapReads()).toBe(0);
    });
  });

  Scenario(
    'ほかの家族の担当や申し出のボタンを貼り付けても、ほかの家族のデータは分からない',
    ({ Given, When, Then, And }) => {
      Given('ほかの家族に担当と受け付け中の申し出がある', () => {
        seedDuty(w.world.calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          date: DATE,
          choreTypeId: CHORES.dishes.choreTypeId,
          childUserId: 'user-other-child',
          familyId: FAKE_OTHER_FAMILY_ID,
        });
        seedOffer(w.world.calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          offerId: FAKE_U8_OFFER_ID_1,
          offererUserId: 'user-other-child',
          dutyVersion: 1,
          familyId: FAKE_OTHER_FAMILY_ID,
        });
      });
      When('太郎がほかの家族の担当を選ぶ・引き受ける・取り下げるボタンの値を送る', async () => {
        await send(swapOfferPostback(w.nextId(), FAKE_U8_DUTY_ID_B));
        await send(swapAcceptPostback(w.nextId(), FAKE_U8_DUTY_ID_B, FAKE_U8_OFFER_ID_1));
        await send(swapWithdrawPostback(w.nextId(), FAKE_U8_DUTY_ID_B, FAKE_U8_OFFER_ID_1));
      });
      Then(
        '担当を選ぶには「この担当は先に変更されました」、あとの 2 つには「この申し出はもうありません」が返る',
        () => {
          const texts = w.replyBatches().map((m) => JSON.stringify(m));
          expect(texts).toHaveLength(3);
          expect(texts[0]).toContain(MESSAGES.DUTY_CHANGED);
          expect(texts[1]).toContain(MESSAGES.OFFER_GONE);
          expect(texts[2]).toContain(MESSAGES.OFFER_GONE);
        },
      );
      And('ほかの家族の担当と申し出は変わらず、返事にほかの家族の ID は出ない', () => {
        expect(storedOffer(w.world.calendar, FAKE_U8_DUTY_ID_B, FAKE_OTHER_FAMILY_ID)?.status).toBe(
          'open',
        );
        expect(
          storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId, FAKE_OTHER_FAMILY_ID)
            ?.childUserId,
        ).toBe('user-other-child');
        expect(w.replyText()).not.toContain(FAKE_OTHER_FAMILY_ID);
        expect(w.replyText()).not.toContain('user-other-child');
      });
    },
  );

  Scenario('同じイベントの再送は二度処理されない', ({ Given, When, Then }) => {
    Given('太郎に申し出られる担当がある', seedTaroDuty);
    When('同じイベント ID の「家事交代」を 2 回送る', async () => {
      await send(swapMessage('evt-same'));
      await send(swapMessage('evt-same'));
    });
    Then('返事は 1 回だけで、どちらも 200 が返る', () => {
      expect(statuses).toEqual([200, 200]);
      expect(w.line.replies()).toHaveLength(1);
    });
  });
});
