import type { AllowanceMonthView } from '@housework/shared';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
  FAKE_SESSION_TOKEN,
} from '../../fixtures/fakeSecrets';
import type { Authorized } from '../../../src/hooks/useSession';

export const authorized: Authorized = (call) => call(FAKE_SESSION_TOKEN);
export function view(over: Partial<AllowanceMonthView> = {}): AllowanceMonthView {
  return {
    month: '2027-01',
    today: '2027-01-20',
    firstMonth: '2026-11',
    lastMonth: '2027-02',
    confirmed: false,
    allowances: [
      {
        childUserId: FAKE_CHILD_USER_ID_1,
        displayName: '太郎',
        current: true,
        month: '2027-01',
        total: 1400,
        lines: [
          {
            choreTypeId: FAKE_CHORE_TYPE_ID_1,
            choreName: '皿洗い',
            unitPrice: 100,
            count: 8,
            amount: 800,
          },
          {
            choreTypeId: FAKE_CHORE_TYPE_ID_2,
            choreName: '風呂掃除',
            unitPrice: 150,
            count: 4,
            amount: 600,
          },
        ],
        adjustments: [],
      },
      {
        childUserId: FAKE_CHILD_USER_ID_2,
        displayName: '次郎',
        current: true,
        month: '2027-01',
        total: 0,
        lines: [],
        adjustments: [],
      },
    ],
    ...over,
  };
}
