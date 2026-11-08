import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import type { ChoreType, ChoreTypeInput, Reason, Role } from '@housework/shared';
import {
  CHORE_TYPE_ALREADY_GONE,
  CHORE_TYPE_DEACTIVATE_CONFIRM,
  CHORE_TYPE_DELETE_CONFIRM,
  CHORE_TYPE_DESCRIPTION_MAX_LENGTH,
  CHORE_TYPE_IN_USE_DEACTIVATED,
  CHORE_TYPE_NAME_HINT,
  CHORE_TYPE_NAME_MAX_LENGTH,
  CHORE_TYPE_NO_LONGER_EXISTS,
  CHORE_TYPE_PRICE_CHANGE_NOTE,
  choreTypeNameTakenMessage,
  getMessage,
  normalizeChoreName,
  normalizeDescription,
  validateUnitPrice,
} from '@housework/shared';
import {
  ApiFailure,
  createChoreType,
  deleteChoreType,
  listChoreTypes,
  setChoreTypeActive,
  updateChoreType,
} from '../api/client';
import type { Authorized } from '../hooks/useSession';
import { ErrorRetry } from './ErrorRetry';

interface Props {
  role: Role;
  authorized: Authorized;
  onBack: () => void;
}

type Loaded<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; value: T };
type FormTarget = { mode: 'create' } | { mode: 'edit'; choreType: ChoreType };
type Confirming = { kind: 'deactivate' | 'delete'; choreType: ChoreType };

function isRetryable(e: unknown): boolean {
  return !(e instanceof ApiFailure) || e.status === 0 || e.status >= 500;
}

function failureMessage(e: unknown): string {
  return getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL');
}

