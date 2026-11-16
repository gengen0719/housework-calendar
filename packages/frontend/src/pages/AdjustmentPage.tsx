import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import {
  getMessage,
  validateAdjustment,
  type AdjustmentInput,
  type Reason,
} from '@housework/shared';
import { addAdjustment, ApiFailure } from '../api/client';
import type { Authorized } from '../hooks/useSession';

interface Props {
  authorized: Authorized;
  month: string;
  children: readonly { userId: string; displayName: string }[];
  onBack: () => void;
  onSaved: () => void;
}
/** 保存成功と次の表示失敗を分ける。結果不明の入力・キーは解決するまで変更しない。 */
export function AdjustmentPage({ authorized, month, children, onBack, onSaved }: Props) {
  const [child, setChild] = useState('');
  const [kind, setKind] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<{ field: string; reason: Reason }>();
  const [unknown, setUnknown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [expired, setExpired] = useState(false);
  const operation = useRef<{ key: string; input: AdjustmentInput; started: number } | undefined>(
    undefined,
  );
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current || blocked || expired) return;
    const checked = validateAdjustment({
      childUserId: child,
      kind,
      amount: /^\d+$/.test(amount) ? Number(amount) : NaN,
      reason,
    });
    if (!checked.ok) {
      setError({
        field: !child
          ? 'child'
          : !kind
            ? 'kind'
            : checked.reason === 'INVALID_AMOUNT'
              ? 'amount'
              : 'reason',
        reason: checked.reason,
      });
      return;
    }
    if (operation.current && Date.now() >= operation.current.started + 86400000) {
      setExpired(true);
      return;
    }
    operation.current ??= { key: crypto.randomUUID(), input: checked.value, started: Date.now() };
    pending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const current = operation.current;
      await authorized((token) => addAdjustment(token, month, current.input, current.key));
      if (alive.current) {
        operation.current = undefined;
        onSaved();
      }
    } catch (e) {
      if (!alive.current) return;
      const uncertain = !(e instanceof ApiFailure) || e.status === 0 || e.status >= 500;
      setUnknown(uncertain);
      if (!uncertain) operation.current = undefined;
      const code = e instanceof ApiFailure ? e.reason : 'INTERNAL';
      setBlocked(e instanceof ApiFailure && [401, 403, 409].includes(e.status));
      setError({
        field:
          code === 'INVALID_AMOUNT'
            ? 'amount'
            : code === 'INVALID_REASON' || code === 'REASON_REQUIRED'
              ? 'reason'
              : 'general',
        reason: code,
      });
    } finally {
      pending.current = false;
      if (alive.current) setSaving(false);
    }
  }
  const fieldError = (field: string) =>
    error?.field === field ? getMessage(error.reason) : undefined;
  const locked = saving || unknown || blocked || expired;
  return (
    <Stack component="form" spacing={2} onSubmit={submit} noValidate data-testid="adjustment-page">
      <Typography component="h1" variant="h5">
        {month}の加算・減額
      </Typography>
      {children.length === 0 && (
        <Typography role="status">子供がいません。家族の設定を確認してください</Typography>
      )}
      <TextField
        select
        label="子供"
        value={child}
        disabled={locked}
        onChange={(e) => setChild(e.target.value)}
        helperText={fieldError('child')}
        error={!!fieldError('child')}
        slotProps={{ select: { native: true }, htmlInput: { 'data-testid': 'adjustment-child' } }}
      >
        <option value="" />
        {children.map((c) => (
          <option key={c.userId} value={c.userId}>
            {c.displayName}
          </option>
        ))}
      </TextField>
      <TextField
        select
        label="種類"
        value={kind}
        disabled={locked}
        onChange={(e) => setKind(e.target.value)}
        helperText={fieldError('kind')}
        error={!!fieldError('kind')}
        slotProps={{ select: { native: true }, htmlInput: { 'data-testid': 'adjustment-kind' } }}
      >
        <option value="" />
        <option value="add">加算</option>
        <option value="subtract">減額</option>
      </TextField>
      <TextField
        label="金額（円）"
        value={amount}
        disabled={locked}
        onChange={(e) => setAmount(e.target.value)}
        helperText={fieldError('amount')}
        error={!!fieldError('amount')}
        slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'adjustment-amount' } }}
      />
      <TextField
        label="理由"
        value={reason}
        multiline
        minRows={2}
        disabled={locked}
        onChange={(e) => setReason(e.target.value)}
        helperText={fieldError('reason')}
        error={!!fieldError('reason')}
        slotProps={{ htmlInput: { 'data-testid': 'adjustment-reason' } }}
      />
      {error && <Typography role="alert">{getMessage(error.reason)}</Typography>}
      {saving && <Typography role="status">保存中…</Typography>}
      {unknown && (
        <Typography role="status">
          結果が不明です。同じ入力で結果を確認してください。24時間を超えたら一覧で確認し、自動で登録し直さないでください
        </Typography>
      )}
      {expired && (
        <Typography role="alert">24時間を過ぎました。一覧で登録結果を確認してください</Typography>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={saving || blocked || expired || children.length === 0}
        data-testid="adjustment-save"
        sx={{ minHeight: 44 }}
      >
        {unknown ? '同じ入力で結果を確認' : '保存'}
      </Button>
      <Button
        onClick={onBack}
        disabled={saving}
        data-testid="adjustment-cancel"
        sx={{ minHeight: 44 }}
      >
        {unknown || expired ? '一覧へ戻って確認' : 'やめる'}
      </Button>
    </Stack>
  );
}
