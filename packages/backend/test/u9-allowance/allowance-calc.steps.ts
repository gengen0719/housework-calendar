import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { Allowance } from '@housework/shared';
import { expect, vi } from 'vitest';
import { getAllowances } from '../../src/services/allowanceService';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { fakeU9DutyId } from '../fixtures/fakeSecrets';
import { calendarKey, dutySk, seedDone, seedMonthState } from './helpers/seed';
import {
  asRead,
  CHILDREN,
  CHORES,
  ctxAdmin,
  ctxChild,
  dateOf,
  FAMILY_ID,
  lineText,
  MONTH,
  PEOPLE,
  readCount,
  rowOf,
  setupAllowanceWorld,
  type AllowanceWorld,
} from './helpers/allowanceWorld';
import { setUnitPrice } from '../u7-review-confirm/helpers/seed';
import { totalWrites } from './helpers/writeGuard';

const feature = await loadFeature('packages/backend/test/u9-allowance/allowance-calc.feature');

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let results: Allowance[][];
  let months: string[];
  let fetchSpy: ReturnType<typeof vi.fn>;

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    results = [];
    months = [];
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const read = async (month = MONTH, ctx = asRead(ctxAdmin())): Promise<void> => {
    months.push(month);
    results.push(await getAllowances(ctx, month));
  };
  const readOnce = (): Promise<void> => read();
  const last = (): Allowance[] => {
    const r = results[results.length - 1];
    if (!r) throw new Error('まだ読んでいません');
    return r;
  };
  const taro = (): Allowance => rowOf(last(), CHILDREN.taro.displayName);
  const dishesTimes = (count: number, price?: number): void => {
    for (let i = 0; i < count; i++) {
      w.done({ date: dateOf(i), chore: 'dishes', ...(price !== undefined ? { price } : {}) });
    }
  };
  const revert = (date: string, choreTypeId: string): void => {
    const key = calendarKey(dutySk(MONTH, date, choreTypeId));
    const item = w.world.calendar.get(key);
    if (!item) throw new Error('担当がありません');
    const { unitPrice: _price, recordedAt: _at, recordedBy: _by, ...rest } = item;
    void _price;
    void _at;
    void _by;
    w.world.calendar.set(key, { ...rest, status: 'todo' });
  };

  Scenario(
    '太郎の皿洗い 8 回と洗濯物たたみ 4 回が内訳つきで合計される',
    ({ Given, When, Then }) => {
      Given('太郎の 1 月に皿洗いの「済」が 8 回、洗濯物たたみの「済」が 4 回ある', () => {
        dishesTimes(8);
        for (let i = 0; i < 4; i++) w.done({ date: dateOf(i), chore: 'laundry' });
      });
      When('管理者が 1 月のお小遣いを読む', readOnce);
      Then(
        '太郎の内訳は「皿洗い 100 x 8 = 800」「洗濯物たたみ 150 x 4 = 600」で合計は 1400 である',
        () => {
          expect(taro().lines.map(lineText)).toEqual([
            '皿洗い 100 x 8 = 800',
            '洗濯物たたみ 150 x 4 = 600',
          ]);
          expect(taro().total).toBe(1400);
        },
      );
    },
  );

  Scenario('単価・回数・小計・合計はすべて整数である', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 3 回ある', () => dishesTimes(3));
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳の単価・回数・小計と合計がすべて整数である', () => {
      for (const line of taro().lines) {
        for (const value of [line.unitPrice, line.count, line.amount]) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
      expect(Number.isInteger(taro().total)).toBe(true);
    });
  });

  Scenario(
    '単価を変える前の分と後の分が別の行になり合計は 420 円になる',
    ({ Given, When, Then }) => {
      Given('太郎が皿洗いを 100 円で 3 回記録したあと、単価 120 円で 1 回記録している', () => {
        dishesTimes(3);
        w.done({ date: dateOf(10), chore: 'dishes', price: 120 });
      });
      When('管理者が 1 月のお小遣いを読む', readOnce);
      Then(
        '内訳は「皿洗い 100 x 3 = 300」「皿洗い 120 x 1 = 120」の 2 行で合計は 420 である',
        () => {
          expect(taro().lines.map(lineText)).toEqual([
            '皿洗い 100 x 3 = 300',
            '皿洗い 120 x 1 = 120',
          ]);
          expect(taro().total).toBe(420);
        },
      );
    },
  );

  Scenario('種類の単価をさらに変えても過去の行と合計は変わらない', ({ Given, When, Then }) => {
    Given(
      '太郎が皿洗いを 100 円で 3 回、120 円で 1 回記録していて、種類の単価が 200 円に変わった',
      () => {
        dishesTimes(3);
        w.done({ date: dateOf(10), chore: 'dishes', price: 120 });
        setUnitPrice(w.world.choreTypes, CHORES.dishes.choreTypeId, 200);
      },
    );
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳は 2 行のままで合計は 420 である', () => {
      expect(taro().lines).toHaveLength(2);
      expect(taro().total).toBe(420);
    });
  });

  Scenario('記録が増えると次に読んだときの回数と額が増える', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 3 回ある', () => dishesTimes(3));
    When('管理者が読んだあとに太郎の皿洗いが 1 回増えて、もう一度読む', async () => {
      await read();
      w.done({ date: dateOf(10), chore: 'dishes' });
      await read();
    });
    Then('最初は 3 回 300 円で、次は 4 回 400 円である', () => {
      const [first, second] = results;
      const pick = (r: Allowance[] | undefined) => rowOf(r ?? [], '太郎').lines[0];
      expect([pick(first)?.count, pick(first)?.amount]).toEqual([3, 300]);
      expect([pick(second)?.count, pick(second)?.amount]).toEqual([4, 400]);
    });
  });

  Scenario('取り消すと次に読んだときに元の回数と額に戻る', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 4 回ある', () => dishesTimes(4));
    When('管理者が読んだあとに 1 回が取り消されて、もう一度読む', async () => {
      await read();
      revert(dateOf(3), CHORES.dishes.choreTypeId);
      await read();
    });
    Then('最初は 4 回 400 円で、次は 3 回 300 円である', () => {
      const pick = (r: Allowance[] | undefined) => rowOf(r ?? [], '太郎').lines[0];
      expect([pick(results[0])?.count, pick(results[0])?.amount]).toEqual([4, 400]);
      expect([pick(results[1])?.count, pick(results[1])?.amount]).toEqual([3, 300]);
    });
  });

  Scenario('月の担当と種類は強い整合性で読む', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 2 回ある', () => dishesTimes(2));
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('月の担当の Query と種類の Query は強い整合性で読まれる', () => {
      const reads = w.world.hooks.readLog;
      const calendarReads = reads.filter((e) => e.table === CALENDAR_TABLE);
      const choreReads = reads.filter((e) => e.table === CHORE_TYPES_TABLE);
      expect(calendarReads.length).toBeGreaterThan(0);
      expect(choreReads.length).toBeGreaterThan(0);
      expect([...calendarReads, ...choreReads].every((e) => e.consistent)).toBe(true);
    });
  });

  Scenario('「未」と「×」は数えず「済」だけが数に入る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが「未」「×」「済」で 1 件ずつある', () => {
      w.other('todo', { date: dateOf(0) });
      w.other('skipped', { date: dateOf(1) });
      w.done({ date: dateOf(2) });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('太郎の内訳は「皿洗い 100 x 1 = 100」の 1 行だけである', () => {
      expect(taro().lines.map(lineText)).toEqual(['皿洗い 100 x 1 = 100']);
    });
  });

  Scenario('管理者が「済にする」した担当は担当の子供の額になる', ({ Given, When, Then }) => {
    Given('太郎の担当を管理者が記録した「済」がある', () => {
      w.done({ date: dateOf(0), recordedBy: PEOPLE.mother.userId });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('太郎の合計が 100 で、管理者の行はない', () => {
      expect(taro().total).toBe(100);
      expect(last().some((a) => a.childUserId === PEOPLE.mother.userId)).toBe(false);
    });
  });

  Scenario('花子の担当を次郎が引き受けて記録すると次郎の額になる', ({ Given, When, Then }) => {
    Given(
      '花子の担当を次郎が引き受けて担当の子供が次郎に変わり、次郎が記録した「済」がある',
      () => {
        w.done({ date: dateOf(0), child: 'jiro', recordedBy: CHILDREN.jiro.userId });
      },
    );
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('次郎の合計が 100 で、花子の合計は 0 である', () => {
      expect(rowOf(last(), '次郎').total).toBe(100);
      expect(rowOf(last(), '花子').total).toBe(0);
    });
  });

  Scenario('記録した人が担当の子供と違っても担当の子供の額になる', ({ Given, When, Then }) => {
    Given('花子の担当を次郎が記録した「済」がある', () => {
      w.done({ date: dateOf(0), child: 'hanako', recordedBy: CHILDREN.jiro.userId });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('花子の合計が 100 で、次郎の合計は 0 である', () => {
      expect(rowOf(last(), '花子').total).toBe(100);
      expect(rowOf(last(), '次郎').total).toBe(0);
    });
  });

  Scenario('種類の名前を変えても行は分かれず今の名前で出る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いの「済」が 3 回あり、そのあと種類の名前が「食器洗い」に変わった', () => {
      dishesTimes(3);
      const key = `${FAMILY_ID}#TYPE#${CHORES.dishes.choreTypeId}`;
      const item = w.world.choreTypes.get(key);
      if (!item) throw new Error('種類がありません');
      w.world.choreTypes.set(key, { ...item, name: '食器洗い' });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳は「食器洗い 100 x 3 = 300」の 1 行だけである', () => {
      expect(taro().lines.map(lineText)).toEqual(['食器洗い 100 x 3 = 300']);
    });
  });

  Scenario('「使わない」にした種類の過去の月の行が名前つきで残る', ({ Given, When, Then }) => {
    Given('太郎のお風呂洗い（使わない）の「済」が 2 回ある', () => {
      w.done({ date: dateOf(0), chore: 'bath' });
      w.done({ date: dateOf(1), chore: 'bath' });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳に「お風呂洗い 90 x 2 = 180」の行が残る', () => {
      expect(taro().lines.map(lineText)).toEqual(['お風呂洗い 90 x 2 = 180']);
    });
  });

  Scenario('行は種類の並び（使うを登録した順、続けて使わない）で並ぶ', ({ Given, When, Then }) => {
    Given('太郎のお風呂洗い・ゴミ出し・洗濯物たたみ・皿洗いの「済」が 1 回ずつある', () => {
      w.done({ date: dateOf(0), chore: 'bath' });
      w.done({ date: dateOf(1), chore: 'garbage' });
      w.done({ date: dateOf(2), chore: 'laundry' });
      w.done({ date: dateOf(3), chore: 'dishes' });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳は皿洗い、洗濯物たたみ、ゴミ出し、お風呂洗いの順である', () => {
      expect(taro().lines.map((l) => l.choreName)).toEqual([
        '皿洗い',
        '洗濯物たたみ',
        'ゴミ出し',
        'お風呂洗い',
      ]);
    });
  });

  Scenario('同じ種類の中では単価の低い順に並ぶ', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが 130 円で 1 回、100 円で 1 回、120 円で 1 回ある', () => {
      w.done({ date: dateOf(0), price: 130 });
      w.done({ date: dateOf(1), price: 100 });
      w.done({ date: dateOf(2), price: 120 });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('皿洗いの行は 100、120、130 の順である', () => {
      expect(taro().lines.map((l) => l.unitPrice)).toEqual([100, 120, 130]);
    });
  });

  Scenario('単価 0 円の「済」が 2 回あれば 0 円の行が出る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが単価 0 円で 2 回ある', () => dishesTimes(2, 0));
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('内訳に「皿洗い 0 x 2 = 0」の行があり合計は 0 である', () => {
      expect(taro().lines.map(lineText)).toEqual(['皿洗い 0 x 2 = 0']);
      expect(taro().total).toBe(0);
    });
  });

  Scenario('単価 0 円は異常ではなくログに残らない', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが単価 0 円で 2 回ある', () => dishesTimes(2, 0));
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('異常のログは 1 行もなく、計算のログは 1 件だけである', () => {
      expect(w.logs.lines.filter((l) => String(l.event).startsWith('ALLOWANCE_DUTY'))).toHaveLength(
        0,
      );
      expect(w.logs.lines.filter((l) => l.event === 'ALLOWANCE_CHORE_TYPE_MISSING')).toHaveLength(
        0,
      );
      expect(w.logs.rows('ALLOWANCE_COMPUTED')).toHaveLength(1);
      expect(w.logs.rows('ALLOWANCE_COMPUTED')[0]?.anomalyCount).toBe(0);
    });
  });

  Scenario('12 月 31 日の担当を 1 月 2 日に記録しても 12 月の額に入る', ({ Given, When, Then }) => {
    Given('12 月 31 日の太郎の皿洗いを 1 月 2 日に記録した「済」がある', () => {
      w.done({ date: '2026-12-31', recordedAt: '2027-01-02T01:00:00.000Z' });
    });
    When('管理者が 12 月のお小遣いと 1 月のお小遣いを読む', async () => {
      await read('2026-12');
      await read('2027-01');
    });
    Then('12 月の太郎は 100 円で、1 月の太郎は 0 円である', () => {
      expect(rowOf(results[0] ?? [], '太郎').total).toBe(100);
      expect(rowOf(results[1] ?? [], '太郎').total).toBe(0);
    });
  });

  Scenario(
    '1 月 31 日と 2 月 1 日の担当はそれぞれ 1 月と 2 月の額に入る',
    ({ Given, When, Then }) => {
      Given(
        '日本時間の 1 月 31 日 23 時 59 分と 2 月 1 日 0 時 0 分に、その日の担当を記録した「済」がある',
        () => {
          w.done({ date: '2027-01-31', recordedAt: '2027-01-31T14:59:00.000Z' });
          w.done({ date: '2027-02-01', recordedAt: '2027-01-31T15:00:00.000Z' });
        },
      );
      When('管理者が 1 月のお小遣いと 2 月のお小遣いを読む', async () => {
        await read('2027-01');
        await read('2027-02');
      });
      Then('1 月の太郎は 100 円で、2 月の太郎も 100 円である', () => {
        expect(rowOf(results[0] ?? [], '太郎').total).toBe(100);
        expect(rowOf(results[1] ?? [], '太郎').total).toBe(100);
      });
    },
  );

  Scenario('別の月の「済」は数えない', ({ Given, When, Then }) => {
    Given('太郎の 12 月と 1 月と 2 月に皿洗いの「済」が 1 回ずつある', () => {
      w.done({ date: '2026-12-10' });
      w.done({ date: '2027-01-10' });
      w.done({ date: '2027-02-10' });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('太郎の 1 月の合計は 100 である', () => {
      expect(taro().total).toBe(100);
    });
  });

  Scenario('ほかの家族の担当は数えない', ({ Given, When, Then }) => {
    Given('ほかの家族の子供の「済」の担当が同じ月にある', () => {
      w.done({ date: dateOf(0) });
      seedDone(w.world.calendar, {
        dutyId: fakeU9DutyId(900),
        date: dateOf(5),
        childUserId: CHILDREN.taro.userId,
        familyId: 'fam-other',
      });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('山田家の太郎の合計に入らず、行も増えない', () => {
      expect(taro().total).toBe(100);
      expect(last().map((a) => a.displayName)).toEqual(['太郎', '花子', '次郎']);
    });
  });

  Scenario(
    '同じ読み取りを 2 回繰り返しても間に記録がなければ同じ答えになる',
    ({ Given, When, Then }) => {
      Given('太郎の 1 月に皿洗いの「済」が 3 回ある', () => dishesTimes(3));
      When('管理者が 1 月のお小遣いを 2 回続けて読む', async () => {
        await read();
        await read();
      });
      Then('2 回の答えは完全に同じである', () => {
        expect(results[1]).toEqual(results[0]);
      });
    },
  );

  Scenario('確定している月でも額は確定前と同じである', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 3 回あり、1 月はまだ確定していない', () => {
      dishesTimes(3);
    });
    When('管理者が確定前と確定後に 1 月のお小遣いを読む', async () => {
      await read();
      seedMonthState(w.world.calendar, { month: MONTH, confirmed: true });
      await read();
    });
    Then('2 回の答えの額と内訳は同じで、月の確定は真と読める', () => {
      expect(results[1]).toEqual(results[0]);
      const state = w.world.calendar.get(calendarKey(`M#${MONTH}#S`));
      expect(state?.confirmed).toBe(true);
    });
  });

  Scenario('子供ごとの合計が子供ごとに分かれる', ({ Given, When, Then }) => {
    Given('太郎に皿洗い 2 回、花子に洗濯物たたみ 1 回、次郎にゴミ出し 3 回の「済」がある', () => {
      for (let i = 0; i < 2; i++) w.done({ date: dateOf(i), child: 'taro', chore: 'dishes' });
      w.done({ date: dateOf(3), child: 'hanako', chore: 'laundry' });
      for (let i = 0; i < 3; i++) w.done({ date: dateOf(i + 5), child: 'jiro', chore: 'garbage' });
    });
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then('太郎は 200、花子は 150、次郎は 150 である', () => {
      expect(last().map((a) => a.total)).toEqual([200, 150, 150]);
    });
  });

  Scenario('書き込みの命令は 1 回も呼ばれない', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 3 回ある', () => dishesTimes(3));
    When('管理者が 1 月のお小遣いを読む', readOnce);
    Then(
      'PutItem・UpdateItem・DeleteItem・TransactWriteItems・BatchWriteItem は 0 回である',
      () => {
        expect(totalWrites(w.world)).toBe(0);
        expect(readCount(w.world)).toBeGreaterThan(0);
      },
    );
  });

  Scenario('fetch は 1 回も呼ばれない', ({ Given, When, Then }) => {
    Given('太郎の 1 月に皿洗いの「済」が 3 回ある', () => dishesTimes(3));
    When('fetch を見張りながら管理者が 1 月のお小遣いを読む', readOnce);
    Then('fetch は 0 回である', () => {
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  Scenario('管理者でなく子供が読んでも家族の全員分が同じに返る', ({ Given, When, Then }) => {
    Given('太郎の皿洗いが 2 回、花子の皿洗いが 1 回ある', () => {
      w.done({ date: dateOf(0), child: 'taro' });
      w.done({ date: dateOf(1), child: 'taro' });
      w.done({ date: dateOf(2), child: 'hanako' });
    });
    When('太郎の文脈で 1 月のお小遣いを読む', async () => {
      await read(MONTH, asRead(ctxAdmin()));
      await read(MONTH, asRead(ctxChild('taro')));
    });
    Then('管理者が読んだ答えと同じで、太郎・花子・次郎の 3 行が返る', () => {
      expect(results[1]).toEqual(results[0]);
      expect(results[1]?.map((a) => a.displayName)).toEqual(['太郎', '花子', '次郎']);
    });
  });
});
