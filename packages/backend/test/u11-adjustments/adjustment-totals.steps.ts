import { randomUUID } from 'node:crypto';
import { describeFeature, loadFeature } from '@amiceli/vitest-cucumber';
import { expect } from 'vitest';
import { setup, create, validInput, request, bodyOf } from './helpers/world';
import { endScenario } from '../u5-assignment-calendar/helpers/scenario';
import { seedDuty, CHORES, FAMILY_ID } from '../u5-assignment-calendar/helpers/seed';
import { prepareContent } from '../../src/services/notificationMessages';
const feature = await loadFeature(
  'packages/backend/test/u11-adjustments/adjustment-totals.feature',
);
let total: number;
let text: string | undefined;
describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let state: ReturnType<typeof setup>;
  BeforeEachScenario(() => {
    state = setup();
  });
  AfterEachScenario(endScenario);
  const read = async () => {
    total = bodyOf(await request('GET', '/v1/months/2027-01/allowances')).allowances.find(
      (r: { childUserId: string }) => r.childUserId === validInput().childUserId,
    ).total;
  };
  Scenario('既存のお小遣いと同じ調整を集計する', ({ Given, When, Then }) => {
    Given('800円のお手伝いと600円の加算と200円の減額がある', async () => {
      seedDuty(state.world.calendar, {
        dutyId: randomUUID(),
        date: '2027-01-13',
        choreTypeId: CHORES.dishes.choreTypeId,
        childUserId: validInput().childUserId,
        status: 'done',
        unitPrice: 800,
      });
      await create({ ...validInput(), amount: 600 });
      await create({ ...validInput(), kind: 'subtract', amount: 200 });
    });
    When('お小遣いと月末まとめを組み立てる', async () => {
      await read();
      text = (
        await prepareContent(
          { familyId: FAMILY_ID, role: 'system' },
          'monthlySummary',
          '2027-01-31',
        )
      ).text;
    });
    Then('どちらも1200円になる', () => {
      expect(total).toBe(1200);
      expect(text).toContain('1,200円');
    });
  });
  Scenario('負の合計をそのまま表示する', ({ Given, When, Then }) => {
    Given('100円の加算と300円の減額だけがある', async () => {
      await create({ ...validInput(), amount: 100 });
      await create({ ...validInput(), kind: 'subtract', amount: 300 });
    });
    When('お小遣いを読む', read);
    Then('合計はマイナス200円になる', () => {
      expect(total).toBe(-200);
    });
  });
});
