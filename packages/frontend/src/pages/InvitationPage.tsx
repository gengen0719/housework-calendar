import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { InvitationPreview, MeFamily, Reason } from '@housework/shared';
import { getMessage } from '@housework/shared';
import { acceptInvitation, ApiFailure, previewInvitation } from '../api/client';
import type { Authorized } from '../hooks/useSession';
import { ErrorRetry } from './ErrorRetry';

type View =
  | { kind: 'loading' }
  | { kind: 'preview'; preview: InvitationPreview }
  | { kind: 'rejected'; reason: Reason }
  | { kind: 'retry-preview' }
  | { kind: 'retry-accept'; preview: InvitationPreview };

interface Props {
  /** 招待の印（メモリにだけ持つ。NFR4.18） */
  invitationToken: string;
  authorized: Authorized;
  onJoined: (family: MeFamily) => void;
  /** 招待の画面を閉じて戻る（断られたときの戻るボタン。BR3.7） */
  onGoToCalendar: () => void;
  /** 開いた人がすでに家族に入っているか。ボタンの文言を決める */
  inFamily: boolean;
}

/** 通信の失敗（つながらない・サーバーの失敗）か。返事が来た 4xx は理由として出す。 */
function isRetryable(e: unknown): boolean {
  return !(e instanceof ApiFailure) || e.status === 0 || e.status >= 500;
}

function reasonOf(e: unknown): Reason {
  return e instanceof ApiFailure ? e.reason : 'INTERNAL';
}

/** F5・F6: 招待を開いて家族の名前を確かめ、「参加する」で子供として参加する。 */
export function InvitationPage({
  invitationToken,
  authorized,
  onJoined,
  onGoToCalendar,
  inFamily,
}: Props) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [joining, setJoining] = useState(false);
  // 参加する操作ごとの識別子。通信の失敗で送り直すときは同じ値を使う（BR3.5）
  const keyRef = useRef<string | undefined>(undefined);

  const fetchPreview = useCallback(async (): Promise<View> => {
    try {
      const preview = await authorized((token) => previewInvitation(token, invitationToken));
      return { kind: 'preview', preview };
    } catch (e) {
      return isRetryable(e) ? { kind: 'retry-preview' } : { kind: 'rejected', reason: reasonOf(e) };
    }
  }, [authorized, invitationToken]);

  useEffect(() => {
    let active = true;
    void fetchPreview().then((next) => active && setView(next));
    return () => {
      active = false;
    };
  }, [fetchPreview]);

  async function reloadPreview() {
    setView({ kind: 'loading' });
    setView(await fetchPreview());
  }

  async function join(preview: InvitationPreview) {
    keyRef.current ??= crypto.randomUUID();
    const key = keyRef.current;
    setJoining(true);
    try {
      const family = await authorized((token) => acceptInvitation(token, invitationToken, key));
      onJoined(family);
    } catch (e) {
      if (isRetryable(e)) {
        setView({ kind: 'retry-accept', preview });
      } else {
        // 返事が来た失敗はその操作の終わり
        keyRef.current = undefined;
        setView({ kind: 'rejected', reason: reasonOf(e) });
      }
    } finally {
      setJoining(false);
    }
  }

  switch (view.kind) {
    case 'loading':
      return (
        <div role="status" data-testid="invitation-loading">
          <CircularProgress aria-hidden />
          <Typography>読み込み中…</Typography>
        </div>
      );
    case 'retry-preview':
      return <ErrorRetry onRetry={() => void reloadPreview()} />;
    case 'rejected':
      return (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="invitation-page">
          <Typography component="h1" variant="h5" role="alert" data-testid="invitation-error">
            {getMessage(view.reason)}
          </Typography>
          <Button variant="contained" onClick={onGoToCalendar} data-testid="go-calendar-button">
            {inFamily ? 'カレンダーへ' : 'はじめの画面へ'}
          </Button>
        </Stack>
      );
    case 'preview':
    case 'retry-accept': {
      const { preview } = view;
      return (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="invitation-page">
          <Typography component="h1" variant="h5" data-testid="invitation-prompt">
            {preview.familyName}に参加しますか？
          </Typography>
          {view.kind === 'retry-accept' ? (
            <ErrorRetry label="もう一度" onRetry={() => void join(preview)} />
          ) : (
            <Button
              variant="contained"
              disabled={joining}
              onClick={() => void join(preview)}
              data-testid="join-button"
            >
              参加する
            </Button>
          )}
        </Stack>
      );
    }
  }
}
