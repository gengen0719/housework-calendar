import { useState } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { NO_DUTY_LABEL, getMessage, type CalendarChild, type Duty } from '@housework/shared';
import { ApiFailure, changeDutyChild } from '../api/client';
import { STATUS_LABEL, childName, formatTimeJst, longDayLabel } from '../calendar/format';
import { DutyRecordAction } from '../components/DutyRecordAction';
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
  return (
    <Stack
      component="section"
      spacing={1.5}
      aria-labelledby="day-detail-heading"
      data-testid="day-detail"
      sx={{ p: 2, border: '1px solid', borderColor: 'text.secondary', bgcolor: 'background.paper' }}
    >
      <Typography component="h3" variant="h6" id="day-detail-heading">
        {longDayLabel(date)}
      </Typography>
      {duties.length === 0 && <Typography>{NO_DUTY_LABEL}</Typography>}
      {duties.map((duty) => (
        <DutyDetail
          key={duty.dutyId}
          duty={duty}
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
      <Button
        variant="outlined"
        onClick={onClose}
        sx={{ alignSelf: 'flex-start' }}
        data-testid="day-detail-close"
      >
        閉じる
      </Button>
    </Stack>
  );
}

interface DutyProps {
  duty: Duty;
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
  kids,
  isAdmin,
  authorized,
  currentUserId,
  confirmed,
  today,
  onChanged,
  onRefresh,
}: DutyProps) {
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
    <Stack spacing={0.5} data-testid="day-detail-duty" sx={{ overflowWrap: 'anywhere' }}>
      <Typography component="h4" variant="subtitle1" data-testid="detail-chore">
        {duty.choreName}
      </Typography>
      <Typography>
        子供: <span data-testid="detail-child">{childName(kids, duty.childUserId)}</span>
      </Typography>
      <Typography>
        状態:{' '}
        <strong data-testid="detail-status" style={{ color: STATUS_COLOR[duty.status] }}>
          {STATUS_LABEL[duty.status]}
        </strong>
      </Typography>
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
      {isAdmin && duty.status === 'todo' && !changing && (
        <Button
          variant="outlined"
          onClick={() => {
            setSelected(duty.childUserId);
            setError(undefined);
            setChanging(true);
          }}
          sx={{ alignSelf: 'flex-start' }}
          data-testid="change-duty-button"
        >
          担当を変える
        </Button>
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
