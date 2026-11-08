import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, CircularProgress, List, ListItem, Stack, Typography } from '@mui/material';
import type { InvitationView, Member, Reason, Role } from '@housework/shared';
import { getMessage, INVITATION_SHARE_TEXT } from '@housework/shared';
import { ApiFailure, createInvitation, getCurrentInvitation, listMembers } from '../api/client';
import type { NotificationGroupState } from '../hooks/useNotificationGroup';
import type { Authorized } from '../hooks/useSession';
import { formatExpiry } from '../invitation/formatExpiry';
import { shareText } from '../liff/share';
import { ErrorRetry } from './ErrorRetry';

/** 役割は色だけでなく文字で出す（NFR9.2） */
const ROLE_LABELS: Record<Role, string> = { admin: '管理者', child: '子供' };

interface Props {
  familyName: string;
  role: Role;
  authorized: Authorized;
  onBack: () => void;
  /** 「お手伝いの種類」の画面へ進む（U4）。渡さなければボタンは出さない */
  onOpenChoreTypes?: () => void;
  /** お知らせ先の読み込み結果（U3。App が読む）。渡さなければ表示しない */
  notificationGroup?: NotificationGroupState;
}

type Loaded<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: T };

function isRetryable(e: unknown): boolean {
  return !(e instanceof ApiFailure) || e.status === 0 || e.status >= 500;
}

/** F1〜F4: メンバーの一覧と、管理者だけの招待用のリンク。 */
export function FamilySettingsPage({
  familyName,
  role,
  authorized,
  onBack,
  onOpenChoreTypes,
  notificationGroup,
}: Props) {
  const isAdmin = role === 'admin';
  return (
    <Stack spacing={3} data-testid="family-settings-page">
      <Typography component="h1" variant="h5">
        家族の設定
      </Typography>
      <MemberList authorized={authorized} />
      <NotificationGroupSection state={notificationGroup} />
      {isAdmin && <InvitationSection familyName={familyName} authorized={authorized} />}
      {onOpenChoreTypes && (
        <Button
          variant="contained"
          onClick={onOpenChoreTypes}
          sx={{ alignSelf: 'flex-start' }}
          data-testid="open-chore-types-button"
        >
          お手伝いの種類
        </Button>
      )}
      <Button
        variant="outlined"
        onClick={onBack}
        sx={{ alignSelf: 'flex-start' }}
        data-testid="back-button"
      >
        カレンダーへ戻る
      </Button>
    </Stack>
  );
}

/** お知らせ先の表示（AC1.2.4）。グループの名前は文字として出す（タグとして扱わない）。管理者も子供も同じ。 */
function NotificationGroupSection({ state }: { state: NotificationGroupState | undefined }) {
  if (state?.kind !== 'ready') return null;
  const { value } = state;
  const text = !value
    ? 'お知らせ先: 登録されていません'
    : value.groupName
      ? `お知らせ先: ${value.groupName}`
      : 'お知らせ先: 登録済み';
  return (
    <Typography data-testid="notification-group" sx={{ overflowWrap: 'anywhere' }}>
      {text}
    </Typography>
  );
}

