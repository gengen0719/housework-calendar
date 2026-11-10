import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { MESSAGES } from '@housework/shared';
import { expect } from 'vitest';
import { LINE_LIMITS } from '../../src/services/lineApiService';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_DUTY_ID_C,
  FAKE_U8_MARKER_LONG_CHORE_NAME,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
  FAKE_U8_OFFER_ID_3,
  fakeU8ChoreTypeId,
  fakeU8DutyId,
} from '../fixtures/fakeSecrets';
import { seedChoreType } from '../u4-chore-types/helpers/seed';
import {
  HANAKO_LINE_ID,
  JIRO_LINE_ID,
  MOTHER_LINE_ID,
  TARO_LINE_ID,
  swapAcceptPostback,
  swapMessage,
  swapOfferPostback,
  swapWithdrawPostback,
} from './helpers/lineEvents';
import { startLineWorld, stopLineWorld, type LineSwapWorld } from './helpers/lineWorld';
import {
  CHORES,
  childId,
  seedDoneDuty,
  seedDuty,
  seedMonthState,
  seedOffer,
  storedDuty,
  storedOffer,
} from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u8-swap/swap-line-roles.feature');

const DUTY_ID = FAKE_U8_DUTY_ID_A;
const DATE = '2027-01-09';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 目に見える文字（text・label・altText）だけを集める。ボタンの値（data）は含めない。 */
function visibleStrings(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => visibleStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Json)) {
      if (['text', 'label', 'altText'].includes(key) && typeof v === 'string') out.push(v);
      else visibleStrings(v, out);
    }
  }
  return out;
}
const bubblesOf = (message: unknown): Json[] => (message as Json).contents.contents as Json[];
const buttonOf = (bubble: Json): Json => bubble.footer.contents[0].action as Json;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: LineSwapWorld;

  BeforeEachScenario(() => {
    w = startLineWorld();
  });
  AfterEachScenario(() => {
    stopLineWorld();
  });

  const taroDuty = (over: Partial<Parameters<typeof seedDuty>[1]> = {}): void =>
    seedDuty(w.world.calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: CHORES.dishes.choreTypeId,
      childUserId: childId('taro'),
      ...over,
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
  const as = (lineUserId: string) => ({ lineUserId });
  const sendList = async (lineUserId = TARO_LINE_ID): Promise<void> => {
    await w.send(swapMessage(w.nextId(), as(lineUserId)));
  };
  const lastBatch = (): Json[] => w.replyBatches().at(-1) as Json[];
  const textOf = (batchIndex: number): string => JSON.stringify(w.replyBatches()[batchIndex] ?? []);

  Scenario(
    '子供が「家事交代」と送ると、日付の近い順の担当のボタンが返る',
    ({ Given, When, Then, And }) => {
      Given(
        '太郎に 1/8 の皿洗い・1/9 のゴミ出し・1/10 の洗濯物たたみの未の担当があり、ほかに対象外の担当がある',
        () => {
          const taro = childId('taro');
          seedDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(3),
            date: '2027-01-10',
            choreTypeId: CHORES.laundry.choreTypeId,
            childUserId: taro,
          });
          seedDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(1),
            date: '2027-01-08',
            choreTypeId: CHORES.dishes.choreTypeId,
            childUserId: taro,
          });
          seedDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(2),
            date: '2027-01-09',
            choreTypeId: CHORES.garbage.choreTypeId,
            childUserId: taro,
          });
          // 対象外: 過ぎた日・済・ほかの子供
          seedDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(4),
            date: '2027-01-07',
            choreTypeId: CHORES.laundry.choreTypeId,
            childUserId: taro,
          });
          seedDoneDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(5),
            date: '2027-01-11',
            choreTypeId: CHORES.dishes.choreTypeId,
            childUserId: taro,
            recordedAt: '2027-01-08T01:00:00.000Z',
            recordedBy: taro,
            unitPrice: 120,
          });
          seedDuty(w.world.calendar, {
            dutyId: fakeU8DutyId(6),
            date: '2027-01-08',
            choreTypeId: CHORES.garbage.choreTypeId,
            childUserId: childId('hanako'),
          });
        },
      );
      When('太郎がグループで「家事交代」と送る', () => sendList());
      Then('1 回の返事に見出しと担当の carousel が入る', () => {
        expect(w.replyBatches()).toHaveLength(1);
        const [heading, carousel] = lastBatch();
        expect(heading).toMatchObject({ type: 'text', text: '代わってほしい担当を選んでください' });
        expect(carousel).toMatchObject({ type: 'flex' });
        expect(carousel?.altText).toBeTruthy();
      });
      And('ボタンの文字は日付の近い順で、値は担当を選ぶ形である', () => {
        const buttons = bubblesOf(lastBatch()[1]).map(buttonOf);
        expect(buttons.map((b) => b.label)).toEqual([
          '1/8 皿洗い',
          '1/9 ゴミ出し',
          '1/10 洗濯物たたみ',
        ]);
        expect(buttons.map((b) => b.data)).toEqual(
          [1, 2, 3].map((i) => `action=swap.offer&dutyId=${fakeU8DutyId(i)}`),
        );
      });
      And('金額と担当の ID は本文に出ない', () => {
        const visible = visibleStrings(lastBatch()).join('\n');
        expect(visible).not.toMatch(/120|100|円/);
        expect(visible).not.toContain('0000');
      });
    },
  );

  Scenario('候補が 11 件以上でも 10 件までで、案内が添えられる', ({ Given, When, Then }) => {
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
    When('太郎がグループで「家事交代」と送る', () => sendList());
    Then('返事は見出し・10 個の carousel・案内の 3 通になる', () => {
      const batch = lastBatch();
      expect(batch).toHaveLength(3);
      expect(bubblesOf(batch[1])).toHaveLength(10);
      expect(batch[2]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('近い日の担当だけ出しています'),
      });
      expect(buttonOf(bubblesOf(batch[1])[9] as Json).label).toBe('1/17 皿洗い');
    });
  });

  Scenario('名前の長い種類のボタンは文字数の上限に収まる', ({ Given, When, Then }) => {
    Given('太郎の担当の種類の名前が 21 文字を超えている', () => {
      expect(Array.from(FAKE_U8_MARKER_LONG_CHORE_NAME).length).toBeGreaterThan(21);
      seedChoreType(w.world.choreTypes, {
        choreTypeId: fakeU8ChoreTypeId(1),
        name: FAKE_U8_MARKER_LONG_CHORE_NAME,
      });
      taroDuty({ date: '2027-01-12', choreTypeId: fakeU8ChoreTypeId(1) });
    });
    When('太郎がグループで「家事交代」と送る', () => sendList());
    Then('ボタンの文字は上限以内で、末尾が「…」になる', () => {
      const label = buttonOf(bubblesOf(lastBatch()[1])[0] as Json).label as string;
      expect(Array.from(label).length).toBeLessThanOrEqual(LINE_LIMITS.FLEX_BUTTON_LABEL_MAX);
      expect(label.startsWith('1/12 ')).toBe(true);
      expect(label.endsWith('…')).toBe(true);
    });
  });

  Scenario('申し出られる担当がなければ理由だけを返す', ({ Given, When, Then }) => {
    Given('太郎の担当は済だけである', () => {
      seedDoneDuty(w.world.calendar, {
        dutyId: DUTY_ID,
        date: DATE,
        choreTypeId: CHORES.dishes.choreTypeId,
        childUserId: childId('taro'),
        recordedAt: '2027-01-08T01:00:00.000Z',
        recordedBy: childId('taro'),
        unitPrice: 120,
      });
    });
    When('太郎がグループで「家事交代」と送る', () => sendList());
    Then('「申し出られる担当はありません」だけが返り、ボタンはない', () => {
      expect(lastBatch()).toEqual([{ type: 'text', text: MESSAGES.NO_SWAPPABLE_DUTY }]);
    });
  });

  Scenario(
    '今月が確定していて担当がなければ「この月は確定済みです」を返す',
    ({ Given, When, Then }) => {
      Given('太郎の担当は今月が確定していて申し出られない', () => {
        taroDuty();
        seedMonthState(w.world.calendar, { month: '2027-01', confirmed: true });
      });
      When('太郎がグループで「家事交代」と送る', () => sendList());
      Then('「この月は確定済みです」だけが返り、ボタンはない', () => {
        expect(lastBatch()).toEqual([{ type: 'text', text: MESSAGES.MONTH_CONFIRMED }]);
      });
    },
  );

  Scenario(
    '担当を選ぶと、知らせと「引き受ける」「申し出をやめる」のボタンが返る',
    ({ Given, When, Then, And }) => {
      Given('太郎に 1/9 の皿洗いの未の担当がある', () => taroDuty());
      When('太郎がその担当を選ぶ', async () => {
        await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
      });
      Then(
        '「太郎が 1月9日 の皿洗いを代わってくれる人を探しています」と 2 つのボタンが返る',
        () => {
          const [message] = lastBatch() as [Json];
          expect(message.type).toBe('template');
          expect(message.template.type).toBe('buttons');
          expect(message.template.text).toBe(
            '太郎が 1月9日 の皿洗いを代わってくれる人を探しています',
          );
          expect(message.altText).toBe(message.template.text);
          expect((message.template.actions as Json[]).map((a) => a.label)).toEqual([
            '引き受ける',
            '申し出をやめる',
          ]);
        },
      );
      And('申し出が書かれ、ボタンの値に担当の ID と申し出の ID が入る', () => {
        const stored = storedOffer(w.world.calendar, DUTY_ID);
        expect(stored).toMatchObject({ status: 'open', offererUserId: childId('taro') });
        const [message] = lastBatch() as [Json];
        const datas = (message.template.actions as Json[]).map((a) => a.data);
        expect(datas).toEqual([
          `action=swap.accept&dutyId=${DUTY_ID}&offerId=${String(stored?.offerId)}`,
          `action=swap.withdraw&dutyId=${DUTY_ID}&offerId=${String(stored?.offerId)}`,
        ]);
      });
    },
  );

  Scenario(
    '別の子供が引き受けると担当が変わり、自分の担当は動かない',
    ({ Given, When, Then, And }) => {
      Given('太郎の皿洗いに太郎の申し出が受け付け中で、花子には別の担当がある', () => {
        openOffer();
        seedDuty(w.world.calendar, {
          dutyId: FAKE_U8_DUTY_ID_B,
          date: '2027-01-10',
          choreTypeId: CHORES.laundry.choreTypeId,
          childUserId: childId('hanako'),
        });
      });
      When('花子が引き受ける', async () => {
        await w.send(
          swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(HANAKO_LINE_ID)),
        );
      });
      Then('「花子が 1月9日 の皿洗いを引き受けました」が返る', () => {
        expect(lastBatch()).toEqual([
          { type: 'text', text: '花子が 1月9日 の皿洗いを引き受けました' },
        ]);
      });
      And('担当は花子に代わって代わりの印が付き、花子の別の担当は変わらない', () => {
        expect(storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId)).toMatchObject({
          childUserId: childId('hanako'),
          origin: 'swap',
          version: 2,
          status: 'todo',
        });
        expect(
          storedDuty(w.world.calendar, '2027-01-10', CHORES.laundry.choreTypeId),
        ).toMatchObject({
          childUserId: childId('hanako'),
          version: 1,
        });
        expect(storedOffer(w.world.calendar, DUTY_ID)?.status).toBe('accepted');
      });
    },
  );

  Scenario('先着でない人・申し出た本人・管理者の引き受けは断る', ({ Given, When, Then, And }) => {
    Given('太郎の皿洗いに太郎の申し出が受け付け中である', openOffer);
    When('花子が引き受けたあと、次郎と太郎とお母さんが引き受ける', async () => {
      for (const id of [HANAKO_LINE_ID, JIRO_LINE_ID, TARO_LINE_ID, MOTHER_LINE_ID]) {
        await w.send(swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(id)));
      }
    });
    Then('次郎には「この申し出はもう引き受けられています」が返る', () => {
      expect(textOf(1)).toContain(MESSAGES.OFFER_ALREADY_ACCEPTED);
    });
    And('太郎とお母さんには「この申し出には応えられません」が返る', () => {
      expect(textOf(2)).toContain(MESSAGES.CANNOT_ACCEPT_OWN_OFFER);
      expect(textOf(3)).toContain(MESSAGES.CANNOT_ACCEPT_OWN_OFFER);
    });
    And('担当は花子のままである', () => {
      expect(storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId)).toMatchObject({
        childUserId: childId('hanako'),
        version: 2,
      });
    });
  });

  Scenario('取り下げたあとは引き受けられない', ({ Given, When, Then, And }) => {
    Given('太郎の皿洗いに太郎の申し出が受け付け中である', openOffer);
    When('太郎が申し出をやめるを押したあと、花子が引き受ける', async () => {
      await w.send(swapWithdrawPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(TARO_LINE_ID)));
      await w.send(swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(HANAKO_LINE_ID)));
    });
    Then('「太郎が 1月9日 の皿洗いの申し出をやめました」が返る', () => {
      expect(w.replyBatches()[0]).toEqual([
        { type: 'text', text: '太郎が 1月9日 の皿洗いの申し出をやめました' },
      ]);
    });
    And('花子には「この申し出はもうありません」が返る', () => {
      expect(w.replyBatches()[1]).toEqual([{ type: 'text', text: MESSAGES.OFFER_GONE }]);
      expect(storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId)?.childUserId).toBe(
        childId('taro'),
      );
    });
  });

  Scenario('同じ担当を二度選ぶと、二度目は文だけが返る', ({ Given, When, Then }) => {
    Given('太郎に 1/9 の皿洗いの未の担当がある', () => taroDuty());
    When('太郎がその担当を 2 回選ぶ', async () => {
      await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
      await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
    });
    Then('一度目にはボタンが付き、二度目は「この担当はもう申し出ています」の文だけが返る', () => {
      expect((w.replyBatches()[0]?.[0] as Json).type).toBe('template');
      expect(w.replyBatches()[1]).toEqual([{ type: 'text', text: MESSAGES.ALREADY_OFFERED }]);
    });
  });

  Scenario(
    '管理者に「家事交代」と送られても、担当や申し出は読まない',
    ({ Given, When, Then, And }) => {
      Given('太郎に 1/9 の皿洗いの未の担当がある', () => taroDuty());
      When('お母さんがグループで「家事交代」と送る', () => sendList(MOTHER_LINE_ID));
      Then('「代わってもらう申し出は子供だけができます」だけが返る', () => {
        expect(lastBatch()).toEqual([
          { type: 'text', text: '代わってもらう申し出は子供だけができます' },
        ]);
      });
      And('担当と種類は読まれず、案内を返したログが残る', () => {
        expect(w.calendarReads()).toBe(0);
        expect(w.logs.filter((l) => l.event === 'SWAP_GUIDE_SENT')).toEqual([
          expect.objectContaining({ reason: 'ADMIN' }),
        ]);
      });
    },
  );

  Scenario(
    '管理者とほかの子供の操作は申し出た人だけの決まりで断る',
    ({ Given, When, Then, And }) => {
      Given('太郎の皿洗いに太郎の申し出が受け付け中である', openOffer);
      When(
        'お母さんが担当を選ぶ・申し出をやめる・引き受けるを押し、花子が担当を選ぶ・申し出をやめるを押す',
        async () => {
          await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(MOTHER_LINE_ID)));
          await w.send(
            swapWithdrawPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(MOTHER_LINE_ID)),
          );
          await w.send(
            swapAcceptPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(MOTHER_LINE_ID)),
          );
          await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(HANAKO_LINE_ID)));
          await w.send(
            swapWithdrawPostback(w.nextId(), DUTY_ID, FAKE_U8_OFFER_ID_1, as(HANAKO_LINE_ID)),
          );
        },
      );
      Then('担当を選ぶと申し出をやめるには「この操作は申し出た人だけができます」が返る', () => {
        for (const index of [0, 1, 3, 4])
          expect(textOf(index)).toContain(MESSAGES.OFFER_OWNER_ONLY);
      });
      And('お母さんの引き受けには「この申し出には応えられません」が返る', () => {
        expect(textOf(2)).toContain(MESSAGES.CANNOT_ACCEPT_OWN_OFFER);
      });
      And('担当と申し出は変わらない', () => {
        expect(storedOffer(w.world.calendar, DUTY_ID)?.status).toBe('open');
        expect(storedDuty(w.world.calendar, DATE, CHORES.dishes.choreTypeId)).toMatchObject({
          childUserId: childId('taro'),
          version: 1,
        });
      });
    },
  );

  Scenario(
    '担当や月が変わって申し出がなくなったあとは「この申し出はもうありません」を返す',
    ({ Given, When, Then }) => {
      Given(
        '受け付け中の申し出のある担当が、済になった・月が確定した・担当の子供が変わった',
        () => {
          const taro = childId('taro');
          seedDoneDuty(w.world.calendar, {
            dutyId: DUTY_ID,
            date: DATE,
            choreTypeId: CHORES.dishes.choreTypeId,
            childUserId: taro,
            recordedAt: '2027-01-08T01:00:00.000Z',
            recordedBy: taro,
            unitPrice: 120,
          });
          seedDuty(w.world.calendar, {
            dutyId: FAKE_U8_DUTY_ID_B,
            date: '2027-02-03',
            choreTypeId: CHORES.dishes.choreTypeId,
            childUserId: taro,
          });
          seedMonthState(w.world.calendar, { month: '2027-02', confirmed: true });
          seedDuty(w.world.calendar, {
            dutyId: FAKE_U8_DUTY_ID_C,
            date: '2027-01-10',
            choreTypeId: CHORES.laundry.choreTypeId,
            childUserId: childId('jiro'),
            version: 2,
          });
          const offers = [
            [DUTY_ID, FAKE_U8_OFFER_ID_1],
            [FAKE_U8_DUTY_ID_B, FAKE_U8_OFFER_ID_2],
            [FAKE_U8_DUTY_ID_C, FAKE_U8_OFFER_ID_3],
          ] as const;
          for (const [dutyId, offerId] of offers) {
            seedOffer(w.world.calendar, { dutyId, offerId, offererUserId: taro, dutyVersion: 1 });
          }
        },
      );
      When('花子がそれぞれの申し出を引き受ける', async () => {
        const offers = [
          [DUTY_ID, FAKE_U8_OFFER_ID_1],
          [FAKE_U8_DUTY_ID_B, FAKE_U8_OFFER_ID_2],
          [FAKE_U8_DUTY_ID_C, FAKE_U8_OFFER_ID_3],
        ] as const;
        for (const [dutyId, offerId] of offers) {
          await w.send(swapAcceptPostback(w.nextId(), dutyId, offerId, as(HANAKO_LINE_ID)));
        }
      });
      Then('どれも「この申し出はもうありません」が返り、担当は変わらない', () => {
        expect(w.replyBatches()).toHaveLength(3);
        for (const index of [0, 1, 2]) expect(textOf(index)).toContain(MESSAGES.OFFER_GONE);
        expect(w.world.hooks.transactionSizes).toHaveLength(0);
      });
    },
  );

  Scenario('ひと通りの操作で reply 以外の通信は出ない', ({ Given, When, Then }) => {
    Given('太郎に 1/9 の皿洗いの未の担当がある', () => taroDuty());
    When('太郎が「家事交代」と送り、担当を選び、花子が引き受ける', async () => {
      await sendList();
      await w.send(swapOfferPostback(w.nextId(), DUTY_ID, as(TARO_LINE_ID)));
      const offerId = String(storedOffer(w.world.calendar, DUTY_ID)?.offerId);
      await w.send(swapAcceptPostback(w.nextId(), DUTY_ID, offerId, as(HANAKO_LINE_ID)));
    });
    Then('通信はすべて reply で、push・multicast・broadcast・プロフィールの取得はない', () => {
      expect(w.line.replies()).toHaveLength(3);
      expect(w.line.unexpected()).toHaveLength(0);
      expect(w.line.calls.every((call) => call.url.endsWith('/v2/bot/message/reply'))).toBe(true);
    });
  });

  Scenario(
    '読み取りが遅れても、待ち時間は読み取りの回数の足し算にならない',
    ({ Given, When, Then }) => {
      const DELAY_MS = 120;
      let listMs = 0;
      let readsInList = 0;
      Given(
        '太郎に 1/9 の皿洗いの未の担当があり、担当と種類の読み取りがどれも 120 ミリ秒遅れる',
        () => {
          taroDuty();
          w.world.hooks.readDelayMs = DELAY_MS;
        },
      );
      When('太郎が「家事交代」と送る', async () => {
        const readsBefore = w.calendarReads();
        // Date は固定の「今」に差し替わっているので、経過時間は performance.now() で測る
        const started = performance.now();
        await sendList();
        listMs = performance.now() - started;
        readsInList = w.calendarReads() - readsBefore;
      });
      Then('3 回の読み取りは並行に走り、かかった時間は 3 回分の足し算より短い', () => {
        // 月の Query 2 回＋種類の Query 1 回。直列なら 3 × 120 = 360 ミリ秒以上かかる（BR9.17）
        expect(readsInList).toBe(3);
        expect(listMs).toBeGreaterThanOrEqual(DELAY_MS);
        expect(listMs).toBeLessThan(DELAY_MS * 2.5);
        expect(w.replyBatches()).toHaveLength(1);
      });
    },
  );
});
