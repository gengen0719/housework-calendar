import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Allowance } from '@housework/shared';
import { expect, vi } from 'vitest';
import { getAllowances } from '../../src/services/allowanceService';
import * as familyMemberService from '../../src/services/familyMemberService';
import {
  FAKE_U9_DEPARTED_USER_ID,
  FAKE_U9_MARKER_CHORE_NAME,
  FAKE_U9_MARKER_DISPLAY_NAME,
  FAKE_U9_MARKER_UNIT_PRICE,
} from '../fixtures/fakeSecrets';
import {
  asRead,
  CHILDREN,
  CHORES,
  ctxAdmin,
  dateOf,
  fakeU9ChoreTypeId,
  FAMILY_ID,
  lineText,
  MONTH,
  PEOPLE,
  readCount,
  rowOf,
  setupAllowanceWorld,
  type AllowanceWorld,
} from './helpers/allowanceWorld';
import { USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { corruptUnitPrice } from './helpers/seed';

const feature = await loadFeature('packages/backend/test/u9-allowance/allowance-anomaly.feature');

const WITHOUT_PRICE = 'ALLOWANCE_DUTY_WITHOUT_PRICE';
const TYPE_MISSING = 'ALLOWANCE_CHORE_TYPE_MISSING';
const OWNER_NOT_CHILD = 'ALLOWANCE_DUTY_OWNER_NOT_CHILD';
const ANOMALY_EVENTS = [WITHOUT_PRICE, TYPE_MISSING, OWNER_NOT_CHILD];

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let results: Allowance[][];

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    results = [];
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
    vi.restoreAllMocks();
  });

  const read = async (): Promise<void> => {
    results.push(await getAllowances(asRead(ctxAdmin()), MONTH));
  };
  const taro = (): Allowance => rowOf(results[results.length - 1] ?? [], '太郎');
  const anomalyRows = () => w.logs.lines.filter((l) => ANOMALY_EVENTS.includes(String(l.event)));
  const keysOf = (row: Record<string, unknown>): string[] =>
    Object.keys(row)
      .filter((k) => !['level', 'timestamp', 'env', 'entry', 'requestId'].includes(k))
      .sort();
  /** i 番目の「単価なし」の「済」を置く（日付は 28 日で一巡し、種類を変えて sk の重複を避ける）。 */
  const withoutPrice = (count: number, typeBase: number): void => {
    for (let i = 0; i < count; i++) {
      w.done({
        date: dateOf(i),
        choreTypeId: fakeU9ChoreTypeId(typeBase + Math.floor(i / 28)),
        price: null,
      });
    }
  };
  /** sk の順（日付、種類の ID の順）に、dutyId を並べる。 */
  const dutyIdsInSkOrder = (predicate: (item: Record<string, unknown>) => boolean): string[] =>
    [...w.world.calendar.values()]
      .filter((item) => String(item.sk).includes('#D#') && predicate(item))
      .sort((a, b) => (String(a.sk) < String(b.sk) ? -1 : 1))
      .map((item) => String(item.dutyId));

  Scenario(
    '単価の項目がない「済」は数えず ALLOWANCE_DUTY_WITHOUT_PRICE が残り、答えは返る',
    ({ Given, When, Then }) => {
      let badId = '';
      Given('太郎の皿洗いの「済」が単価の項目なしで 1 件、正常に 2 件ある', () => {
        badId = w.done({ date: dateOf(0), price: null });
        w.done({ date: dateOf(1) });
        w.done({ date: dateOf(2) });
      });
      When('管理者が 1 月のお小遣いを読む', read);
      Then('正常な 2 件だけが数えられ、WITHOUT_PRICE が familyId と dutyId だけで 1 行残る', () => {
        expect(taro().lines.map(lineText)).toEqual(['皿洗い 100 x 2 = 200']);
        const rows = w.logs.rows(WITHOUT_PRICE);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.familyId).toBe(FAMILY_ID);
        expect(rows[0]?.dutyId).toBe(badId);
        expect(keysOf(rows[0] ?? {})).toEqual(['dutyId', 'event', 'familyId']);
      });
    },
  );

  Scenario('単価が null の「済」も数えず同じようにログに残る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」の単価が null で 1 件、正常に 1 件ある', () => {
      w.done({ date: dateOf(0) });
      w.done({ date: dateOf(1) });
      corruptUnitPrice(w.world.calendar, dateOf(1), CHORES.dishes.choreTypeId, null);
    });
    When('管理者が 1 月のお小遣いを読む', read);
    Then('正常な 1 件だけが数えられ、WITHOUT_PRICE が 1 行残る', () => {
      expect(taro().lines.map(lineText)).toEqual(['皿洗い 100 x 1 = 100']);
      expect(w.logs.rows(WITHOUT_PRICE)).toHaveLength(1);
    });
  });

  Scenario(
    '種類が一覧にない「済」は「不明なお手伝い」で一覧の最後に並び、種類ごとに 1 行ログに残る',
    ({ Given, When, Then }) => {
      Given('太郎の一覧にない種類の「済」が、同じ種類で 2 件ある', () => {
        w.done({ date: dateOf(0), choreTypeId: fakeU9ChoreTypeId(1), price: 70 });
        w.done({ date: dateOf(1), choreTypeId: fakeU9ChoreTypeId(1), price: 70 });
      });
      When('管理者が 1 月のお小遣いを読む', read);
      Then(
        '「不明なお手伝い」の行が 1 行あり、CHORE_TYPE_MISSING は familyId と choreTypeId の 1 行で、anomalyCount は 2 である',
        () => {
          expect(taro().lines.map(lineText)).toEqual(['不明なお手伝い 70 x 2 = 140']);
          const rows = w.logs.rows(TYPE_MISSING);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.choreTypeId).toBe(fakeU9ChoreTypeId(1));
          expect(keysOf(rows[0] ?? {})).toEqual(['choreTypeId', 'event', 'familyId']);
          expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(2);
        },
      );
    },
  );

  Scenario('不明なお手伝いの行は使わない種類のあとの最後に並ぶ', ({ Given, When, Then }) => {
    Given('太郎の一覧にない種類、お風呂洗い（使わない）、皿洗いの「済」がある', () => {
      w.done({ date: dateOf(0), choreTypeId: fakeU9ChoreTypeId(1), price: 70 });
      w.done({ date: dateOf(1), chore: 'bath' });
      w.done({ date: dateOf(2), chore: 'dishes' });
    });
    When('管理者が 1 月のお小遣いを読む', read);
    Then('内訳は皿洗い、お風呂洗い、不明なお手伝いの順である', () => {
      expect(taro().lines.map((l) => l.choreName)).toEqual(['皿洗い', 'お風呂洗い', '不明なお手伝い']);
    });
  });

  Scenario(
    '担当の子供が管理者の ID なら行を作らず ALLOWANCE_DUTY_OWNER_NOT_CHILD が残る',
    ({ Given, When, Then }) => {
      let badId = '';
      Given('担当の子供が管理者の ID になっている「済」が 1 件ある', () => {
        badId = w.done({ date: dateOf(0), childUserId: PEOPLE.mother.userId });
      });
      When('管理者が 1 月のお小遣いを読む', read);
      Then('管理者の行はなく、OWNER_NOT_CHILD が familyId と dutyId だけで 1 行残り、答えは返る', () => {
        const rows = results[0] ?? [];
        expect(rows.map((a) => a.displayName)).toEqual(['太郎', '花子', '次郎']);
        const logged = w.logs.rows(OWNER_NOT_CHILD);
        expect(logged).toHaveLength(1);
        expect(logged[0]?.dutyId).toBe(badId);
        expect(keysOf(logged[0] ?? {})).toEqual(['dutyId', 'event', 'familyId']);
      });
    },
  );

  Scenario('管理者の担当では子供の確かめも名前の読み取りも呼ばれない', ({ Given, When, Then }) => {
    // vitest-cucumber は手順ごとに別のテストとして動かし、vi のモックの記録は手順をまたいで残らないので、数えるのは自前で行う
    const calls = { child: 0, name: 0 };
    Given('担当の子供が管理者の ID になっている「済」が 1 件ある', () => {
      w.done({ date: dateOf(0), childUserId: PEOPLE.mother.userId });
    });
    When('子供の確かめと名前の読み取りを見張りながら管理者が 1 月のお小遣いを読む', async () => {
      const originalChild = familyMemberService.findFamilyChild;
      const originalName = familyMemberService.findDisplayName;
      vi.spyOn(familyMemberService, 'findFamilyChild').mockImplementation((...args) => {
        calls.child += 1;
        return originalChild(...args);
      });
      vi.spyOn(familyMemberService, 'findDisplayName').mockImplementation((...args) => {
        calls.name += 1;
        return originalName(...args);
      });
      await read();
    });
    Then('findFamilyChild も findDisplayName も 0 回である', () => {
      expect(results).toHaveLength(1);
      expect(calls).toEqual({ child: 0, name: 0 });
      expect(readCount(w.world, USERS_TABLE, 'Get')).toBe(0);
    });
  });

  Scenario(
    '管理者でも今いる子供でもない ID は抜けた子供として行が出て異常にならない',
    ({ Given, When, Then }) => {
      Given('家族を抜けた「ゆうき」の「済」が 1 件ある', () => {
        w.departed(FAKE_U9_DEPARTED_USER_ID, 'ゆうき');
        w.done({ date: dateOf(0), childUserId: FAKE_U9_DEPARTED_USER_ID });
      });
      When('管理者が 1 月のお小遣いを読む', read);
      Then('「ゆうき」の行があり、異常のログは 1 行もない', () => {
        expect(rowOf(results[0] ?? [], 'ゆうき').current).toBe(false);
        expect(anomalyRows()).toHaveLength(0);
      });
    },
  );

  Scenario(
    '単価なしが 300 件あっても行は 20 行までで、省いた分も anomalyCount に入る',
    ({ Given, When, Then }) => {
      Given('単価の項目がない「済」が 300 件ある', () => withoutPrice(300, 40));
      When('管理者が 1 月のお小遣いを読む', read);
      Then('WITHOUT_PRICE は 20 行で anomalyCount は 300 で、行は sk の順の先頭 20 件である', () => {
        const rows = w.logs.rows(WITHOUT_PRICE);
        expect(rows).toHaveLength(20);
        expect(rows.map((r) => r.dutyId)).toEqual(dutyIdsInSkOrder(() => true).slice(0, 20));
        expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(300);
      });
    },
  );

  Scenario(
    '3 種類の異常がそれぞれ多くても各種類 20 行まで、合計 60 行以下である',
    ({ Given, When, Then }) => {
      Given('単価なし 100 件、一覧にない種類 25 種類 100 件、管理者の担当 100 件の「済」がある', () => {
        withoutPrice(100, 40);
        for (let t = 0; t < 25; t++) {
          for (let d = 0; d < 4; d++) {
            w.done({ date: dateOf(d), choreTypeId: fakeU9ChoreTypeId(t) });
          }
        }
        for (let i = 0; i < 100; i++) {
          w.done({
            date: dateOf(i),
            choreTypeId: fakeU9ChoreTypeId(60 + Math.floor(i / 28)),
            childUserId: PEOPLE.mother.userId,
          });
        }
      });
      When('管理者が 1 月のお小遣いを読む', read);
      Then('異常のログは種類ごとに 20 行で合計 60 行以下で、anomalyCount は 300 である', () => {
        expect(w.logs.rows(WITHOUT_PRICE)).toHaveLength(20);
        expect(w.logs.rows(TYPE_MISSING)).toHaveLength(20);
        expect(w.logs.rows(OWNER_NOT_CHILD)).toHaveLength(20);
        expect(anomalyRows().length).toBeLessThanOrEqual(60);
        expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(300);
      });
    },
  );

  Scenario('一覧にない種類のログは種類の ID の昇順で先頭 20 種類になる', ({ Given, When, Then }) => {
    Given('一覧にない種類 25 種類の「済」が 1 件ずつある', () => {
      // 登録の逆順に置いても、ログは種類の ID の昇順で決まる
      for (let t = 24; t >= 0; t--) w.done({ date: dateOf(t), choreTypeId: fakeU9ChoreTypeId(t) });
    });
    When('管理者が 1 月のお小遣いを読む', read);
    Then('CHORE_TYPE_MISSING は種類の ID の昇順の先頭 20 行で、anomalyCount は 25 である', () => {
      const ids = w.logs.rows(TYPE_MISSING).map((r) => r.choreTypeId);
      const expected = Array.from({ length: 25 }, (_, t) => fakeU9ChoreTypeId(t))
        .sort()
        .slice(0, 20);
      expect(ids).toEqual(expected);
      expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(25);
    });
  });

  Scenario('同じデータを 2 回読むと異常のログの行は毎回同じである', ({ Given, When, Then }) => {
    Given('単価の項目がない「済」が 30 件ある', () => withoutPrice(30, 40));
    When('管理者が 1 月のお小遣いを 2 回読む', async () => {
      await read();
      const firstCount = w.logs.rows(WITHOUT_PRICE).length;
      await read();
      expect(firstCount).toBe(20);
    });
    Then('2 回の WITHOUT_PRICE の行は同じ順で同じ内容である', () => {
      const rows = w.logs.rows(WITHOUT_PRICE).map((r) => r.dutyId);
      expect(rows).toHaveLength(40);
      expect(rows.slice(0, 20)).toEqual(rows.slice(20));
    });
  });

  Scenario('異常のログは計算のログより先に出て、計算のログは 1 件だけである', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が単価の項目なしで 1 件、正常に 2 件ある', () => {
      w.done({ date: dateOf(0), price: null });
      w.done({ date: dateOf(1) });
      w.done({ date: dateOf(2) });
    });
    When('管理者が 1 月のお小遣いを読む', read);
    Then('異常の行のあとに ALLOWANCE_COMPUTED が 1 件だけあり、anomalyCount は 1 である', () => {
      const events = w.logs.lines.map((l) => l.event);
      expect(events.filter((e) => e === 'ALLOWANCE_COMPUTED')).toHaveLength(1);
      expect(events.indexOf(WITHOUT_PRICE)).toBeLessThan(events.indexOf('ALLOWANCE_COMPUTED'));
      expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(1);
    });
  });

  Scenario('異常のログの項目に名前・金額・利用者の ID が入らない', ({ Given, When, Then }) => {
    Given('3 種類の異常が 1 件ずつあり、名前と単価に目印がついている', () => {
      const item = w.world.users.get(CHILDREN.taro.userId);
      if (item) {
        w.world.users.set(CHILDREN.taro.userId, { ...item, displayName: FAKE_U9_MARKER_DISPLAY_NAME });
      }
      const key = `${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`;
      const type = w.world.choreTypes.get(key);
      if (type) w.world.choreTypes.set(key, { ...type, name: FAKE_U9_MARKER_CHORE_NAME });
      w.done({ date: dateOf(0), price: FAKE_U9_MARKER_UNIT_PRICE });
      w.done({ date: dateOf(1), price: null });
      w.done({ date: dateOf(2), choreTypeId: fakeU9ChoreTypeId(1) });
      w.done({ date: dateOf(3), childUserId: PEOPLE.mother.userId });
    });
    When('管理者が 1 月のお小遣いを読む', read);
    Then('異常の行の項目名は許可した一覧と完全に一致し、目印の文字も数字も全行にない', () => {
      for (const row of w.logs.rows(WITHOUT_PRICE)) {
        expect(keysOf(row)).toEqual(['dutyId', 'event', 'familyId']);
      }
      for (const row of w.logs.rows(OWNER_NOT_CHILD)) {
        expect(keysOf(row)).toEqual(['dutyId', 'event', 'familyId']);
      }
      for (const row of w.logs.rows(TYPE_MISSING)) {
        expect(keysOf(row)).toEqual(['choreTypeId', 'event', 'familyId']);
      }
      expect(anomalyRows()).toHaveLength(3);
      expect(
        w.logs.findLeak([
          FAKE_U9_MARKER_DISPLAY_NAME,
          FAKE_U9_MARKER_CHORE_NAME,
          FAKE_U9_MARKER_UNIT_PRICE,
          CHILDREN.taro.userId,
          PEOPLE.mother.userId,
        ]),
      ).toBeUndefined();
    });
  });
});
