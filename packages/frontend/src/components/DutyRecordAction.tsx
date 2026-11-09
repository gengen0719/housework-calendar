import { useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { RECORD_FAILED_MESSAGE, getMessage, type Duty } from '@housework/shared';
import { ApiFailure, recordDuty } from '../api/client';
import { recordViewOf } from '../calendar/format';
import { RecordConfirmDialog } from './RecordConfirmDialog';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';

interface Props {
  duty: Duty;
  confirmed: boolean;
  today: string;
  currentUserId?: string;
  isAdmin: boolean;
  authorized: Authorized;
  /** お手伝いの名前を添えて出すか（カレンダーの一覧では担当ごとに名前を添える。詳しい内容では見出しにあるので不要） */
  showChoreName?: boolean;
  /** 記録できたとき（応答の担当で画面を差し替える） */
  onChanged: (duty: Duty) => void;
  /** 記録が断られたとき（担当の状態が原因なら読み直す） */
  onRefresh: () => void;
}

/**
 * 子供の「やった」ボタン・確認ダイアログ・記録できない理由（BR7.10、F3）。
 * カレンダーの日の一覧と、日付を選んだ詳しい内容の両方で同じロジックを使う。
 * 「済」の表示は呼び出し側（状態の文字や時刻）に任せ、ここでは出さない。
 */
export function DutyRecordAction({
  duty,
  confirmed,
  today,
  currentUserId,
  isAdmin,
  authorized,
  showChoreName = false,
  onChanged,
  onRefresh,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const view = recordViewOf(duty, { currentUserId, isAdmin, confirmed, today });

  async function record() {
    setRecording(true);
    setError(undefined);
    try {
      const recorded = await authorized((token) =>
        recordDuty(token, duty.dutyId, { version: duty.version }),
      );
      setConfirming(false);
      onChanged(recorded);
      // 応答の担当で即「済」にしたあと、カレンダー全体を読み直す（AC5.1.7）
      onRefresh();
    } catch (e) {
      const reason = e instanceof ApiFailure ? e.reason : 'INTERNAL';
      // functional-spec の表の「画面の文言」:
      // - NOT_OWN_DUTY は「見せたあとに担当が変更された」として「変更されました」の文言にする
      // - INTERNAL（500）と通信の失敗は記録用の文言「うまく記録できませんでした。もう一度お試しください」
      setError(
        reason === 'NOT_OWN_DUTY'
          ? getMessage('DUTY_CHANGED')
          : reason === 'INTERNAL' || reason === 'SERVICE_TEMPORARILY_UNAVAILABLE'
            ? RECORD_FAILED_MESSAGE
            : getMessage(reason),
      );
      setConfirming(false);
      // 担当の状態が原因の失敗（4xx）と 500 は読み直す。INVALID_REQUEST だけ読み直さない
      if (e instanceof ApiFailure && e.reason !== 'INVALID_REQUEST') onRefresh();
    } finally {
      setRecording(false);
    }
  }

  if (view.kind === 'none' || view.kind === 'done') {
    // 「済」や、ほかの子供・管理者のときは、ここでは何も出さない（表示は呼び出し側）
    return error ? <RecordErrorText text={error} /> : null;
  }

  return (
    <Stack spacing={0.5} data-testid="duty-record-action" sx={{ overflowWrap: 'anywhere' }}>
      {showChoreName && (
        <Typography component="span" sx={{ fontSize: '0.9rem' }}>
          {duty.choreName}
        </Typography>
      )}
      {view.kind === 'record' && (
        <Button
          variant="contained"
          onClick={() => {
            setError(undefined);
            setConfirming(true);
          }}
          sx={{
            alignSelf: 'flex-start',
            bgcolor: colors.recordButton,
            color: colors.recordButtonText,
          }}
          data-testid="record-button"
        >
          やった
        </Button>
      )}
      {view.kind === 'reason' && <Typography data-testid="record-reason">{view.text}</Typography>}
      {confirming && (
        <RecordConfirmDialog
          date={duty.date}
          choreName={duty.choreName}
          busy={recording}
          onConfirm={() => void record()}
          onCancel={() => setConfirming(false)}
        />
      )}
      {error && <RecordErrorText text={error} />}
    </Stack>
  );
}

function RecordErrorText({ text }: { text: string }) {
  return (
    <Typography color="error" role="alert" data-testid="record-error">
      {text}
    </Typography>
  );
}
