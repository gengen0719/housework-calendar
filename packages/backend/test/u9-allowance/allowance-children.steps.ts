import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Allowance } from '@housework/shared';
import { expect, vi } from 'vitest';
import { getAllowances } from '../../src/services/allowanceService';
import {
  FAKE_U9_DEPARTED_USER_ID,
  FAKE_U9_DEPARTED_USER_ID_2,
  fakeU9ChildId,
} from '../fixtures/fakeSecrets';
import { USERS_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import {
  asRead,
  CHILDREN,
  ctxAdmin,
  ctxChild,
  dateOf,
  MONTH,
  readCount,
  rowOf,
  setupAllowanceWorld,
  SYSTEM_CTX,
  type AllowanceWorld,
} from './helpers/allowanceWorld';

const feature = await loadFeature('packages/backend/test/u9-allowance/allowance-children.feature');

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let result: Allowance[];

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    result = [];
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
    vi.restoreAllMocks();
  });

  const read = (month = MONTH, ctx = asRead(ctxAdmin())) => async (): Promise<void> => {
    result = await getAllowances(ctx, month);
  };
  const names = (): string[] => result.map((a) => a.displayName);
  const THREE = ['太郎', '花子', '次郎'];

  Scenario('行は太郎・花子・次郎の家族に入った順で、管理者の行はない', ({ Given, When, Then }) => {
    Given('担当が 1 件もない山田家がある', () => undefined);
    When('管理者が 1 月のお小遣いを読む', read());
    Then('行は太郎、花子、次郎の順で、管理者の行はない', () => {
      expect(names()).toEqual(THREE);
    });
  });

  Scenario('次郎に「済」がなくても行があり内訳は空で合計は 0 である', ({ Given, When, Then }) => {
    Given('太郎だけに皿洗いの「済」が 1 回ある', () => {
      w.done({ date: dateOf(0) });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('次郎の行があり、内訳と加算・減額は空で、合計は 0 である', () => {
      const jiro = rowOf(result, '次郎');
      expect(jiro.lines).toEqual([]);
      expect(jiro.adjustments).toEqual([]);
      expect(jiro.total).toBe(0);
    });
  });

  Scenario('家族が作られる前の月でも今いる子供は 0 円で出る', ({ Given, When, Then }) => {
    Given('担当が 1 件もない山田家がある', () => undefined);
    When('管理者が 2000 年 1 月のお小遣いを読む', read('2000-01'));
    Then('3 人とも 0 円の行で出る', () => {
      expect(names()).toEqual(THREE);
      expect(result.map((a) => a.total)).toEqual([0, 0, 0]);
    });
  });

  Scenario('各行の月は読んだ月で、今いる子供は current が真になる', ({ Given, When, Then }) => {
    Given('太郎だけに皿洗いの「済」が 1 回ある', () => {
      w.done({ date: dateOf(0) });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('全部の行の月は 2027-01 で、current は全部真である', () => {
      expect(result.every((a) => a.month === '2027-01' && a.current)).toBe(true);
    });
  });

  Scenario('抜けた子供の「済」がある月は名前つきで今いる子供の後ろに出る', ({ Given, When, Then }) => {
    Given('家族を抜けた「ゆうき」の 1 月の皿洗いの「済」が 2 回ある', () => {
      w.departed(FAKE_U9_DEPARTED_USER_ID, 'ゆうき');
      w.done({ date: dateOf(0), childUserId: FAKE_U9_DEPARTED_USER_ID });
      w.done({ date: dateOf(1), childUserId: FAKE_U9_DEPARTED_USER_ID });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('太郎、花子、次郎の後ろに「ゆうき」の行があり、current は偽で合計は 200 である', () => {
      expect(names()).toEqual([...THREE, 'ゆうき']);
      const row = rowOf(result, 'ゆうき');
      expect(row.current).toBe(false);
      expect(row.total).toBe(200);
      expect(row.childUserId).toBe(FAKE_U9_DEPARTED_USER_ID);
    });
  });

  Scenario('抜けた子供の「済」がない月は行が出ない', ({ Given, When, Then }) => {
    Given('家族を抜けた「ゆうき」の 1 月の皿洗いの「済」が 2 回あり、2 月には担当がない', () => {
      w.departed(FAKE_U9_DEPARTED_USER_ID, 'ゆうき');
      w.done({ date: dateOf(0), childUserId: FAKE_U9_DEPARTED_USER_ID });
      w.done({ date: dateOf(1), childUserId: FAKE_U9_DEPARTED_USER_ID });
    });
    When('管理者が 2 月のお小遣いを読む', read('2027-02'));
    Then('行は太郎、花子、次郎の 3 行だけである', () => {
      expect(names()).toEqual(THREE);
    });
  });

  Scenario('抜けた子供の担当が「未」と「×」だけなら行が出ない', ({ Given, When, Then }) => {
    Given('家族を抜けた「ゆうき」の 1 月の皿洗いが「未」と「×」だけである', () => {
      w.departed(FAKE_U9_DEPARTED_USER_ID, 'ゆうき');
      w.other('todo', { date: dateOf(0), childUserId: FAKE_U9_DEPARTED_USER_ID });
      w.other('skipped', { date: dateOf(1), childUserId: FAKE_U9_DEPARTED_USER_ID });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('行は太郎、花子、次郎の 3 行だけである', () => {
      expect(names()).toEqual(THREE);
    });
  });

  Scenario('名前が読めない抜けた子供は「名前が分からない子供」で出る', ({ Given, When, Then }) => {
    Given('利用者の記録が残っていない抜けた子供の 1 月の皿洗いの「済」がある', () => {
      w.departed(FAKE_U9_DEPARTED_USER_ID);
      w.done({ date: dateOf(0), childUserId: FAKE_U9_DEPARTED_USER_ID });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('今いる子供の後ろに「名前が分からない子供」の行があり、current は偽である', () => {
      expect(names()).toEqual([...THREE, '名前が分からない子供']);
      expect(result[3]?.current).toBe(false);
    });
  });

  Scenario('抜けた子供は表示名の順、同じ名前は userId の順に並ぶ', ({ Given, When, Then }) => {
    Given('家族を抜けた「みどり」「あおい」「あおい」の 1 月の皿洗いの「済」がそれぞれ 1 回ある', () => {
      const ids = [fakeU9ChildId(1), FAKE_U9_DEPARTED_USER_ID_2, FAKE_U9_DEPARTED_USER_ID];
      const labels = ['みどり', 'あおい', 'あおい'];
      ids.forEach((id, i) => {
        w.departed(id, labels[i]);
        w.done({ date: dateOf(i), childUserId: id });
      });
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('抜けた子供の行は「あおい」「あおい」「みどり」の順で、同じ名前は userId の順である', () => {
      const departed = result.filter((a) => !a.current);
      expect(departed.map((a) => a.displayName)).toEqual(['あおい', 'あおい', 'みどり']);
      const sameName = departed.filter((a) => a.displayName === 'あおい').map((a) => a.childUserId);
      expect(sameName).toEqual([...sameName].sort());
    });
  });

  Scenario('子供がひとりもいない家族では行が空になる', ({ Given, When, Then }) => {
    Given('子供が 1 人もいない山田家がある', () => {
      for (const key of Object.keys(CHILDREN) as (keyof typeof CHILDREN)[]) {
        w.world.users.delete(CHILDREN[key].userId);
      }
    });
    When('管理者が 1 月のお小遣いを読む', read());
    Then('返る行は 0 件である', () => {
      expect(result).toEqual([]);
    });
  });

  Scenario(
    'お知らせ用の裏側の文脈では管理者でなくても全員分が返り本人の補いの読み取りはしない',
    ({ Given, When, Then }) => {
      Given('花子の皿洗いが 2 回あり、太郎が家族の索引にまだ出ていない', () => {
        w.done({ date: dateOf(0), child: 'hanako' });
        w.done({ date: dateOf(1), child: 'hanako' });
        w.world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
      });
      When('お知らせ用の裏側の文脈で 1 月のお小遣いを読む', read(MONTH, SYSTEM_CTX));
      Then('花子と次郎の行が返り、Users の GetItem は 0 回である', () => {
        expect(names()).toEqual(['花子', '次郎']);
        expect(rowOf(result, '花子').total).toBe(200);
        expect(readCount(w.world, USERS_TABLE, 'Get')).toBe(0);
      });
    },
  );

  Scenario('子供の文脈で本人が索引にまだ出ていなくても行が出る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが 2 回あり、太郎が家族の索引にまだ出ていない', () => {
      w.done({ date: dateOf(0) });
      w.done({ date: dateOf(1) });
      w.world.hiddenFromFamilyIndex.add(CHILDREN.taro.userId);
    });
    When('太郎の文脈で 1 月のお小遣いを読む', read(MONTH, asRead(ctxChild('taro'))));
    Then('太郎の行が合計 200 で出て、Users を強い整合性で読んだのは 1 回である', () => {
      expect(rowOf(result, '太郎').total).toBe(200);
      const consistentGets = w.world.hooks.readLog.filter(
        (e) => e.table === USERS_TABLE && e.operation === 'Get' && e.consistent,
      );
      expect(consistentGets).toHaveLength(1);
    });
  });

  Scenario(
    '家族に入った直後で一覧にまだ出ない子供は確かめて今いる子供として出す',
    ({ Given, When, Then }) => {
      Given('一覧にまだ出ていない子供が実際は家族の子供で、その皿洗いの「済」が 1 回ある', () => {
        w.addChild(fakeU9ChildId(7), 'さくら', '2027-01-10T00:00:00.000Z');
        w.world.hiddenFromFamilyIndex.add(fakeU9ChildId(7));
        w.done({ date: dateOf(0), childUserId: fakeU9ChildId(7) });
      });
      When('管理者が 1 月のお小遣いを読む', read());
      Then('その子供の行は current が真で、名前つきで合計 100 である', () => {
        const row = rowOf(result, 'さくら');
        expect(row.current).toBe(true);
        expect(row.total).toBe(100);
      });
    },
  );
});
