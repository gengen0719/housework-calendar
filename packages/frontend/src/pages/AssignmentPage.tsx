import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import {
  ASSIGNMENT_SAVE_FAILED,
  ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE,
  COPY_LAST_MONTH_LABEL,
  COPY_LAST_MONTH_NONE,
  COPY_LAST_MONTH_SKIPPED_INACTIVE,
  assignmentOverlapMessage,
  getMessage,
  shiftMonth,
  type AssignmentRule,
  type ChoreType,
  type MonthCalendar,
  type OverlapItem,
  type OverwriteChange,
} from '@housework/shared';
import { ApiFailure, getAssignment, listChoreTypes, saveAssignment } from '../api/client';
import { WEEKDAY_NAMES, childName, monthHeading } from '../calendar/format';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';
import { ErrorRetry } from './ErrorRetry';

// 上書きの確認は、出すときだけ読み込む
const OverwriteConfirmDialog = lazy(() =>
  import('../components/OverwriteConfirmDialog').then((m) => ({
    default: m.OverwriteConfirmDialog,
  })),
);

interface Props {
  month: string;
  calendar: MonthCalendar;
  authorized: Authorized;
  onSaved: (saved: MonthCalendar) => void;
  onCancel: () => void;
}

interface Row {
  key: number;
  choreTypeId: string;
  childUserId: string;
  weekdays: number[];
}

interface PendingOverwrite {
  changes: OverwriteChange[];
  changesHash: string;
  /** 確かめを出したときの入力。送り直しはこの内容で行う */
  rules: AssignmentRule[];
}

type Loaded = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; types: ChoreType[] };

/** 曜日の並び（月曜はじまり）。値は 0=日曜〜6=土曜 */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const INCOMPLETE_ROW_MESSAGE = '子供と曜日を選んでください';
const INACTIVE_NOTE = '使わないお手伝いです。割り当てから外してください';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readOverlaps(details: Record<string, unknown> | undefined): OverlapItem[] {
  const raw = details?.overlaps;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is OverlapItem =>
      isRecord(item) && typeof item.date === 'string' && typeof item.choreTypeId === 'string',
  );
}

function readOverwrite(
  details: Record<string, unknown> | undefined,
): { changes: OverwriteChange[]; changesHash: string } | undefined {
  const raw = details?.changes;
  const hash = details?.changesHash;
  if (!Array.isArray(raw) || typeof hash !== 'string') return undefined;
  const changes = raw.filter(
    (item): item is OverwriteChange =>
      isRecord(item) && typeof item.date === 'string' && typeof item.choreTypeId === 'string',
  );
  return { changes, changesHash: hash };
}

