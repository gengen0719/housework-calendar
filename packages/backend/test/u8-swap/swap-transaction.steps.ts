import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import type { DutyRecord } from '../../src/models';
import { loadMonth } from '../../src/repositories/calendarRepository';
import {
  acceptOffer,
  buildAcceptItems,
  buildCloseUpdate,
  buildCreateOfferItems,
  buildWithdrawUpdate,
  closeOffer,
  createOffer,
  getOffer,
  withdrawOffer,
} from '../../src/repositories/swapRepository';
import {
  CALENDAR_TABLE,
  CHORE_TYPES_TABLE,
  installFakeDynamo,
  type Table,
} from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  FAKE_U8_DUTY_ID_A,
  FAKE_U8_DUTY_ID_B,
  FAKE_U8_OFFER_ID_1,
  FAKE_U8_OFFER_ID_2,
  FAKE_U8_OFFER_ID_3,
} from '../fixtures/fakeSecrets';
import {
  FAMILY_ID,
  childId,
  choreId,
  offerCount,
  seedDuty,
  seedHouseholdWithPrices,
  seedMonthState,
  seedOffer,
  storedDuty,
  storedOffer,
  type OfferStatus,
} from './helpers/seed';

process.env.CALENDAR_TABLE = CALENDAR_TABLE;
process.env.CHORE_TYPES_TABLE = CHORE_TYPES_TABLE;

const feature = await loadFeature('packages/backend/test/u8-swap/swap-transaction.feature');

