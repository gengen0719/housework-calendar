import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import type { AllowanceMonthView } from '@housework/shared';
import { expect, vi } from 'vitest';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { CALENDAR_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { FAKE_U9_OUTSIDER_USER_ID } from '../fixtures/fakeSecrets';
import { seedMonthState } from './helpers/seed';
import {
  CHILDREN,
  PEOPLE,
  setupAllowanceWorld,
  type AllowanceWorld,
} from './helpers/allowanceWorld';
import { setNow, resetNow, JST_MONTH_BOUNDARY_ISO, JST_BEFORE_BOUNDARY_ISO } from './helpers/clock';
import { callAs, callAnonymous, callAsUserId, bodyOf } from './helpers/session';
import { totalWrites } from './helpers/writeGuard';

const feature = await loadFeature('packages/backend/test/u9-allowance/allowance-api.feature');

const ALLOWANCES_PATH = (month: string) => `/v1/months/${month}/allowances`;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let w: AllowanceWorld;
  let response: APIGatewayProxyStructuredResultV2;
  let fetchSpy: ReturnType<typeof vi.fn>;

  BeforeEachScenario(() => {
    w = setupAllowanceWorld();
    fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);
  });
  AfterEachScenario(() => {
    w.world.mock.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetNow();
  });

  const calendarReadCount = (): number =>
    w.world.hooks.readLog.filter(
      (e) => e.table === CALENDAR_TABLE && (e.operation === 'Get' || e.operation === 'Query'),
    ).length;

  // ─── Scenario: セッションなしは 401 ───
  Scenario('セッションなしは 401', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('セッションなしで GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      response = await callAnonymous('GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 401 で、DynamoDB の月の読み取りは 0 回', () => {
      expect(response.statusCode).toBe(401);
      expect(calendarReadCount()).toBe(0);
    });
  });

  // ─── Scenario: ブロック中 ───
  Scenario('ブロック中（友だち解除）は 403 NOT_FRIEND', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('ブロック中の利用者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      // ブロック中の利用者は Users に friendStatus: blocked で登録されている（母親の状態を上書き）
      const item = w.world.users.get(PEOPLE.mother.userId);
      if (item) w.world.users.set(PEOPLE.mother.userId, { ...item, friendStatus: 'blocked' });
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 403 NOT_FRIEND で、DynamoDB の月の読み取りは 0 回', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toMatchObject({ error: { reason: 'NOT_FRIEND' } });
      expect(calendarReadCount()).toBe(0);
    });
  });

  // ─── Scenario: 家族のメンバーでない ───
  Scenario('家族のメンバーでない人は 403 NOT_FAMILY_MEMBER', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('メンバーでない利用者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      // メンバーでない利用者：Users にはいるが家族に入っていない
      w.world.users.set(FAKE_U9_OUTSIDER_USER_ID, {
        userId: FAKE_U9_OUTSIDER_USER_ID,
        lineUserId: 'U_outsider_u9',
        displayName: 'よそ者',
        friendStatus: 'friend',
        registeredAt: '2026-11-01T00:00:00.000Z',
        friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
      });
      response = await callAsUserId(FAKE_U9_OUTSIDER_USER_ID, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 403 NOT_FAMILY_MEMBER で、DynamoDB の月の読み取りは 0 回', () => {
      expect(response.statusCode).toBe(403);
      expect(bodyOf(response)).toMatchObject({ error: { reason: 'NOT_FAMILY_MEMBER' } });
      expect(calendarReadCount()).toBe(0);
    });
  });

  // ─── Scenario: 月が不正（2027-13）───
  Scenario('月が不正（2027-13）は 422 INVALID_MONTH', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/2027-13/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-13'));
    });
    Then('応答は 422 INVALID_MONTH で、DynamoDB の月の読み取りは 0 回', () => {
      expect(response.statusCode).toBe(422);
      expect(bodyOf(response)).toMatchObject({ error: { reason: 'INVALID_MONTH' } });
      expect(calendarReadCount()).toBe(0);
    });
  });

  // ─── Scenario: 月が不正（abc）───
  Scenario('月が不正（abc）は 422 INVALID_MONTH', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/abc/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('abc'));
    });
    Then('応答は 422 INVALID_MONTH', () => {
      expect(response.statusCode).toBe(422);
      expect(bodyOf(response)).toMatchObject({ error: { reason: 'INVALID_MONTH' } });
    });
  });

  // ─── Scenario: 月が不正（2027-1）───
  Scenario('月が不正（2027-1）は 422 INVALID_MONTH（ゼロ埋めなし）', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/2027-1/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-1'));
    });
    Then('応答は 422 INVALID_MONTH', () => {
      expect(response.statusCode).toBe(422);
    });
  });

  // ─── Scenario: Current ───
  Scenario('月が不正（Current）は 422 INVALID_MONTH（大文字違い）', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/Current/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('Current'));
    });
    Then('応答は 422 INVALID_MONTH', () => {
      expect(response.statusCode).toBe(422);
    });
  });

  // ─── Scenario: current 末尾の空白 ───
  Scenario('月が不正（current 末尾の空白あり）は 422 INVALID_MONTH', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/current%20/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('current '));
    });
    Then('応答は 422 INVALID_MONTH', () => {
      expect(response.statusCode).toBe(422);
    });
  });

  // ─── Scenario: セッションなしで月が不正でも 401 ───
  Scenario('セッションなしで月が不正でも 401（確かめの順番）', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('セッションなしで GET /v1/months/2027-99/allowances を呼ぶ', async () => {
      response = await callAnonymous('GET', ALLOWANCES_PATH('2027-99'));
    });
    Then('応答は 401', () => {
      expect(response.statusCode).toBe(401);
    });
  });

  // ─── Scenario: 管理者は 200 で家族全員の額が返る ───
  Scenario('管理者は 200 で家族全員の額が返る（S20・S21）', ({ Given, When, Then }) => {
    Given(
      '山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 8 回・風呂掃除 150 円が 4 回の「済」がある',
      () => {
        for (let i = 0; i < 8; i++) {
          w.done({ date: `2027-01-${String(i + 1).padStart(2, '0')}`, chore: 'dishes' });
        }
        for (let i = 0; i < 4; i++) {
          w.done({
            date: `2027-01-${String(i + 10).padStart(2, '0')}`,
            chore: 'laundry',
            price: 150,
            child: 'taro',
          });
        }
      },
    );
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then(
      '応答は 200 AllowanceMonthView で、太郎の合計は 1400 で次郎の合計は 0 で管理者の行はない',
      () => {
        expect(response.statusCode).toBe(200);
        const body = bodyOf<AllowanceMonthView>(response);
        const taro = body.allowances.find((a) => a.displayName === CHILDREN.taro.displayName);
        const jiro = body.allowances.find((a) => a.displayName === CHILDREN.jiro.displayName);
        const admin = body.allowances.find((a) => a.displayName === PEOPLE.mother.displayName);
        expect(taro?.total).toBe(1400);
        expect(jiro?.total).toBe(0);
        expect(admin).toBeUndefined();
        // 管理者の行がないことも確認
        expect(body.allowances.every((a) => a.childUserId !== PEOPLE.mother.userId)).toBe(true);
      },
    );
  });

  // ─── Scenario: 子供も 200 ───
  Scenario('子供も 200 で家族全員の額が返る（S20）', ({ Given, When, Then }) => {
    Given(
      '山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 8 回・風呂掃除 150 円が 4 回の「済」がある',
      () => {
        for (let i = 0; i < 8; i++) {
          w.done({ date: `2027-01-${String(i + 1).padStart(2, '0')}`, chore: 'dishes' });
        }
        for (let i = 0; i < 4; i++) {
          w.done({
            date: `2027-01-${String(i + 10).padStart(2, '0')}`,
            chore: 'laundry',
            price: 150,
            child: 'taro',
          });
        }
      },
    );
    When('子供の太郎で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('taro', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 AllowanceMonthView で、太郎の合計は 1400', () => {
      expect(response.statusCode).toBe(200);
      const body = bodyOf<AllowanceMonthView>(response);
      const taro = body.allowances.find((a) => a.displayName === CHILDREN.taro.displayName);
      expect(taro?.total).toBe(1400);
    });
  });

  // ─── Scenario: current → JST 月末（UTC 14:59）───
  Scenario(
    'month=current は日本時間の今日の月として扱う（S35。UTC 14:59 JST 23:59）',
    ({ Given, When, Then }) => {
      Given('山田家が初期化されていて、今が UTC 2027-01-31T14:59:59Z', () => {
        setNow(JST_BEFORE_BOUNDARY_ISO);
      });
      When('管理者で GET /v1/months/current/allowances を呼ぶ', async () => {
        response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('current'));
      });
      Then('応答は 200 で month は 2027-01 で today は 2027-01-31', () => {
        expect(response.statusCode).toBe(200);
        const body = bodyOf<AllowanceMonthView>(response);
        expect(body.month).toBe('2027-01');
        expect(body.today).toBe('2027-01-31');
      });
    },
  );

  // ─── Scenario: current → JST 翌月（UTC 15:00）───
  Scenario(
    'month=current は日本時間の今日の月として扱う（S35。UTC 15:00 JST 翌日0:00）',
    ({ Given, When, Then }) => {
      Given('山田家が初期化されていて、今が UTC 2027-01-31T15:00:00Z', () => {
        setNow(JST_MONTH_BOUNDARY_ISO);
      });
      When('管理者で GET /v1/months/current/allowances を呼ぶ', async () => {
        response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('current'));
      });
      Then('応答は 200 で month は 2027-02 で today は 2027-02-01', () => {
        expect(response.statusCode).toBe(200);
        const body = bodyOf<AllowanceMonthView>(response);
        expect(body.month).toBe('2027-02');
        expect(body.today).toBe('2027-02-01');
      });
    },
  );

  // ─── Scenario: current → now を 1 回 ───
  Scenario('month=current は端末の時計を使わない（now を 1 回取る）', ({ Given, When, Then }) => {
    Given('山田家が初期化されていて、今が UTC 2027-01-20T10:00:00Z', () => {
      setNow('2027-01-20T10:00:00.000Z');
    });
    When('管理者で GET /v1/months/current/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('current'));
    });
    Then('応答は 200 で month は 2027-01', () => {
      expect(response.statusCode).toBe(200);
      const body = bodyOf<AllowanceMonthView>(response);
      expect(body.month).toBe('2027-01');
    });
  });

  // ─── Scenario: confirmed が true ───
  Scenario('確定している月は confirmed が true（S24）', ({ Given, When, Then }) => {
    Given('山田家が初期化されて、2027-01 が確定している', () => {
      seedMonthState(w.world.calendar, { month: '2027-01', confirmed: true });
    });
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 で confirmed は true', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<AllowanceMonthView>(response).confirmed).toBe(true);
    });
  });

  // ─── Scenario: confirmed が false ───
  Scenario('確定していない月は confirmed が false（S25）', ({ Given, When, Then }) => {
    Given('山田家が初期化されて、2027-01 が確定していない', () => {
      seedMonthState(w.world.calendar, { month: '2027-01', confirmed: false });
    });
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 で confirmed は false', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<AllowanceMonthView>(response).confirmed).toBe(false);
    });
  });

  // ─── Scenario: 月の状態の行がない月 ───
  Scenario('月の状態の行がない月は confirmed が false', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 で confirmed は false', () => {
      expect(response.statusCode).toBe(200);
      expect(bodyOf<AllowanceMonthView>(response).confirmed).toBe(false);
    });
  });

  // ─── Scenario: firstMonth・lastMonth ───
  Scenario('範囲（firstMonth・lastMonth）が答えに入る（S26）', ({ Given, When, Then }) => {
    Given(
      '山田家が初期化されていて家族の作成時刻が UTC 2026-11-01T00:00:00Z で今が UTC 2027-01-20T10:00:00Z',
      () => {
        // 家族の作成時刻はデフォルト（2026-11-01）のまま
        setNow('2027-01-20T10:00:00.000Z');
      },
    );
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 で firstMonth は 2026-11 で lastMonth は 2027-02', () => {
      expect(response.statusCode).toBe(200);
      const body = bodyOf<AllowanceMonthView>(response);
      expect(body.firstMonth).toBe('2026-11');
      expect(body.lastMonth).toBe('2027-02');
    });
  });

  // ─── Scenario: 成功の 200 に no-store ───
  Scenario('成功の 200 に cache-control: no-store が付く（NFR4.92）', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 200 でヘッダーに cache-control: no-store が付く', () => {
      expect(response.statusCode).toBe(200);
      const headers = response.headers as Record<string, string> | undefined;
      expect(headers?.['cache-control']).toBe('no-store');
    });
  });

  // ─── Scenario: エラーに no-store が付かない ───
  Scenario('エラーの応答には cache-control が付かない', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('セッションなしで GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      response = await callAnonymous('GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 401 で cache-control ヘッダーがない', () => {
      expect(response.statusCode).toBe(401);
      const headers = response.headers as Record<string, string> | undefined;
      expect(headers?.['cache-control']).toBeUndefined();
    });
  });

  // ─── Scenario: 項目名の完全一致 ───
  Scenario('応答の JSON 項目名が許可した一覧と完全一致（NFR4.91）', ({ Given, When, Then }) => {
    Given('山田家が初期化されて、太郎の 2027-01 の皿洗い 100 円が 1 回の「済」がある', () => {
      w.done({ date: '2027-01-06', chore: 'dishes' });
    });
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答の AllowanceMonthView の項目名が許可した一覧と完全一致する', () => {
      expect(response.statusCode).toBe(200);
      const body = bodyOf<AllowanceMonthView>(response);
      // AllowanceMonthView の項目
      const viewKeys = Object.keys(body).sort();
      expect(viewKeys).toEqual(
        ['allowances', 'confirmed', 'firstMonth', 'lastMonth', 'month', 'today'].sort(),
      );
      // Allowance の項目（管理者・LINE の ID・家族 ID が入らない）
      const allowanceKeys = Object.keys(body.allowances[0] ?? {}).sort();
      expect(allowanceKeys).toEqual(
        ['adjustments', 'childUserId', 'current', 'displayName', 'lines', 'month', 'total'].sort(),
      );
      // 管理者・LINE のユーザー ID・家族 ID が含まれない
      expect(viewKeys).not.toContain('familyId');
      expect(viewKeys).not.toContain('lineUserId');
      expect(viewKeys).not.toContain('role');
    });
  });

  // ─── Scenario: 500 ───
  Scenario('読み取りが失敗すると 500 INTERNAL（S31）', ({ Given, When, Then }) => {
    Given('山田家が初期化されて、Calendar の読み取りが失敗する', () => {
      w.world.hooks.failRead(CALENDAR_TABLE, 'Query');
    });
    When('管理者で GET /v1/months/2027-01/allowances を呼ぶ', async () => {
      setNow('2027-01-20T03:00:00.000Z');
      response = await callAs('mother', {}, 'GET', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 500 INTERNAL で本文に名前や金額が入らない', () => {
      expect(response.statusCode).toBe(500);
      expect(bodyOf(response)).toMatchObject({ error: { reason: 'INTERNAL' } });
      // 名前・金額が含まれないことを確認（本文は決まった文で、名前・金額を含まない）
      const bodyText = JSON.stringify(bodyOf(response));
      expect(bodyText).not.toContain('太郎');
      expect(bodyText).not.toContain('1400');
      // 書き込みが 0 回
      expect(totalWrites(w.world)).toBe(0);
    });
  });

  // ─── Scenario: PUT は 404 ───
  Scenario('PUT allowances は 404（書き込みの入口がない）', ({ Given, When, Then }) => {
    Given('山田家が初期化されている', () => {});
    When('管理者で PUT /v1/months/2027-01/allowances を呼ぶ', async () => {
      response = await callAs('mother', {}, 'PUT', ALLOWANCES_PATH('2027-01'));
    });
    Then('応答は 404', () => {
      expect(response.statusCode).toBe(404);
    });
  });
});
