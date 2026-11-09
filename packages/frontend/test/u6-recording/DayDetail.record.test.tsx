import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarChild, Duty } from '@housework/shared';
import { ThemeProvider } from '@mui/material/styles';
import { DayDetail } from '../../src/pages/DayDetail';
import { recordDuty } from '../../src/api/client';
import { theme } from '../../src/theme';
import type { Authorized } from '../../src/hooks/useSession';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_DUTY_ID_1,
  FAKE_SESSION_TOKEN,
} from '../fixtures/fakeSecrets';

vi.mock('../../src/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/client')>()),
  recordDuty: vi.fn(),
}));

const recordDutyMock = vi.mocked(recordDuty);

const KIDS: CalendarChild[] = [
  { userId: FAKE_CHILD_USER_ID_1, displayName: '太郎' },
  { userId: FAKE_CHILD_USER_ID_2, displayName: '次郎' },
];

const authorized: Authorized = (call) => call(FAKE_SESSION_TOKEN);

const TODAY = '2026-11-10';

const makeDuty = (over: Partial<Duty> = {}): Duty => ({
  dutyId: FAKE_DUTY_ID_1,
  date: TODAY,
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  choreName: '皿洗い',
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 3,
  recordedAt: null,
  recordedBy: null,
  recordedByName: null,
  unitPrice: null,
  ...over,
});

function renderDetail(duty: Duty, over: { isAdmin?: boolean; currentUserId?: string } = {}) {
  const onChanged = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <DayDetail
        date={TODAY}
        duties={[duty]}
        children={KIDS}
        isAdmin={over.isAdmin ?? false}
        authorized={authorized}
        currentUserId={over.currentUserId ?? FAKE_CHILD_USER_ID_1}
        confirmed={false}
        today={TODAY}
        onChanged={onChanged}
        onRefresh={onRefresh}
        onClose={vi.fn()}
      />
    </ThemeProvider>,
  );
  return { onChanged, onRefresh };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DayDetail の「やった」（U6）', () => {
  it('自分の「未」の今日の担当に「やった」ボタンが出る', () => {
    renderDetail(makeDuty());
    expect(screen.getByTestId('record-button')).toBeInTheDocument();
  });

  it('「やった」→「記録する」で version つきの記録を送り、onChanged と読み直しを呼ぶ', async () => {
    const recorded = makeDuty({ status: 'done', version: 4 });
    recordDutyMock.mockResolvedValue(recorded);
    const { onChanged, onRefresh } = renderDetail(makeDuty());

    fireEvent.click(screen.getByTestId('record-button'));
    fireEvent.click(await screen.findByTestId('record-confirm-button'));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(recorded));
    expect(recordDutyMock).toHaveBeenCalledWith(FAKE_SESSION_TOKEN, FAKE_DUTY_ID_1, { version: 3 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('明日以降の担当には理由が出てボタンは出ない', () => {
    renderDetail(makeDuty({ date: '2026-11-20' }));
    expect(screen.getByTestId('record-reason')).toHaveTextContent(
      'まだ来ていない日の担当は記録できません',
    );
    expect(screen.queryByTestId('record-button')).toBeNull();
  });

  it('「×」の担当には理由が出る', () => {
    renderDetail(makeDuty({ status: 'skipped' }));
    expect(screen.getByTestId('record-reason')).toHaveTextContent(
      'お母さんが『やらなかった』にしています',
    );
  });

  it('管理者にはボタンも理由も出ない', () => {
    renderDetail(makeDuty(), { isAdmin: true });
    expect(screen.queryByTestId('record-button')).toBeNull();
    expect(screen.queryByTestId('record-reason')).toBeNull();
  });

  it('ほかの子供の担当にはボタンも理由も出ない', () => {
    renderDetail(makeDuty({ childUserId: FAKE_CHILD_USER_ID_2 }));
    expect(screen.queryByTestId('record-button')).toBeNull();
    expect(screen.queryByTestId('record-reason')).toBeNull();
  });

  it('記録が 409 のときは理由を出し、読み直す', async () => {
    const { ApiFailure } = await import('../../src/api/client');
    recordDutyMock.mockRejectedValue(new ApiFailure(409, 'DUTY_CHANGED'));
    const { onRefresh } = renderDetail(makeDuty());

    fireEvent.click(screen.getByTestId('record-button'));
    fireEvent.click(await screen.findByTestId('record-confirm-button'));

    expect(await screen.findByTestId('record-error')).toHaveTextContent(
      'この担当は先に変更されました',
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});