/** 画面の入力欄の文字を単価の候補にする。数字の形でなければ NaN（共有の確かめで断られる）。 */
function parseUnitPriceText(text: string): number {
  const trimmed = text.trim();
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** F1〜F6: お手伝いの種類の一覧と、管理者だけの登録・変更・使う／使わない・消す。 */
export function ChoreTypesPage({ role, authorized, onBack }: Props) {
  const isAdmin = role === 'admin';
  const [list, setList] = useState<Loaded<ChoreType[]>>({ kind: 'loading' });
  const [form, setForm] = useState<FormTarget | undefined>(undefined);
  const [confirming, setConfirming] = useState<Confirming | undefined>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const fetchList = useCallback(async (): Promise<Loaded<ChoreType[]>> => {
    try {
      return { kind: 'ready', value: await authorized(listChoreTypes) };
    } catch {
      return { kind: 'error' };
    }
  }, [authorized]);
  useEffect(() => {
    let active = true;
    void fetchList().then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [fetchList]);

  /** 表示中の一覧は残したまま読み直す（通知の文言を消さない）。 */
  async function refresh() {
    setList(await fetchList());
  }
  async function reload() {
    setList({ kind: 'loading' });
    await refresh();
  }

  async function toggleActive(choreType: ChoreType, active: boolean) {
    setConfirming(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      await authorized((token) => setChoreTypeActive(token, choreType.choreTypeId, active));
      await refresh();
    } catch (e) {
      setNotice(failureMessage(e));
      if (e instanceof ApiFailure && e.status === 404) await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(choreType: ChoreType) {
    setConfirming(undefined);
    setNotice(undefined);
    setBusy(true);
    try {
      await authorized((token) => deleteChoreType(token, choreType.choreTypeId));
      await refresh();
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 409 && e.reason === 'CHORE_TYPE_IN_USE') {
        setNotice(CHORE_TYPE_IN_USE_DEACTIVATED);
        await refresh();
      } else if (e instanceof ApiFailure && e.status === 404) {
        setNotice(CHORE_TYPE_ALREADY_GONE);
        await refresh();
      } else {
        setNotice(failureMessage(e));
        if (e instanceof ApiFailure && e.status === 409) await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function renderBody() {
    if (list.kind === 'loading') return <CircularProgress aria-label="読み込み中" />;
    if (list.kind === 'error') return <ErrorRetry onRetry={() => void reload()} />;
    const active = list.value.filter((c) => c.active);
    const inactive = list.value.filter((c) => !c.active);
    const row = (c: ChoreType) => (
      <ChoreTypeRow
        key={c.choreTypeId}
        choreType={c}
        isAdmin={isAdmin}
        busy={busy}
        onEdit={() => {
          setNotice(undefined);
          setForm({ mode: 'edit', choreType: c });
        }}
        onDeactivate={() => setConfirming({ kind: 'deactivate', choreType: c })}
        onActivate={() => void toggleActive(c, true)}
        onDelete={() => setConfirming({ kind: 'delete', choreType: c })}
      />
    );
    return (
      <>
        <Stack component="ul" spacing={1} sx={{ p: 0, m: 0 }} data-testid="active-chore-types">
          {active.map(row)}
        </Stack>
        {inactive.length > 0 && (
          <Stack spacing={1} data-testid="inactive-chore-types">
            <Typography component="h2" variant="h6">
              使わない
            </Typography>
            <Stack component="ul" spacing={1} sx={{ p: 0, m: 0 }}>
              {inactive.map(row)}
            </Stack>
          </Stack>
        )}
        {list.value.length === 0 && (
          <Typography data-testid="empty-message">まだ種類がありません</Typography>
        )}
      </>
    );
  }

  return (
    <Stack spacing={2} data-testid="chore-types-page">
      <Typography component="h1" variant="h5">
        お手伝いの種類
      </Typography>
      {notice && (
        <Typography color="error" role="alert" data-testid="chore-type-notice">
          {notice}
        </Typography>
      )}
      {renderBody()}
      {confirming && (
        <Stack
          spacing={1}
          role="alertdialog"
          aria-label={confirming.kind === 'delete' ? '消す確かめ' : '使わない確かめ'}
          data-testid={`${confirming.kind}-confirm`}
        >
          <Typography>
            {confirming.kind === 'delete'
              ? CHORE_TYPE_DELETE_CONFIRM
              : CHORE_TYPE_DEACTIVATE_CONFIRM}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() =>
                void (confirming.kind === 'delete'
                  ? remove(confirming.choreType)
                  : toggleActive(confirming.choreType, false))
              }
              data-testid={`${confirming.kind}-confirm-button`}
            >
              {confirming.kind === 'delete' ? '消す' : '使わないにする'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => setConfirming(undefined)}
              data-testid="confirm-cancel-button"
            >
              やめる
            </Button>
          </Stack>
        </Stack>
      )}
      {isAdmin && form && (
        <ChoreTypeForm
          key={form.mode === 'edit' ? form.choreType.choreTypeId : 'create'}
          target={form}
          authorized={authorized}
          onClose={() => setForm(undefined)}
          onSaved={() => {
            setForm(undefined);
            void refresh();
          }}
          onGone={() => {
            setForm(undefined);
            setNotice(CHORE_TYPE_NO_LONGER_EXISTS);
            void refresh();
          }}
        />
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {isAdmin && !form && (
          <Button
            variant="contained"
            onClick={() => {
              setNotice(undefined);
              setForm({ mode: 'create' });
            }}
            data-testid="add-button"
          >
            追加
          </Button>
        )}
        <Button variant="outlined" onClick={onBack} data-testid="back-button">
          家族の設定へ戻る
        </Button>
      </Stack>
    </Stack>
  );
}

interface RowProps {
  choreType: ChoreType;
  isAdmin: boolean;
  busy: boolean;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

/** 名前と説明は文字として出す（タグとして扱わない）。説明の改行はそのまま出す（pre-wrap）。 */
function ChoreTypeRow({
  choreType,
  isAdmin,
  busy,
  onEdit,
  onDeactivate,
  onActivate,
  onDelete,
}: RowProps) {
  return (
    <Stack
      component="li"
      spacing={0.5}
      sx={{ listStyle: 'none', alignItems: 'flex-start' }}
      data-testid="chore-type-row"
    >
      <Typography data-testid="chore-type-title" sx={{ overflowWrap: 'anywhere' }}>
        <span data-testid="chore-type-name">{choreType.name}</span>
        {'\u3000'}
        <span data-testid="chore-type-price">{choreType.unitPrice} 円</span>
        {!choreType.active && (
          <Typography component="span" color="text.secondary" data-testid="inactive-label">
            {'\u3000'}（使わない）
          </Typography>
        )}
      </Typography>
      {choreType.description && (
        <Typography
          color="text.secondary"
          data-testid="chore-type-description"
          sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        >
          {choreType.description}
        </Typography>
      )}
      {isAdmin && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={onEdit} data-testid="edit-button">
            変更
          </Button>
          {choreType.active ? (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={onDeactivate}
              data-testid="deactivate-button"
            >
              使わない
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={onActivate}
              data-testid="activate-button"
            >
              使う
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={busy}
            onClick={onDelete}
            data-testid="delete-button"
          >
            消す
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

interface FormProps {
  target: FormTarget;
  authorized: Authorized;
  onClose: () => void;
  onSaved: () => void;
  /** 変更の保存が 404 になった（種類がもうない）とき */
  onGone: () => void;
}

interface FieldErrors {
  name?: string;
  unitPrice?: string;
  description?: string;
  general?: string;
}

/** F2・F3: 登録と変更の入力欄。確かめに通らないときは、入力はそのまま残して欄の下に文言を出す（AC2.1.2）。 */
function ChoreTypeForm({ target, authorized, onClose, onSaved, onGone }: FormProps) {
  const editing = target.mode === 'edit' ? target.choreType : undefined;
  const [name, setName] = useState(editing?.name ?? '');
  const [unitPrice, setUnitPrice] = useState(editing ? String(editing.unitPrice) : '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  // 登録の操作ごとの識別子。通信の失敗で送り直すときだけ同じ値を使い、入力を変えたら作り直す
  const keyRef = useRef<string | undefined>(undefined);

  function edit(setter: (value: string) => void) {
    return (value: string) => {
      keyRef.current = undefined;
      setter(value);
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checkedName = normalizeChoreName(name);
    const checkedPrice = validateUnitPrice(parseUnitPriceText(unitPrice));
    const checkedDescription = normalizeDescription(description);
    if (!checkedName.ok || !checkedPrice.ok || !checkedDescription.ok) {
      setErrors({
        ...(!checkedName.ok ? { name: getMessage(checkedName.reason) } : {}),
        ...(!checkedPrice.ok ? { unitPrice: getMessage(checkedPrice.reason) } : {}),
        ...(!checkedDescription.ok ? { description: getMessage(checkedDescription.reason) } : {}),
      });
      return;
    }
    const input: ChoreTypeInput = {
      name: checkedName.value,
      unitPrice: checkedPrice.value,
      ...(checkedDescription.value !== undefined ? { description: checkedDescription.value } : {}),
    };
    setErrors({});
    setSaving(true);
    try {
      if (editing) {
        await authorized((token) => updateChoreType(token, editing.choreTypeId, input));
      } else {
        keyRef.current ??= crypto.randomUUID();
        const key = keyRef.current;
        await authorized((token) => createChoreType(token, input, key));
      }
      keyRef.current = undefined;
      onSaved();
    } catch (e) {
      if (!isRetryable(e)) keyRef.current = undefined;
      if (editing && e instanceof ApiFailure && e.status === 404) {
        // 変更している間に、ほかの人が種類を消していた。フォームを閉じ、一覧を読み直して知らせる
        onGone();
        return;
      }
      setErrors(toFieldErrors(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack component="form" spacing={2} onSubmit={submit} noValidate data-testid="chore-type-form">
      <Typography component="h2" variant="h6">
        {editing ? '種類を変える' : '種類を追加する'}
      </Typography>
      <TextField
        label="名前"
        value={name}
        onChange={(e) => edit(setName)(e.target.value)}
        error={errors.name !== undefined}
        slotProps={{
          htmlInput: { maxLength: CHORE_TYPE_NAME_MAX_LENGTH + 10, 'data-testid': 'name-input' },
        }}
      />
      <FieldError message={errors.name} testId="name-error" />
      <Typography variant="body2" color="text.secondary" data-testid="name-hint">
        {CHORE_TYPE_NAME_HINT}
      </Typography>
      <TextField
        label="単価（円）"
        value={unitPrice}
        onChange={(e) => edit(setUnitPrice)(e.target.value)}
        error={errors.unitPrice !== undefined}
        slotProps={{
          htmlInput: { inputMode: 'numeric', 'data-testid': 'unit-price-input' },
        }}
      />
      <FieldError message={errors.unitPrice} testId="unit-price-error" />
      {editing && (
        <Typography variant="body2" color="text.secondary" data-testid="price-change-note">
          {CHORE_TYPE_PRICE_CHANGE_NOTE}
        </Typography>
      )}
      <TextField
        label="説明（なくてもかまいません）"
        value={description}
        multiline
        minRows={2}
        onChange={(e) => edit(setDescription)(e.target.value)}
        error={errors.description !== undefined}
        slotProps={{
          htmlInput: {
            maxLength: CHORE_TYPE_DESCRIPTION_MAX_LENGTH + 20,
            'data-testid': 'description-input',
          },
        }}
      />
      <FieldError message={errors.description} testId="description-error" />
      {errors.general && (
        <Typography color="error" role="alert" data-testid="form-error">
          {errors.general}
        </Typography>
      )}
      <Stack direction="row" spacing={1}>
        <Button type="submit" variant="contained" disabled={saving} data-testid="save-button">
          保存
        </Button>
        <Button variant="outlined" onClick={onClose} data-testid="form-cancel-button">
          やめる
        </Button>
      </Stack>
    </Stack>
  );
}

function FieldError({ message, testId }: { message: string | undefined; testId: string }) {
  if (!message) return null;
  return (
    <Typography color="error" role="alert" data-testid={testId}>
      {message}
    </Typography>
  );
}

/** 裏側の断りを、入力欄の下の文言にする。名前の重なりは、相手が「使う」かで文言を分ける（BR5.3）。 */
function toFieldErrors(e: unknown): FieldErrors {
  if (!(e instanceof ApiFailure)) return { general: getMessage('INTERNAL') };
  const reason: Reason = e.reason;
  switch (reason) {
    case 'INVALID_CHORE_TYPE_NAME':
      return { name: getMessage(reason) };
    case 'CHORE_TYPE_NAME_TAKEN':
      return { name: choreTypeNameTakenMessage(e.details?.conflictActive !== false) };
    case 'INVALID_UNIT_PRICE':
      return { unitPrice: getMessage(reason) };
    case 'INVALID_DESCRIPTION':
      return { description: getMessage(reason) };
    default:
      return { general: getMessage(reason) };
  }
}