const MONTH = '2027-01';
const DATE = '2027-01-12';
const NOW = new Date('2027-01-08T03:00:00.000Z');
const DUTY_ID = FAKE_U8_DUTY_ID_A;
const BASE = '太郎の皿洗い（未・version 2）と、確定していない 2027-01 がある';

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: ReturnType<typeof installFakeDynamo>;
  let calendar: Table;
  let outcomes: unknown[];

  BeforeEachScenario(() => {
    world = installFakeDynamo();
    calendar = world.calendar;
    outcomes = [];
    seedHouseholdWithPrices(world);
  });
  AfterEachScenario(() => {
    world.mock.reset();
  });

  const dutyRecord = (over: Partial<DutyRecord> = {}): DutyRecord => ({
    dutyId: DUTY_ID,
    familyId: FAMILY_ID,
    month: MONTH,
    date: DATE,
    choreTypeId: choreId('dishes'),
    childUserId: childId('taro'),
    status: 'todo',
    origin: 'rule',
    version: 2,
    createdAt: '2026-12-20T00:00:00.000Z',
    updatedAt: '2026-12-20T00:00:00.000Z',
    ...over,
  });
  const dishesRow = (): Record<string, unknown> | undefined =>
    storedDuty(calendar, DATE, choreId('dishes'));
  const offerRow = (): Record<string, unknown> | undefined => storedOffer(calendar, DUTY_ID);

  const seedBase = (): void => {
    seedDuty(calendar, {
      dutyId: DUTY_ID,
      date: DATE,
      choreTypeId: choreId('dishes'),
      childUserId: childId('taro'),
      version: 2,
    });
    seedMonthState(calendar, { month: MONTH, confirmed: false });
  };
  const seedOpenOffer = (dutyVersion = 2): void =>
    seedOffer(calendar, {
      dutyId: DUTY_ID,
      offerId: FAKE_U8_OFFER_ID_1,
      offererUserId: childId('taro'),
      dutyVersion,
    });
  const openOffer = async () => {
    const offer = await getOffer(FAMILY_ID, DUTY_ID);
    if (!offer) throw new Error('申し出が置かれていません');
    return offer;
  };

  Scenario(
    '申し出の作成は 3 項目の取引で、担当そのものは書き換えない',
    ({ Given, When, Then, And }) => {
      const before = { current: undefined as Record<string, unknown> | undefined };
      Given(BASE, seedBase);
      When('太郎の皿洗いの申し出を作る', async () => {
        before.current = { ...dishesRow() };
        outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_1, NOW));
      });
      Then('取引は成功し、申し出は open で担当の version 2 を持つ', () => {
        expect(outcomes[0]).toBe('written');
        expect(offerRow()).toMatchObject({
          dutyId: DUTY_ID,
          offerId: FAKE_U8_OFFER_ID_1,
          offererUserId: childId('taro'),
          dutyVersion: 2,
          status: 'open',
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        });
      });
      And('取引の項目数は 3 で、担当の項目は書き換わっていない', () => {
        expect(world.hooks.transactionSizes).toEqual([3]);
        expect(dishesRow()).toEqual(before.current);
      });
    },
  );

  Scenario(
    '申し出が終わった項目には新しい申し出の ID で上書きできる',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('取り下げ済み・引き受け済み・自動でなくなった申し出が順に残っている', () => {
        seedOpenOffer();
      });
      When('新しい申し出を順に作る', async () => {
        const statuses: OfferStatus[] = ['withdrawn', 'accepted', 'cancelled'];
        for (const status of statuses) {
          seedOffer(calendar, {
            dutyId: DUTY_ID,
            offerId: FAKE_U8_OFFER_ID_1,
            offererUserId: childId('taro'),
            dutyVersion: 2,
            status,
          });
          outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_2, NOW));
          expect(offerRow()).toMatchObject({ offerId: FAKE_U8_OFFER_ID_2, status: 'open' });
        }
      });
      Then('どれも成功し、申し出は新しい ID の open になり、引き受けの記録は消える', () => {
        expect(outcomes).toEqual(['written', 'written', 'written']);
        expect(offerRow()).not.toHaveProperty('acceptedByUserId');
        expect(offerRow()).not.toHaveProperty('acceptedAt');
      });
    },
  );

  Scenario(
    '担当が変わって無効になった古い open の申し出にも上書きできる',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('担当の version が 1 のときに出された open の申し出が残っている', () => {
        seedOpenOffer(1);
      });
      When('太郎の皿洗いの申し出を作る', async () => {
        outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_2, NOW));
      });
      Then('取引は成功し、申し出は新しい ID の open になる', () => {
        expect(outcomes[0]).toBe('written');
        expect(offerRow()).toMatchObject({
          offerId: FAKE_U8_OFFER_ID_2,
          status: 'open',
          dutyVersion: 2,
        });
      });
    },
  );

  Scenario('有効な open の申し出がある担当には、申し出を作れない', ({ Given, And, When, Then }) => {
    Given(BASE, seedBase);
    And('担当の version 2 に出された open の申し出が残っている', () => {
      seedOpenOffer(2);
    });
    When('太郎の皿洗いの申し出を作る', async () => {
      outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_2, NOW));
    });
    Then('取引は競合で断られ、残っている申し出は変わらない', () => {
      expect(outcomes[0]).toBe('conflict');
      expect(offerRow()).toMatchObject({ offerId: FAKE_U8_OFFER_ID_1, status: 'open' });
    });
  });

  Scenario(
    '担当が読んだときから変わっていたり、月が確定していたら申し出を作れない',
    ({ Given, When, And, Then }) => {
      Given(BASE, seedBase);
      When('担当が読んだときから変わっている状態で申し出を作る', async () => {
        outcomes.push(await createOffer(dutyRecord({ version: 1 }), FAKE_U8_OFFER_ID_1, NOW));
      });
      And('月が確定している状態で申し出を作る', async () => {
        seedMonthState(calendar, { month: MONTH, confirmed: true });
        outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_1, NOW));
      });
      Then('どちらも競合で断られ、申し出の項目は作られない', () => {
        expect(outcomes).toEqual(['conflict', 'conflict']);
        expect(offerCount(calendar)).toBe(0);
      });
    },
  );

  Scenario(
    '引き受けは担当・申し出・月の確かめの 3 項目の取引で、担当の子供と origin だけが変わる',
    ({ Given, And, When, Then }) => {
      const before = { current: undefined as Record<string, unknown> | undefined };
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('花子が引き受ける', async () => {
        before.current = { ...dishesRow() };
        outcomes.push(await acceptOffer(dutyRecord(), await openOffer(), childId('hanako'), NOW));
      });
      Then('取引は成功し、担当の子供は花子で origin は swap、version は 3 になる', () => {
        expect(outcomes[0]).toBe('written');
        expect(dishesRow()).toMatchObject({
          childUserId: childId('hanako'),
          origin: 'swap',
          version: 3,
          updatedAt: NOW.toISOString(),
        });
      });
      And('担当の状態と記録の項目は変わらず、申し出は accepted で受け手と時刻が残る', () => {
        const { childUserId, origin, version, updatedAt, ...rest } = dishesRow() ?? {};
        const {
          childUserId: _c,
          origin: _o,
          version: _v,
          updatedAt: _u,
          ...restBefore
        } = before.current ?? {};
        void [childUserId, origin, version, updatedAt, _c, _o, _v, _u];
        expect(rest).toEqual(restBefore);
        expect(offerRow()).toMatchObject({
          status: 'accepted',
          acceptedByUserId: childId('hanako'),
          acceptedAt: NOW.toISOString(),
        });
      });
      And('取引の項目数は 3 で、種類の表は書かれない', async () => {
        expect(world.hooks.transactionSizes).toEqual([3]);
        const offer = await openOffer();
        const items = buildAcceptItems(dutyRecord(), offer, childId('hanako'), NOW);
        const tableNames = items.map((item) => Object.values(item)[0]?.TableName);
        expect(new Set(tableNames)).toEqual(new Set([CALENDAR_TABLE]));
      });
    },
  );

  Scenario(
    '先に別の人が引き受けていると、取引全体が断られ何も書かれない',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('引き受けの取引の直前に別の子供が先に引き受ける', () => {
        world.hooks.beforeTransaction(1, () => {
          seedDuty(calendar, {
            dutyId: DUTY_ID,
            date: DATE,
            choreTypeId: choreId('dishes'),
            childUserId: childId('jiro'),
            origin: 'swap',
            version: 3,
          });
          seedOffer(calendar, {
            dutyId: DUTY_ID,
            offerId: FAKE_U8_OFFER_ID_1,
            offererUserId: childId('taro'),
            dutyVersion: 2,
            status: 'accepted',
            acceptedByUserId: childId('jiro'),
          });
        });
      });
      And('花子が引き受ける', async () => {
        outcomes.push(await acceptOffer(dutyRecord(), await openOffer(), childId('hanako'), NOW));
      });
      Then('取引は競合で断られ、担当の子供は先に引き受けた子供のままである', () => {
        expect(outcomes[0]).toBe('conflict');
        expect(dishesRow()).toMatchObject({ childUserId: childId('jiro'), version: 3 });
        expect(offerRow()).toMatchObject({
          status: 'accepted',
          acceptedByUserId: childId('jiro'),
        });
      });
    },
  );

  Scenario(
    '引き受けの取引の直前に月が確定されたら、担当も申し出も書かれない',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('引き受けの取引の直前に月が確定される', () => {
        world.hooks.beforeTransaction(1, () =>
          seedMonthState(calendar, { month: MONTH, confirmed: true }),
        );
      });
      And('花子が引き受ける', async () => {
        outcomes.push(await acceptOffer(dutyRecord(), await openOffer(), childId('hanako'), NOW));
      });
      Then('取引は競合で断られ、担当は太郎のまま、申し出は open のままである', () => {
        expect(outcomes[0]).toBe('conflict');
        expect(dishesRow()).toMatchObject({ childUserId: childId('taro'), version: 2 });
        expect(offerRow()).toMatchObject({ status: 'open' });
      });
    },
  );

  Scenario('取り下げは申し出の項目だけを書き、担当に触れない', ({ Given, And, When, Then }) => {
    const before = { current: undefined as Record<string, unknown> | undefined };
    Given(BASE, seedBase);
    And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
    When('申し出を取り下げる', async () => {
      before.current = { ...dishesRow() };
      outcomes.push(await withdrawOffer(FAMILY_ID, DUTY_ID, FAKE_U8_OFFER_ID_1, NOW));
    });
    Then('書き込みは成功し、申し出は withdrawn になり、担当は変わらない', () => {
      expect(outcomes[0]).toBe('written');
      expect(offerRow()).toMatchObject({ status: 'withdrawn', updatedAt: NOW.toISOString() });
      expect(dishesRow()).toEqual(before.current);
      expect(world.hooks.transactionSizes).toEqual([]);
    });
  });

  Scenario(
    '申し出の ID が違う・open でない申し出は取り下げられない',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('違う申し出の ID で取り下げる', async () => {
        outcomes.push(await withdrawOffer(FAMILY_ID, DUTY_ID, FAKE_U8_OFFER_ID_3, NOW));
      });
      And('引き受け済みにしてから取り下げる', async () => {
        seedOffer(calendar, {
          dutyId: DUTY_ID,
          offerId: FAKE_U8_OFFER_ID_1,
          offererUserId: childId('taro'),
          dutyVersion: 2,
          status: 'accepted',
          acceptedByUserId: childId('hanako'),
        });
        outcomes.push(await withdrawOffer(FAMILY_ID, DUTY_ID, FAKE_U8_OFFER_ID_1, NOW));
      });
      Then('どちらも競合で断られ、引き受け済みの申し出は変わらない', () => {
        expect(outcomes).toEqual(['conflict', 'conflict']);
        expect(offerRow()).toMatchObject({
          status: 'accepted',
          acceptedByUserId: childId('hanako'),
        });
      });
    },
  );

  Scenario(
    '掃除は open の申し出だけを cancelled にし、項目がなければ作らない',
    ({ Given, And, When, Then }) => {
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('申し出を掃除する', async () => {
        outcomes.push(await closeOffer(FAMILY_ID, DUTY_ID, NOW));
      });
      And('もう一度掃除する', async () => {
        outcomes.push(await closeOffer(FAMILY_ID, DUTY_ID, NOW));
      });
      And('申し出のない担当を掃除する', async () => {
        outcomes.push(await closeOffer(FAMILY_ID, FAKE_U8_DUTY_ID_B, NOW));
      });
      Then('最初の掃除だけが効き、申し出は cancelled になる', () => {
        expect(outcomes).toEqual([true, false, false]);
        expect(offerRow()).toMatchObject({ status: 'cancelled' });
      });
      And('申し出のない担当には項目が作られない', () => {
        expect(storedOffer(calendar, FAKE_U8_DUTY_ID_B)).toBeUndefined();
        expect(offerCount(calendar)).toBe(1);
      });
    },
  );

  Scenario(
    '申し出の項目は強い整合性の GetItem で読み、月の読み取りに入らず、使ってはいけない呼び出しもない',
    ({ Given, And, When, Then }) => {
      let month: unknown;
      Given(BASE, seedBase);
      And('担当の version 2 に出された太郎の open の申し出が残っている', () => seedOpenOffer());
      When('申し出を読み、2027-01 の月を読み、申し出を作り直して取り下げる', async () => {
        world.hooks.readLog.length = 0;
        await getOffer(FAMILY_ID, DUTY_ID);
        month = await loadMonth(FAMILY_ID, MONTH);
        await withdrawOffer(FAMILY_ID, DUTY_ID, FAKE_U8_OFFER_ID_1, NOW);
        outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_2, NOW));
      });
      Then('申し出は強い整合性の GetItem 1 回で読める', () => {
        const swapGets = world.hooks.readTargets.filter(
          (t) => t.startsWith('Get') && t.includes('SWAP#'),
        );
        expect(swapGets).toHaveLength(1);
        const first = world.hooks.readLog[0];
        expect(first).toMatchObject({ operation: 'Get', consistent: true });
      });
      And(
        '月の読み取りは申し出の項目を返さず、PutItem・DeleteItem・Scan・BatchGet・BatchWrite は呼ばれない',
        () => {
          expect(JSON.stringify(month)).not.toContain('SWAP#');
          expect(world.hooks.readTargets.filter((t) => t.startsWith('Query')).join()).not.toContain(
            'SWAP#',
          );
          expect(world.hooks.forbiddenCalls).toEqual([]);
          expect(world.hooks.readLog.some((entry) => entry.operation === 'Scan')).toBe(false);
          expect(outcomes[0]).toBe('written');
        },
      );
    },
  );

  Scenario('条件式・更新式の属性名はすべて別名で書かれている', ({ Given, When, Then }) => {
    let expressions: {
      expr: string;
      names: Record<string, string>;
      values: Record<string, unknown>;
    }[];
    Given(BASE, seedBase);
    When('作成・引き受け・取り下げ・掃除の式を組み立てる', () => {
      const offer = {
        familyId: FAMILY_ID,
        dutyId: DUTY_ID,
        offerId: FAKE_U8_OFFER_ID_1,
        offererUserId: childId('taro'),
        dutyVersion: 2,
        status: 'open' as const,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      const items = [
        ...buildCreateOfferItems(dutyRecord(), FAKE_U8_OFFER_ID_1, NOW),
        ...buildAcceptItems(dutyRecord(), offer, childId('hanako'), NOW),
        buildWithdrawUpdate(FAMILY_ID, DUTY_ID, FAKE_U8_OFFER_ID_1, NOW),
        buildCloseUpdate(FAMILY_ID, DUTY_ID, NOW),
      ];
      expressions = items.flatMap((item) => {
        const op = Object.values(item)[0] as {
          UpdateExpression?: string;
          ConditionExpression?: string;
          ExpressionAttributeNames?: Record<string, string>;
          ExpressionAttributeValues?: Record<string, unknown>;
        };
        return [op.UpdateExpression, op.ConditionExpression].flatMap((expr) =>
          expr
            ? [
                {
                  expr,
                  names: op.ExpressionAttributeNames ?? {},
                  values: op.ExpressionAttributeValues ?? {},
                },
              ]
            : [],
        );
      });
    });
    Then('式の中の属性名はどれも # の別名か値の印で、別名の定義が式の外にそろっている', () => {
      const keywords = new Set([
        'SET',
        'REMOVE',
        'AND',
        'OR',
        'attribute_exists',
        'attribute_not_exists',
      ]);
      expect(expressions.length).toBeGreaterThan(0);
      for (const { expr, names, values } of expressions) {
        const bare = expr.replace(/[#:]\w+/g, '').match(/[A-Za-z_]\w*/g) ?? [];
        for (const word of bare) expect(keywords.has(word)).toBe(true);
        for (const alias of expr.match(/#\w+/g) ?? []) expect(names).toHaveProperty(alias);
        for (const value of expr.match(/:\w+/g) ?? []) expect(values).toHaveProperty(value);
      }
    });
  });

  Scenario('思いがけない失敗の理由は競合にせず投げ直す', ({ Given, When, Then }) => {
    let thrown: unknown;
    Given(BASE, seedBase);
    When('次の取引を ThrottlingError で断らせて申し出を作る', async () => {
      world.hooks.failTransaction(1, 'ThrottlingError');
      try {
        outcomes.push(await createOffer(dutyRecord(), FAKE_U8_OFFER_ID_1, NOW));
      } catch (error) {
        thrown = error;
      }
    });
    Then('競合ではなくエラーとして投げ直される', () => {
      expect(outcomes).toEqual([]);
      expect(thrown).toBeInstanceOf(Error);
      expect(offerCount(calendar)).toBe(0);
    });
  });
});