function MemberList({ authorized }: { authorized: Authorized }) {
  const [members, setMembers] = useState<Loaded<Member[]>>({ kind: 'loading' });
  const fetchMembers = useCallback(async (): Promise<Loaded<Member[]>> => {
    try {
      return { kind: 'ready', value: await authorized(listMembers) };
    } catch {
      return { kind: 'error' };
    }
  }, [authorized]);
  useEffect(() => {
    let active = true;
    void fetchMembers().then((next) => active && setMembers(next));
    return () => {
      active = false;
    };
  }, [fetchMembers]);
  async function reload() {
    setMembers({ kind: 'loading' });
    setMembers(await fetchMembers());
  }

  if (members.kind === 'loading') return <CircularProgress aria-label="読み込み中" />;
  if (members.kind === 'error') return <ErrorRetry onRetry={() => void reload()} />;
  return (
    <Stack spacing={1}>
      <Typography component="h2" variant="h6">
        メンバー
      </Typography>
      <List data-testid="member-list" disablePadding>
        {members.value.map((member) => (
          <ListItem
            key={member.userId}
            data-testid="member-row"
            sx={{ justifyContent: 'space-between', gap: 2 }}
          >
            <span>{member.displayName}</span>
            <Typography component="span" color="text.secondary" data-testid="member-role">
              {ROLE_LABELS[member.role]}
            </Typography>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}

function InvitationSection({
  familyName,
  authorized,
}: {
  familyName: string;
  authorized: Authorized;
}) {
  const [current, setCurrent] = useState<Loaded<InvitationView | null>>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [retry, setRetry] = useState(false);
  const [failure, setFailure] = useState<Reason | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  // 作る操作ごとの識別子。通信の失敗で送り直すときは同じ値を使う（BR3.5）
  const keyRef = useRef<string | undefined>(undefined);

  const fetchCurrent = useCallback(async (): Promise<Loaded<InvitationView | null>> => {
    try {
      return { kind: 'ready', value: await authorized(getCurrentInvitation) };
    } catch {
      return { kind: 'error' };
    }
  }, [authorized]);
  useEffect(() => {
    let active = true;
    void fetchCurrent().then((next) => active && setCurrent(next));
    return () => {
      active = false;
    };
  }, [fetchCurrent]);
  async function reload() {
    setCurrent({ kind: 'loading' });
    setCurrent(await fetchCurrent());
  }

  async function create() {
    keyRef.current ??= crypto.randomUUID();
    const key = keyRef.current;
    setCreating(true);
    setRetry(false);
    setFailure(undefined);
    setConfirming(false);
    try {
      const created = await authorized((token) => createInvitation(token, key));
      keyRef.current = undefined;
      setCopied(false);
      setCurrent({ kind: 'ready', value: created });
    } catch (e) {
      if (isRetryable(e)) {
        setRetry(true);
      } else {
        keyRef.current = undefined;
        setFailure(e instanceof ApiFailure ? e.reason : 'INTERNAL');
      }
    } finally {
      setCreating(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (current.kind === 'loading') return <CircularProgress aria-label="読み込み中" />;
  if (current.kind === 'error') return <ErrorRetry onRetry={() => void reload()} />;

  const invitation = current.value;
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="invitation-section">
      <Typography component="h2" variant="h6">
        招待
      </Typography>
      {invitation && (
        <>
          <Typography data-testid="invitation-url" sx={{ wordBreak: 'break-all' }}>
            {invitation.url}
          </Typography>
          <Typography data-testid="invitation-expiry">
            {formatExpiry(invitation.expiresAt)}まで使えます
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              onClick={() =>
                void shareText(
                  INVITATION_SHARE_TEXT({
                    familyName,
                    expiresAtText: formatExpiry(invitation.expiresAt),
                    url: invitation.url,
                  }),
                )
              }
              data-testid="share-button"
            >
              LINE で送る
            </Button>
            <Button
              variant="outlined"
              onClick={() => void copy(invitation.url)}
              data-testid="copy-button"
            >
              リンクをコピー
            </Button>
          </Stack>
          {copied && (
            <Typography role="status" data-testid="copied-message">
              コピーしました
            </Typography>
          )}
        </>
      )}
      {confirming && (
        <Stack
          spacing={1}
          role="alertdialog"
          aria-label="作り直しの確認"
          data-testid="regenerate-confirm"
        >
          <Typography>前のリンクは使えなくなります。作り直しますか？</Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={creating}
              onClick={() => void create()}
              data-testid="regenerate-confirm-button"
            >
              作り直す
            </Button>
            <Button
              variant="outlined"
              onClick={() => setConfirming(false)}
              data-testid="regenerate-cancel-button"
            >
              やめる
            </Button>
          </Stack>
        </Stack>
      )}
      {!confirming &&
        !retry &&
        (invitation ? (
          <Button
            variant="outlined"
            onClick={() => setConfirming(true)}
            data-testid="regenerate-button"
          >
            招待用のリンクを作り直す
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={creating}
            onClick={() => void create()}
            data-testid="create-invitation-button"
          >
            招待用のリンクを作る
          </Button>
        ))}
      {retry && <ErrorRetry label="もう一度" onRetry={() => void create()} />}
      {failure && (
        <Typography color="error" role="alert" data-testid="invitation-failure">
          {getMessage(failure)}
        </Typography>
      )}
    </Stack>
  );
}
