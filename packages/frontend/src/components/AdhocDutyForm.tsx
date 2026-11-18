import { useEffect, useRef, useState } from 'react';
import { Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { getMessage, type CalendarChild, type ChoreType } from '@housework/shared';
import { ApiFailure, createAdhocDuty, listChoreTypes } from '../api/client';
import type { Authorized } from '../hooks/useSession';

export function AdhocDutyForm({
  date,
  children: kids,
  authorized,
  onSaved,
  onCancel,
}: {
  date: string;
  children: readonly CalendarChild[];
  authorized: Authorized;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [types, setTypes] = useState<ChoreType[]>();
  const [typeId, setTypeId] = useState('');
  const [child, setChild] = useState(kids[0]?.userId ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void authorized(listChoreTypes)
      .then((all) => {
        if (!live) return;
        const usable = all.filter((t) => t.purpose === 'adhoc' && t.active);
        setTypes(usable);
        setTypeId(usable[0]?.choreTypeId ?? '');
        setError(undefined);
      })
      .catch(() => live && setError('臨時用マスタを読み込めませんでした'));
    return () => {
      live = false;
    };
  }, [authorized, attempt]);
  return (
    <Stack
      component="form"
      spacing={1}
      data-testid="adhoc-duty-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!typeId || !child || saving.current) return;
        saving.current = true;
        setBusy(true);
        setError(undefined);
        try {
          await authorized((token) =>
            createAdhocDuty(token, { date, choreTypeId: typeId, childUserId: child }),
          );
          onSaved();
        } catch (e) {
          setError(getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL'));
        } finally {
          saving.current = false;
          setBusy(false);
        }
      }}
    >
      {!types && !error && <CircularProgress aria-label="臨時用マスタを読み込み中" />}
      {types?.length === 0 && (
        <Typography>家族の設定で使用する臨時のお手伝いを登録してください</Typography>
      )}
      {kids.length === 0 && <Typography>家族の設定から子供を招待してください</Typography>}
      {types && types.length > 0 && (
        <TextField
          select
          label="臨時のお手伝い"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          disabled={busy}
          slotProps={{ select: { native: true } }}
        >
          {types.map((t) => (
            <option key={t.choreTypeId} value={t.choreTypeId}>
              {t.name}（{t.unitPrice}円）
            </option>
          ))}
        </TextField>
      )}
      {kids.length > 0 && (
        <TextField
          select
          label="依頼する子供"
          value={child}
          onChange={(e) => setChild(e.target.value)}
          disabled={busy}
          slotProps={{ select: { native: true } }}
        >
          {kids.map((k) => (
            <option key={k.userId} value={k.userId}>
              {k.displayName}
            </option>
          ))}
        </TextField>
      )}
      {error && (
        <Typography role="alert" color="error">
          {error}
        </Typography>
      )}
      {!types && error && (
        <Button
          onClick={() => {
            setError(undefined);
            setAttempt((n) => n + 1);
          }}
        >
          再読み込み
        </Button>
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={busy || !typeId || !child}>
          依頼する
        </Button>
        <Button disabled={busy} onClick={onCancel}>
          やめる
        </Button>
      </Stack>
    </Stack>
  );
}
