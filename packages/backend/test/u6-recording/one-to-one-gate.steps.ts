import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect, vi } from 'vitest';
import { handleRecord } from '../../src/handlers/line/recordHandler';
import type { LineEvent } from '../../src/handlers/line/types';
import { CALENDAR_TABLE, CHORE_TYPES_TABLE } from '../u1-skeleton-family/helpers/fakeDynamo';
import { setupWorld, stubLineFetch, type FetchCall } from '../u1-skeleton-family/helpers/world';
import { FAMILY_ID, FAMILY_NAME } from '../u2-invitation/helpers/seed';
import { CHILDREN, CHORES, seedHousehold } from './helpers/seed';
import { FAKE_OUTSIDER_LINE_ID, FAKE_UNKNOWN_LINE_ID } from '../fixtures/fakeSecrets';
import { recordListPostback } from './helpers/events';

const feature = await loadFeature('packages/backend/test/u6-recording/one-to-one-gate.feature');

type World = ReturnType<typeof setupWorld>;
const asEvent = (e: unknown): LineEvent => e as LineEvent;

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let world: World;
  let lineStub: { calls: FetchCall[]; replies: () => FetchCall[] };
  let event: LineEvent;

  BeforeEachScenario(() => {
    world = setupWorld();
    process.env.ENTRY = 'line';
    lineStub = stubLineFetch();
  });
  AfterEachScenario(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const household = (): void => {
    seedHousehold(world);
  };
  const outsiderUser = (): void => {
    // 友だちだが家族に入っていない利用者
    world.users.set('user-lonely', {
      userId: 'user-lonely',
      lineUserId: FAKE_OUTSIDER_LINE_ID,
      displayName: 'ひとり',
      friendStatus: 'friend',
      registeredAt: '2026-11-01T00:00:00.000Z',
      friendStatusChangedAt: '2026-11-01T00:00:00.000Z',
    });
  };
  const blockTaro = (): void => {
    const taro = world.users.get(CHILDREN.taro.userId);
    world.users.set(CHILDREN.taro.userId, { ...taro, friendStatus: 'blocked' });
  };

  const calendarReads = (): number =>
    world.hooks.readLog.filter(
      (entry) => entry.table === CALENDAR_TABLE || entry.table === CHORE_TYPES_TABLE,
    ).length;

  const run = async (): Promise<void> => {
    await handleRecord(event, new Date('2027-01-07T07:00:00.000Z'));
  };

  const replyMessages = (): string => JSON.stringify(lineStub.replies().map((c) => c.body));

  Scenario('友だちで家族に入っている子供は記録に進む', ({ Given, When, Then, And }) => {
    Given('山田家がいて、太郎が「やった」を押す', () => {
      household();
      event = asEvent(recordListPostback('g1', { lineUserId: 'U_taro' }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('案内の返事は返らない', () => {
      // 子供は記録に進むので、管理者・家族外への決まった案内は返さない
      const body = replyMessages();
      expect(body).not.toContain(
        'お手伝いの記録は子供のメニューです。記録の修正は画面からできます',
      );
      expect(body).not.toContain('先に家族に参加してください');
    });
    And('記録に進む', () => {
      // 今日の担当は置いていないので、子供には「今日記録できる担当はありません」が返る（案内ではなく記録の返事）
      expect(replyMessages()).toContain('今日記録できる担当はありません');
    });
  });

  Scenario('管理者には記録のメニューの案内だけを本人に返す', ({ Given, When, Then, And }) => {
    Given('山田家がいて、お母さんが「やった」を押す', () => {
      household();
      event = asEvent(recordListPostback('g2', { lineUserId: 'U_mother' }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then(
      '本人に「お手伝いの記録は子供のメニューです。記録の修正は画面からできます」だけを返す',
      () => {
        expect(lineStub.replies()).toHaveLength(1);
        expect(replyMessages()).toContain(
          'お手伝いの記録は子供のメニューです。記録の修正は画面からできます',
        );
      },
    );
    And('Calendar と ChoreTypes の読み書きが 0 回である', () => {
      expect(calendarReads()).toBe(0);
    });
  });

  Scenario('家族に入っていない人には参加の案内だけを返す', ({ Given, When, Then, And }) => {
    Given('山田家がいて、家族に入っていない人が「やった」を押す', () => {
      household();
      outsiderUser();
      event = asEvent(recordListPostback('g3', { lineUserId: FAKE_OUTSIDER_LINE_ID }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('本人に「先に家族に参加してください」だけを返す', () => {
      expect(lineStub.replies()).toHaveLength(1);
      expect(replyMessages()).toContain('先に家族に参加してください');
    });
    And('Calendar と ChoreTypes の読み書きが 0 回である', () => {
      expect(calendarReads()).toBe(0);
    });
  });

  Scenario('利用者の記録がない人には参加の案内を返す', ({ Given, When, Then }) => {
    Given('山田家がいて、どの利用者の記録にもない人が「やった」を押す', () => {
      household();
      event = asEvent(recordListPostback('g4', { lineUserId: FAKE_UNKNOWN_LINE_ID }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('本人に「先に家族に参加してください」だけを返す', () => {
      expect(lineStub.replies()).toHaveLength(1);
      expect(replyMessages()).toContain('先に家族に参加してください');
    });
  });

  Scenario('ブロック中の人には参加の案内を返す', ({ Given, When, Then }) => {
    Given('山田家がいて、ブロック中の子供が「やった」を押す', () => {
      household();
      blockTaro();
      event = asEvent(recordListPostback('g5', { lineUserId: 'U_taro' }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('本人に「先に家族に参加してください」だけを返す', () => {
      expect(lineStub.replies()).toHaveLength(1);
      expect(replyMessages()).toContain('先に家族に参加してください');
    });
  });

  Scenario('source.userId がないイベントには参加の案内を返す', ({ Given, When, Then }) => {
    Given('山田家がいて、source.userId のないイベントで「やった」が押される', () => {
      household();
      event = asEvent(recordListPostback('g6', { lineUserId: undefined }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('本人に「先に家族に参加してください」だけを返す', () => {
      expect(lineStub.replies()).toHaveLength(1);
      expect(replyMessages()).toContain('先に家族に参加してください');
    });
  });

  Scenario('案内の返事に家族の名前・担当・種類の名前を入れない', ({ Given, When, Then }) => {
    Given('山田家がいて、お母さんが「やった」を押す', () => {
      household();
      event = asEvent(recordListPostback('g7', { lineUserId: 'U_mother' }));
    });
    When('1 対 1 の入口を通す', async () => {
      await run();
    });
    Then('返事に家族の名前・担当・種類の名前が含まれない', () => {
      const body = replyMessages();
      expect(body).not.toContain(FAMILY_NAME);
      expect(body).not.toContain(CHORES.dishes.name);
      expect(body).not.toContain(FAMILY_ID);
    });
  });

  Scenario(
    '案内の LINE 呼び出しは reply だけ・1 回（push・multicast・broadcast なし）',
    ({ Given, When, Then }) => {
      Given('山田家がいて、お母さんが「やった」を押す', () => {
        household();
        event = asEvent(recordListPostback('g8', { lineUserId: 'U_mother' }));
      });
      When('1 対 1 の入口を通す', async () => {
        await run();
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
    },
  );
});