/** 月の割り当て（種類ごとの子供と曜日）の入力と保存（AC3.1.1、AC3.1.4〜AC3.1.7、BR6.17） */
export function AssignmentPage({ month, calendar, authorized, onSaved, onCancel }: Props) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });
  const [rows, setRows] = useState<Row[]>([]);
  const [overlaps, setOverlaps] = useState<OverlapItem[]>([]);
  const [pending, setPending] = useState<PendingOverwrite | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [copyResult, setCopyResult] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const nextKey = useRef(1);

  const makeRow = (rule: AssignmentRule): Row => ({
    key: nextKey.current++,
    choreTypeId: rule.choreTypeId,
    childUserId: rule.childUserId,
    weekdays: [...rule.weekdays].sort((a, b) => a - b),
  });

  useEffect(() => {
    const controller = new AbortController();
    // 月や読み直しの合図が変わるたびに、読み込み中の表示へ戻すのが目的
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded({ kind: 'loading' });
    Promise.all([
      authorized((token) => listChoreTypes(token)),
      authorized((token) => getAssignment(token, month, controller.signal)),
    ]).then(
      ([types, assignment]) => {
        if (controller.signal.aborted) return;
        setRows(assignment.rules.map(makeRow));
        setLoaded({ kind: 'ready', types });
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ kind: 'error' });
      },
    );
    return () => controller.abort();
    // makeRow は ref だけに頼るので、読み込みの条件に入れない
  }, [authorized, month, reloadCount]);

  const types = useMemo(() => (loaded.kind === 'ready' ? loaded.types : []), [loaded]);
  const typeName = (id: string): string => types.find((t) => t.choreTypeId === id)?.name ?? '';

  // 「使う」の種類はいつも出す。「使わない」の種類は、行が残っているときだけ印をつけて出す
  const sections = useMemo(
    () => types.filter((t) => t.active || rows.some((r) => r.choreTypeId === t.choreTypeId)),
    [types, rows],
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleWeekday(row: Row, weekday: number) {
    const weekdays = row.weekdays.includes(weekday)
      ? row.weekdays.filter((d) => d !== weekday)
      : [...row.weekdays, weekday];
    updateRow(row.key, { weekdays });
  }

  async function copyLastMonth() {
    setCopyResult(undefined);
    setError(undefined);
    try {
      const last = await authorized((token) => getAssignment(token, shiftMonth(month, -1)));
      if (!last.exists || last.rules.length === 0) {
        setCopyResult(COPY_LAST_MONTH_NONE);
        return;
      }
      const usable = last.rules.filter((r) =>
        types.some((t) => t.choreTypeId === r.choreTypeId && t.active),
      );
      setRows(usable.map(makeRow));
      setOverlaps([]);
      if (usable.length < last.rules.length) setCopyResult(COPY_LAST_MONTH_SKIPPED_INACTIVE);
    } catch (e) {
      setError(getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL'));
    }
  }

  async function submit(rules: AssignmentRule[], confirmedChangesHash?: string) {
    setBusy(true);
    setError(undefined);
    setOverlaps([]);
    try {
      const saved = await authorized((token) =>
        saveAssignment(token, month, {
          rules,
          ...(confirmedChangesHash ? { confirmedChangesHash } : {}),
        }),
      );
      setPending(undefined);
      onSaved(saved);
    } catch (e) {
      if (!(e instanceof ApiFailure)) {
        setError(getMessage('INTERNAL'));
      } else if (e.reason === 'ASSIGNMENT_OVERLAP') {
        setPending(undefined);
        setOverlaps(readOverlaps(e.details));
        setError(getMessage(e.reason));
      } else if (e.reason === 'OVERWRITE_CONFIRMATION_REQUIRED') {
        const found = readOverwrite(e.details);
        if (found) setPending({ ...found, rules });
        else setError(getMessage(e.reason));
      } else if (e.status >= 500) {
        setPending(undefined);
        setError(`${ASSIGNMENT_SAVE_FAILED}。${ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE}`);
      } else {
        setPending(undefined);
        setError(getMessage(e.reason));
      }
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const incomplete = rows.some((r) => r.childUserId === '' || r.weekdays.length === 0);
    if (incomplete) {
      setOverlaps([]);
      setError(INCOMPLETE_ROW_MESSAGE);
      return;
    }
    const rules: AssignmentRule[] = sections.flatMap((t) =>
      rows
        .filter((r) => r.choreTypeId === t.choreTypeId)
        .map((r) => ({
          choreTypeId: r.choreTypeId,
          childUserId: r.childUserId,
          weekdays: [...r.weekdays].sort((a, b) => a - b),
        })),
    );
    void submit(rules);
  }

  if (loaded.kind === 'loading') {
    return (
      <div role="status" data-testid="assignment-loading">
        <CircularProgress aria-hidden />
        <Typography>読み込み中…</Typography>
      </div>
    );
  }
  if (loaded.kind === 'error') {
    return (
      <Stack spacing={2} data-testid="assignment-page">
        <ErrorRetry onRetry={() => setReloadCount((n) => n + 1)} />
        <Button variant="outlined" onClick={onCancel} data-testid="assignment-cancel-button">
          戻る
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} data-testid="assignment-page">
      <Typography component="h2" variant="h6">
        {monthHeading(month)}の割り当て
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() => void copyLastMonth()}
          data-testid="copy-last-month-button"
        >
          {COPY_LAST_MONTH_LABEL}
        </Button>
        <Button variant="outlined" onClick={onCancel} data-testid="assignment-cancel-button">
          戻る
        </Button>
      </Stack>
      {copyResult && (
        <Alert severity="info" role="status" data-testid="copy-result">
          {copyResult}
        </Alert>
      )}
      {sections.map((type) => (
        <Stack
          component="section"
          key={type.choreTypeId}
          spacing={1}
          data-testid="chore-section"
          sx={{ p: 1.5, border: '1px solid', borderColor: 'text.secondary' }}
        >
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            <span data-testid="chore-section-name">{type.name}</span>
            {!type.active && (
              <span data-testid="inactive-mark" style={{ marginLeft: 8, color: colors.errorMain }}>
                使わない
              </span>
            )}
          </Typography>
          {!type.active && (
            <Typography data-testid="inactive-note" sx={{ color: colors.errorMain }}>
              {INACTIVE_NOTE}
            </Typography>
          )}
          {rows
            .filter((r) => r.choreTypeId === type.choreTypeId)
            .map((row) => (
              <Stack key={row.key} spacing={1} data-testid="rule-row">
                <TextField
                  select
                  label="子供"
                  value={row.childUserId}
                  onChange={(e) => updateRow(row.key, { childUserId: e.target.value })}
                  slotProps={{
                    select: { native: true },
                    htmlInput: { 'data-testid': 'child-select' },
                    inputLabel: { shrink: true },
                  }}
                >
                  <option value="">選んでください</option>
                  {calendar.children.map((kid) => (
                    <option key={kid.userId} value={kid.userId}>
                      {kid.displayName}
                    </option>
                  ))}
                </TextField>
                <Stack
                  direction="row"
                  sx={{ flexWrap: 'wrap', gap: 0.5 }}
                  role="group"
                  aria-label="曜日"
                >
                  {WEEKDAY_ORDER.map((weekday) => (
                    <label
                      key={weekday}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        minWidth: 44,
                        minHeight: 44,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={row.weekdays.includes(weekday)}
                        onChange={() => toggleWeekday(row, weekday)}
                        data-testid={`weekday-${weekday}`}
                        style={{ width: 20, height: 20 }}
                      />
                      {WEEKDAY_NAMES[weekday]}
                    </label>
                  ))}
                </Stack>
                <Button
                  variant="outlined"
                  onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                  sx={{ alignSelf: 'flex-start' }}
                  data-testid="remove-row-button"
                >
                  この行を消す
                </Button>
              </Stack>
            ))}
          <Button
            variant="outlined"
            onClick={() =>
              setRows((current) => [
                ...current,
                makeRow({ choreTypeId: type.choreTypeId, childUserId: '', weekdays: [] }),
              ])
            }
            sx={{ alignSelf: 'flex-start' }}
            data-testid="add-row-button"
          >
            子供を足す
          </Button>
        </Stack>
      ))}
      {overlaps.length > 0 && (
        <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 3 }} role="alert">
          {overlaps.map((o) => (
            <li
              key={`${o.date}-${o.choreTypeId}`}
              data-testid="overlap-item"
              style={{ color: colors.errorMain }}
            >
              {assignmentOverlapMessage(o.date, typeName(o.choreTypeId))}
            </li>
          ))}
        </Stack>
      )}
      {error && overlaps.length === 0 && (
        <Typography color="error" role="alert" data-testid="save-error">
          {error}
        </Typography>
      )}
      {pending && (
        <Suspense fallback={<CircularProgress aria-label="読み込み中" />}>
          <OverwriteConfirmDialog
            changes={pending.changes}
            choreName={typeName}
            childName={(userId) => childName(calendar.children, userId)}
            busy={busy}
            onConfirm={() => void submit(pending.rules, pending.changesHash)}
            onCancel={() => setPending(undefined)}
          />
        </Suspense>
      )}
      <Button
        variant="contained"
        disabled={busy || pending !== undefined}
        onClick={save}
        sx={{ alignSelf: 'flex-start' }}
        data-testid="save-assignment-button"
      >
        保存
      </Button>
    </Stack>
  );
}
