import { useState } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import {
  MONTH_RECONFIRM_RETRY,
  STATUS_DROP_FROM_COUNT_NOTE,
  getMessage,
  unitPriceCountNote,
  type CalendarChild,
  type Duty,
  type DutyStatus,
  type StatusChangeAction,
  type StatusChangePreview,
} from '@housework/shared';
import { ApiFailure, changeDutyStatus, listChoreTypes } from '../api/client';
import { childName } from '../calendar/format';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';
import { StatusChangeDialog } from './StatusChangeDialog';

interface Props {
  duty: Duty;
  kids: readonly CalendarChild[];
  isAdmin: boolean;
  authorized: Authorized;
  /** 変更できたとき（応答の担当で画面を差し替える） */
  onChanged: (duty: Duty) => void;
  /** 読み直す（成功のあと、または断られたあと） */
  onRefresh: () => void;
}

interface ActionDef {
  action: StatusChangeAction;
  label: string;
  to: DutyStatus;
  /** 元に戻す側の操作か（色を分ける） */
  revert: boolean;
}

/** 今の状態からできる操作（F1 の表。BR8.9）。表にない操作のボタンは出さない。 */
const ACTIONS_BY_STATUS: Record<DutyStatus, readonly ActionDef[]> = {
  todo: [
    { action: 'markDone', label: '済にする', to: 'done', revert: false },
    { action: 'markSkipped', label: 'やらなかったにする', to: 'skipped', revert: true },
  ],
  done: [
    { action: 'cancel', label: '取り消す', to: 'todo', revert: true },
    { action: 'markSkipped', label: 'やらなかったにする', to: 'skipped', revert: true },
  ],
  skipped: [
    { action: 'unmarkSkipped', label: 'やらなかったを外す', to: 'todo', revert: true },
    { action: 'markDone', label: '済にする', to: 'done', revert: false },
  ],
};

interface Pending {
  def: ActionDef;
  /** 見せた時点の版（ボタンを押したときの担当の version） */
  version: number;
  preview: StatusChangePreview;
}

/**
 * 管理者の「状態を変える」ボタン・確認ダイアログ・失敗の文言（U7。F1、F2）。子供には何も出さない。
 * 「済にする」の確認の単価は、確認を出す時点の種類の一覧（既存の読み取り）から引く。
 */
export function DutyStatusActions({
  duty,
  kids,
  isAdmin,
  authorized,
  onChanged,
  onRefresh,
}: Props) {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ text: string; retry: boolean } | undefined>(undefined);

  if (!isAdmin) return null;

  async function open(def: ActionDef) {
    setError(undefined);
    setPreparing(true);
    try {
      let countNote: string | null = null;
      if (def.action === 'markDone') {
        const types = await authorized((token) => listChoreTypes(token));
        const price = types.find((t) => t.choreTypeId === duty.choreTypeId)?.unitPrice;
        countNote = price === undefined ? null : unitPriceCountNote(price);
      } else if (duty.status === 'done') {
        // 済から外すと、お小遣いの回数から外れる（BR8.3）
        countNote = STATUS_DROP_FROM_COUNT_NOTE;
      }
      setPending({
        def,
        version: duty.version,
        preview: {
          date: duty.date,
          choreName: duty.choreName,
          childName: childName(kids, duty.childUserId),
          fromStatus: duty.status,
          toStatus: def.to,
          countNote,
        },
      });
    } catch (e) {
      setError(failureOf(e));
    } finally {
      setPreparing(false);
    }
  }

  async function send(target: Pending) {
    setSending(true);
    setError(undefined);
    try {
      const changed = await authorized((token) =>
        changeDutyStatus(token, duty.dutyId, {
          action: target.def.action,
          version: target.version,
        }),
      );
      setPending(undefined);
      onChanged(changed);
      // 応答の担当で先に新しい状態にしたあと、カレンダーを読み直す（AC6.1.1〜AC6.1.5）
      onRefresh();
    } catch (e) {
      const failure = failureOf(e);
      setPending(undefined);
      setError(failure);
      // 担当・月の状態が原因の断りだけ読み直す。内容の誤り（422）・500・通信の失敗・管理者でない場合は読み直さない
      if (e instanceof ApiFailure && shouldRefresh(e.reason)) onRefresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Stack spacing={0.5} data-testid="duty-status-actions">
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {ACTIONS_BY_STATUS[duty.status].map((def) => (
          <Button
            key={def.action}
            variant="contained"
            disabled={preparing || sending}
            onClick={() => void open(def)}
            data-testid={`status-action-${def.action}`}
            sx={{
              bgcolor: def.revert ? colors.reviewRevertButton : colors.reviewActionButton,
              color: def.revert ? colors.reviewRevertButtonText : colors.reviewActionButtonText,
            }}
          >
            {def.label}
          </Button>
        ))}
      </Stack>
      {pending && (
        <StatusChangeDialog
          preview={pending.preview}
          busy={sending}
          onConfirm={() => void send(pending)}
          onCancel={() => setPending(undefined)}
        />
      )}
      {error && (
        <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          <Typography color="error" role="alert" data-testid="status-error">
            {error.text}
          </Typography>
          {error.retry && (
            <Button variant="outlined" onClick={onRefresh} data-testid="status-error-retry">
              {MONTH_RECONFIRM_RETRY}
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function shouldRefresh(reason: string): boolean {
  return reason === 'NOT_FOUND' || reason === 'INVALID_TRANSITION' || reason === 'MONTH_CONFIRMED';
}

/** 失敗の文言（functional-spec の「状態の変更の印と返事の対応」の表） */
function failureOf(e: unknown): { text: string; retry: boolean } {
  const reason = e instanceof ApiFailure ? e.reason : 'INTERNAL';
  switch (reason) {
    case 'NOT_FOUND':
    case 'INVALID_TRANSITION':
      return { text: getMessage('DUTY_CHANGED'), retry: false };
    case 'MONTH_CONFIRMED':
    case 'INVALID_REQUEST':
    case 'ADMIN_ONLY':
      return { text: getMessage(reason), retry: false };
    default:
      // 500 と通信の失敗: 文言と「読み込み直す」
      return { text: getMessage('INTERNAL'), retry: true };
  }
}
