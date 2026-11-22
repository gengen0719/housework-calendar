import { useId, useState } from 'react';
import { Button, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import {
  NO_DUTY_LABEL,
  getMessage,
  isEditableMonth,
  type CalendarChild,
  type Duty,
} from '@housework/shared';
import { AdhocDutyForm } from '../components/AdhocDutyForm';
import { ApiFailure, changeDutyChild } from '../api/client';
import { STATUS_LABEL, childName, formatTimeJst, longDayLabel } from '../calendar/format';
import { DutyRecordAction } from '../components/DutyRecordAction';
import { DutyStatusActions } from '../components/DutyStatusActions';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';

const STATUS_COLOR = {
  todo: colors.statusTodo,
  done: colors.statusDone,
  skipped: colors.statusSkipped,
} as const;

interface Props {
  date: string;
  duties: readonly Duty[];
  children: readonly CalendarChild[];
  isAdmin: boolean;
  authorized: Authorized;
  /** いまログインしている利用者の ID（自分の担当だけに「やった」を出す。U6） */
  currentUserId?: string;
  /** この月が確定しているか（確定した月は記録できない。U6）。省略時は未確定として扱う */
  confirmed?: boolean;
  /** 裏側の日本時間の今日（明日以降の判断。端末の時計は使わない。U6）。省略時は記録のボタンは出さない */
  today?: string;
  /** 担当の子供を変えられたとき、または記録できたとき（応答の担当で画面を差し替える） */
  onChanged: (duty: Duty) => void;
  /** 変更・記録が断られたとき、見えている画面は残したまま読み直す */
  onRefresh: () => void;
  onClose: () => void;
}

/** 日の詳細: 種類・子供・状態・記録した時刻（日本時間）・記録した人（AC4.1.2）。管理者だけ「未」の担当の子供を変えられる（AC3.1.2）。子供は自分の「未」の担当を記録できる（U6）。 */
export function DayDetail({
  date,
  duties,
  children: kids,
  isAdmin,
  authorized,
  currentUserId,
  confirmed = false,
  today = '',
  onChanged,
  onRefresh,
  onClose,
}: Props) {
  const [adding, setAdding] = useState(false);
  const canAdd =
    isAdmin &&
    !confirmed &&
    Boolean(today) &&
    date >= today &&
    isEditableMonth(date.slice(0, 7), today);
  return (
    <Stack
      component="section"
      spacing={1.5}
      aria-labelledby="day-detail-heading"
      data-testid="day-detail"
      sx={{ p: 2, border: '1px solid', borderColor: 'text.secondary', bgcolor: 'background.paper' }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h3" variant="h6" id="day-detail-heading">
          {longDayLabel(date)}
        </Typography>
        <IconButton
          aria-label="日の詳細を閉じる"
          onClick={onClose}
          data-testid="day-detail-close"
          sx={{ flexShrink: 0, width: 32, height: 32 }}
        >
          ×
        </IconButton>
      </Stack>
      {duties.length === 0 && <Typography>{NO_DUTY_LABEL}</Typography>}
      {duties.map((duty, index) => (
        <DutyDetail
          key={duty.dutyId}
          duty={duty}
          separated={isAdmin && index > 0}
          kids={kids}
          isAdmin={isAdmin}
          authorized={authorized}
          currentUserId={currentUserId}
          confirmed={confirmed}
          today={today}
          onChanged={onChanged}
          onRefresh={onRefresh}
        />
      ))}
      {canAdd && !adding && (
        <Button data-testid="add-adhoc-duty-button" onClick={() => setAdding(true)}>
          <span aria-hidden="true">＋</span> 臨時のお手伝いを依頼
        </Button>
      )}
      {canAdd && adding && (
        <AdhocDutyForm
          key={date}
          date={date}
          children={kids}
          authorized={authorized}
          onSaved={() => {
            setAdding(false);
            onRefresh();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </Stack>
  );
}

interface DutyProps {
  duty: Duty;
  separated: boolean;
  kids: readonly CalendarChild[];
  isAdmin: boolean;
  authorized: Authorized;
  currentUserId?: string;
  confirmed: boolean;
  today: string;
  onChanged: (duty: Duty) => void;
  onRefresh: () => void;
}

function DutyDetail({
  duty,
  separated,
  kids,
  isAdmin,
  authorized,
  currentUserId,
  confirmed,
  today,
  onChanged,
  onRefresh,
}: DutyProps) {
  const menuId = useId();
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null);
  const [changing, setChanging] = useState(false);
  const [selected, setSelected] = useState(duty.childUserId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const changed = await authorized((token) => changeDutyChild(token, duty.dutyId, selected));
      setChanging(false);
      onChanged(changed);
    } catch (e) {
      setError(getMessage(e instanceof ApiFailure ? e.reason : 'INTERNAL'));
      // 担当の状態が変わっていたときは、画面の担当を最新にする
      if (e instanceof ApiFailure && e.status >= 400 && e.status < 500) onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack
      spacing={0.5}
      data-testid="day-detail-duty"
      sx={{
        overflowWrap: 'anywhere',
        ...(separated && { borderTop: 1, borderColor: 'divider', pt: 1.5 }),
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography component="h4" variant="subtitle1" data-testid="detail-chore">
          {duty.choreName}
          {duty.adhoc && (isAdmin ? <Chip label="臨時" size="small" sx={{ ml: 1 }} /> : '（臨時）')}
        </Typography>
        {isAdmin && (
          <IconButton
            aria-label={`${duty.choreName}${duty.adhoc ? '（臨時）' : ''}の操作`}
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
            aria-controls={menuAnchor ? menuId : undefined}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            data-testid="duty-actions-menu-button"
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          >
            ⋯
          </IconButton>
        )}
      </Stack>
      <Stack
        direction={isAdmin ? 'row' : 'column'}
        spacing={0.5}
        sx={{ justifyContent: 'space-between', alignItems: isAdmin ? 'center' : 'stretch' }}
      >
        <Typography>
          {isAdmin ? '担当' : '子供'}:{' '}
          <span data-testid="detail-child">{childName(kids, duty.childUserId)}</span>
        </Typography>
        {isAdmin ? (
          <Chip
            label={STATUS_LABEL[duty.status]}
            aria-label={`状態: ${STATUS_LABEL[duty.status]}`}
            size="small"
            variant="outlined"
            data-testid="detail-status"
            sx={{ color: STATUS_COLOR[duty.status], fontWeight: 'bold', flexShrink: 0 }}
          />
        ) : (
          <Typography>
            状態:{' '}
            <strong data-testid="detail-status" style={{ color: STATUS_COLOR[duty.status] }}>
              {STATUS_LABEL[duty.status]}
            </strong>
          </Typography>
        )}
      </Stack>
      {duty.recordedAt && (
        <Typography>
          記録した時刻: <span data-testid="detail-time">{formatTimeJst(duty.recordedAt)}</span>
        </Typography>
      )}
      {duty.recordedByName && (
        <Typography>
          記録した人: <span data-testid="detail-recorder">{duty.recordedByName}</span>
        </Typography>
      )}
      <DutyRecordAction
        duty={duty}
        confirmed={confirmed}
        today={today}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        authorized={authorized}
        onChanged={onChanged}
        onRefresh={onRefresh}
      />
      {isAdmin && (
        <DutyStatusActions
          duty={duty}
          kids={kids}
          anchorEl={menuAnchor}
          menuId={menuId}
          onCloseMenu={() => setMenuAnchor(null)}
          onChangeChild={
            duty.status === 'todo' && !changing
              ? () => {
                  setSelected(duty.childUserId);
                  setError(undefined);
                  setChanging(true);
                }
              : undefined
          }
          authorized={authorized}
          onChanged={onChanged}
          onRefresh={onRefresh}
        />
      )}
      {isAdmin && changing && duty.status === 'todo' && (
        <Stack spacing={1}>
          <TextField
            select
            label="担当の子供"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            slotProps={{
              select: { native: true },
              htmlInput: { 'data-testid': 'change-child-select' },
            }}
          >
            {kids.map((kid) => (
              <option key={kid.userId} value={kid.userId}>
                {kid.displayName}
              </option>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => void submit()}
              data-testid="change-child-confirm-button"
            >
              変更する
            </Button>
            <Button
              variant="outlined"
              onClick={() => setChanging(false)}
              data-testid="change-child-cancel-button"
            >
              やめる
            </Button>
          </Stack>
        </Stack>
      )}
      {error && (
        <Typography color="error" role="alert" data-testid="change-error">
          {error}
        </Typography>
      )}
    </Stack>
  );
}
