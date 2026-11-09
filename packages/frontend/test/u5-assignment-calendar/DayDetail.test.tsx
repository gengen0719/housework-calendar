import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES, NO_DUTY_LABEL, type CalendarChild, type Duty } from '@housework/shared';
import { DayDetail } from '../../src/pages/DayDetail';
import { ApiFailure, changeDutyChild } from '../../src/api/client';
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
  changeDutyChild: vi.fn(),
}));

const KIDS: CalendarChild[] = [
  { userId: FAKE_CHILD_USER_ID_1, displayName: '太郎' },
  { userId: FAKE_CHILD_USER_ID_2, displayName: '次郎' },
];

const authorized: Authorized = (call) => call(FAKE_SESSION_TOKEN);

const makeDuty = (over: Partial<Duty> = {}): Duty => ({
  dutyId: FAKE_DUTY_ID_1,
  date: '2026-11-10',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  choreName: '皿洗い',
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'todo',
  origin: 'rule',
  version: 1,
  recordedAt: null,
  recordedBy: null,
  recordedByName: null,
  unitPrice: null,
  ...over,
});

function renderDetail(duties: Duty[], isAdmin = true) {
  const onChanged = vi.fn();
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(
    <DayDetail
      date="2026-11-10"
      duties={duties}
      children={KIDS}
      isAdmin={isAdmin}
      authorized={authorized}
      onChanged={onChanged}
      onRefresh={onRefresh}
      onClose={onClose}
    />,
  );
  return { onChanged, onRefresh, onClose };
}

async function startChange(): Promise<void> {
  fireEvent.click(screen.getByTestId('change-duty-button'));
  fireEvent.change(await screen.findByTestId('change-child-select'), {
    target: { value: FAKE_CHILD_USER_ID_2 },
  });
  fireEvent.click(screen.getByTestId('change-child-confirm-button'));
}

beforeEach(() => {
  vi.mocked(changeDutyChild).mockReset();
});
afterEach(cleanup);

describe('DayDetail', () => {
  it('日付の見出しを出し、担当がない日は「担当なし」と出して閉じるを押せる', () => {
    const { onClose } = renderDetail([]);

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('11月10日(火)');
    expect(screen.getByText(NO_DUTY_LABEL)).toBeInTheDocument();
    expect(screen.queryAllByTestId('day-detail-duty')).toHaveLength(0);

    fireEvent.click(screen.getByTestId('day-detail-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('「未」の担当は種類・子供・状態を出し、記録した時刻と人は出さない', () => {
    renderDetail([makeDuty()]);

    expect(screen.getByTestId('detail-chore')).toHaveTextContent('皿洗い');
    expect(screen.getByTestId('detail-child')).toHaveTextContent('太郎');
    expect(screen.getByTestId('detail-status')).toHaveTextContent('未');
    expect(screen.queryByTestId('detail-time')).toBeNull();
    expect(screen.queryByTestId('detail-recorder')).toBeNull();
  });

  it('「済」の担当は記録した時刻を日本時間で、記録した人を出し、管理者でも担当を変えられない', () => {
    renderDetail([
      makeDuty({
        status: 'done',
        recordedAt: '2026-11-10T09:30:00.000Z',
        recordedBy: FAKE_CHILD_USER_ID_1,
        recordedByName: '太郎',
      }),
    ]);

    expect(screen.getByTestId('detail-status')).toHaveTextContent('済');
    expect(screen.getByTestId('detail-time')).toHaveTextContent('18:30');
    expect(screen.getByTestId('detail-recorder')).toHaveTextContent('太郎');
    expect(screen.queryByTestId('change-duty-button')).toBeNull();
  });

  it('管理者以外には、「未」の担当でも「担当を変える」を出さない', () => {
    renderDetail([makeDuty()], false);

    expect(screen.getByTestId('detail-chore')).toBeInTheDocument();
    expect(screen.queryByTestId('change-duty-button')).toBeNull();
  });

  it('管理者が子供を選んで変更すると、担当の ID と子供を送り、応答の担当で onChanged が呼ばれる', async () => {
    const changed = makeDuty({ childUserId: FAKE_CHILD_USER_ID_2, version: 2 });
    vi.mocked(changeDutyChild).mockResolvedValue(changed);
    const { onChanged, onRefresh } = renderDetail([makeDuty()]);

    await startChange();

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(changeDutyChild).toHaveBeenCalledTimes(1);
    expect(changeDutyChild).toHaveBeenCalledWith(
      FAKE_SESSION_TOKEN,
      FAKE_DUTY_ID_1,
      FAKE_CHILD_USER_ID_2,
    );
    expect(onChanged).toHaveBeenCalledWith(changed);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId('change-error')).toBeNull();
  });

  it('担当がもう「未」でなく変更が断られたら（409）、理由の文言を出して画面を読み直す', async () => {
    vi.mocked(changeDutyChild).mockRejectedValue(new ApiFailure(409, 'DUTY_NOT_TODO'));
    const { onChanged, onRefresh } = renderDetail([makeDuty()]);

    await startChange();

    expect(await screen.findByTestId('change-error')).toHaveTextContent(MESSAGES.DUTY_NOT_TODO);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByTestId('change-child-confirm-button')).toBeEnabled();
  });

  it('通信そのものが失敗したとき（status 0）は文言だけ出し、読み直しはしない', async () => {
    vi.mocked(changeDutyChild).mockRejectedValue(
      new ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE'),
    );
    const { onChanged, onRefresh } = renderDetail([makeDuty()]);

    await startChange();

    expect(await screen.findByTestId('change-error')).toHaveTextContent(
      MESSAGES.SERVICE_TEMPORARILY_UNAVAILABLE,
    );
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('ApiFailure でない失敗は INTERNAL の文言にし、「やめる」で選びを閉じる', async () => {
    vi.mocked(changeDutyChild).mockRejectedValue(new Error('boom'));
    renderDetail([makeDuty()]);

    await startChange();
    expect(await screen.findByTestId('change-error')).toHaveTextContent(MESSAGES.INTERNAL);

    fireEvent.click(screen.getByTestId('change-child-cancel-button'));
    expect(screen.queryByTestId('change-child-select')).toBeNull();
    expect(screen.getByTestId('change-duty-button')).toBeInTheDocument();
  });
});
