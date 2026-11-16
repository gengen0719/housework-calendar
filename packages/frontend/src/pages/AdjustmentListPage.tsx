import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { formatYen, getMessage, type AdjustmentMonthView } from '@housework/shared';
import { ApiFailure, deleteAdjustment, getAdjustments } from '../api/client';
import type { Authorized } from '../hooks/useSession';
import { AdjustmentPage } from './AdjustmentPage';
interface Props {
  authorized: Authorized;
  month: string;
  onBack: () => void;
}
export function AdjustmentListPage({ authorized, month, onBack }: Props) {
  const [data, setData] = useState<AdjustmentMonthView>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState(false);
  const [target, setTarget] = useState<AdjustmentMonthView['adjustments'][number]>();
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    authorized((token) => getAdjustments(token, month, controller.signal)).then(
      (value) => {
        if (!controller.signal.aborted) {
          setError('');
          setData(value);
          setLocked(value.confirmed);
        }
      },
      (e) => {
        if (!controller.signal.aborted)
          setError(getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL'));
      },
    );
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [authorized, month, version]);
  async function remove() {
    if (!target || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await authorized((token) => deleteAdjustment(token, target.adjustmentId));
      if (alive.current) {
        setTarget(undefined);
        setNotice('削除しました。表示を読み込み直します');
        setVersion((v) => v + 1);
        heading.current?.focus();
      }
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiFailure && e.status === 404) {
        setTarget(undefined);
        setNotice('すでに削除されています。最新の一覧を確認してください');
        setVersion((v) => v + 1);
        heading.current?.focus();
      } else {
        setError(getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL'));
        if (e instanceof ApiFailure && [401, 403, 409].includes(e.status)) {
          setLocked(true);
          setVersion((v) => v + 1);
        }
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (form && data)
    return (
      <AdjustmentPage
        key={data.month}
        authorized={authorized}
        month={data.month}
        children={data.children}
        onBack={() => setForm(false)}
        onSaved={() => {
          setForm(false);
          setNotice('保存しました。表示を読み込み直します');
          setVersion((v) => v + 1);
        }}
      />
    );
  return (
    <Stack spacing={2} data-testid="adjustment-list-page">
      <Typography component="h1" variant="h5" tabIndex={-1} ref={heading}>
        {data?.month ?? month}の加算・減額一覧
      </Typography>
      {notice && <Typography role="status">{notice}</Typography>}
      {error && <Typography role="alert">{error}</Typography>}
      {!data && !error && <Typography role="status">読み込み中…</Typography>}
      {data && (
        <>
          <Typography>{data.confirmed ? '確定済み' : '未確定'}</Typography>
          {data.adjustments.length === 0 && <Typography>加算・減額はありません</Typography>}
          {data.adjustments.map((row) => (
            <Stack key={row.adjustmentId} sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              <Typography>
                {row.displayName} {formatYen(row.kind === 'add' ? row.amount : -row.amount)}{' '}
                {row.reason}
              </Typography>
              <Button
                disabled={busy || locked}
                onClick={() => {
                  setTarget(row);
                  setError('');
                }}
                data-testid="adjustment-delete"
                sx={{ minHeight: 44 }}
              >
                消す
              </Button>
            </Stack>
          ))}
          {!locked && (
            <Button
              onClick={() => setForm(true)}
              data-testid="adjustment-add"
              sx={{ minHeight: 44 }}
            >
              加算・減額を登録
            </Button>
          )}
        </>
      )}
      <Button
        onClick={() => setVersion((v) => v + 1)}
        disabled={busy}
        data-testid="adjustment-list-reload"
        sx={{ minHeight: 44 }}
      >
        一覧を読み込み直す
      </Button>
      <Button
        onClick={onBack}
        disabled={busy}
        data-testid="adjustment-list-back"
        sx={{ minHeight: 44 }}
      >
        お小遣いへ戻る
      </Button>
      <Dialog
        open={!!target}
        onClose={() => {
          if (!busy) setTarget(undefined);
        }}
        aria-labelledby="adjustment-delete-title"
        data-testid="adjustment-delete-dialog"
      >
        <DialogTitle id="adjustment-delete-title">この加算・減額を消しますか</DialogTitle>
        <DialogContent>
          <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {target &&
              `${target.displayName} ${formatYen(target.kind === 'add' ? target.amount : -target.amount)} ${target.reason}`}
          </Typography>
          {error && <Typography role="alert">{error}</Typography>}
        </DialogContent>
        <DialogActions>
          <Button
            autoFocus
            disabled={busy}
            onClick={() => setTarget(undefined)}
            data-testid="adjustment-delete-cancel"
          >
            やめる
          </Button>
          <Button
            disabled={busy || locked}
            onClick={() => void remove()}
            data-testid="adjustment-delete-confirm"
          >
            消す
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
