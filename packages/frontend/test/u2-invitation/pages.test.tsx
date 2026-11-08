import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiFailure } from '../../src/api/client';
import type { Authorized } from '../../src/hooks/useSession';
import { FamilySettingsPage } from '../../src/pages/FamilySettingsPage';
import { InvitationPage } from '../../src/pages/InvitationPage';
import { FAKE_INVITE_TOKEN } from '../fixtures/fakeSecrets';

vi.mock('@line/liff', () => ({ default: {} }));

const TOKEN = FAKE_INVITE_TOKEN;
const MEMBERS = [{ userId: 'u1', displayName: '花子', role: 'admin' }];

/** 呼び出しごとに用意した結果を順に返す（Error なら失敗にする） */
function scripted(results: unknown[]): Authorized {
  let index = 0;
  return (async () => {
    const result = results[index++];
    if (result instanceof Error) throw result;
    return result;
  }) as Authorized;
}

afterEach(cleanup);

describe('InvitationPage', () => {
  it('サーバーの失敗では読み直すボタンが出て、押すと確かめ直す', async () => {
    const authorized = scripted([
      new ApiFailure(503, 'SERVICE_TEMPORARILY_UNAVAILABLE'),
      { familyName: '田中家', expiresAt: '2026-11-02T01:30:00.000Z' },
    ]);
    render(
      <InvitationPage
        invitationToken={TOKEN}
        authorized={authorized}
        onJoined={vi.fn()}
        onGoToCalendar={vi.fn()}
        inFamily={false}
      />,
    );
    expect(await screen.findByTestId('error-retry')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('retry-button'));
    expect(await screen.findByTestId('invitation-prompt')).toHaveTextContent(
      '田中家に参加しますか？',
    );
  });
  it('参加の要求が 409 で断られたら理由の文言を出して、参加するボタンは出さない', async () => {
    const authorized = scripted([
      { familyName: '田中家', expiresAt: '2026-11-02T01:30:00.000Z' },
      new ApiFailure(409, 'INVITATION_INVALID'),
    ]);
    const onJoined = vi.fn();
    render(
      <InvitationPage
        invitationToken={TOKEN}
        authorized={authorized}
        onJoined={onJoined}
        onGoToCalendar={vi.fn()}
        inFamily={false}
      />,
    );
    fireEvent.click(await screen.findByTestId('join-button'));
    expect(await screen.findByTestId('invitation-error')).toHaveTextContent(
      'この招待は使えません。管理者に新しい招待を頼んでください',
    );
    expect(screen.queryByTestId('join-button')).toBeNull();
    expect(screen.getByTestId('go-calendar-button')).toHaveTextContent('はじめの画面へ');
    expect(onJoined).not.toHaveBeenCalled();
  });
  it.each([
    ['INVITATION_INVALID', true, 'カレンダーへ'],
    ['INVITATION_INVALID', false, 'はじめの画面へ'],
    ['ALREADY_IN_OTHER_FAMILY', true, 'カレンダーへ'],
    ['ALREADY_IN_FAMILY', true, 'カレンダーへ'],
  ] as const)('%s（家族に入っている: %s）の戻るボタンは「%s」', async (reason, inFamily, label) => {
    const onGoToCalendar = vi.fn();
    render(
      <InvitationPage
        invitationToken={TOKEN}
        authorized={scripted([new ApiFailure(409, reason)])}
        onJoined={vi.fn()}
        onGoToCalendar={onGoToCalendar}
        inFamily={inFamily}
      />,
    );
    await screen.findByTestId('invitation-error');
    const button = screen.getByTestId('go-calendar-button');
    expect(button).toHaveTextContent(label);
    fireEvent.click(button);
    expect(onGoToCalendar).toHaveBeenCalledTimes(1);
  });
});

describe('FamilySettingsPage', () => {
  it('メンバーの一覧の読み込みに失敗したら読み込み直すボタンが出る', async () => {
    const authorized = scripted([new ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE'), MEMBERS]);
    render(
      <FamilySettingsPage
        familyName="田中家"
        role="child"
        authorized={authorized}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('retry-button'));
    expect(await screen.findAllByTestId('member-row')).toHaveLength(1);
  });
  it('招待を作る要求が 403 で断られたら理由の文言を出す', async () => {
    const authorized = scripted([MEMBERS, null, new ApiFailure(403, 'ADMIN_ONLY')]);
    render(
      <FamilySettingsPage
        familyName="田中家"
        role="admin"
        authorized={authorized}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('create-invitation-button'));
    expect(await screen.findByTestId('invitation-failure')).toHaveTextContent(
      'この操作ができるのは管理者だけです',
    );
    expect(screen.queryByTestId('retry-button')).toBeNull();
  });
  it('作り直しの確認で「やめる」を押すと何も変わらない', async () => {
    const current = {
      url: 'https://example.test/?invitation=x',
      expiresAt: '2026-11-02T01:30:00.000Z',
    };
    const authorized = scripted([MEMBERS, current]);
    render(
      <FamilySettingsPage
        familyName="田中家"
        role="admin"
        authorized={authorized}
        onBack={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByTestId('regenerate-button'));
    expect(screen.queryByTestId('regenerate-button')).toBeNull();
    fireEvent.click(screen.getByTestId('regenerate-cancel-button'));
    expect(screen.queryByTestId('regenerate-confirm')).toBeNull();
    expect(screen.getByTestId('invitation-url')).toHaveTextContent(current.url);
    expect(screen.getByTestId('regenerate-button')).toBeInTheDocument();
  });
  it('「カレンダーへ戻る」で戻る', async () => {
    const onBack = vi.fn();
    render(
      <FamilySettingsPage
        familyName="田中家"
        role="child"
        authorized={scripted([MEMBERS])}
        onBack={onBack}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('back-button')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
