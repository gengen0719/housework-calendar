import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  ListItemButton,
  Stack,
  Typography,
} from '@mui/material';
import {
  MESSAGES,
  MONTH_CONFIRMED_LABEL,
  NOTIFICATION_GROUP_HOWTO,
  NO_ASSIGNMENT_MESSAGE,
  NO_DUTY_LABEL,
  datesOfMonth,
  isEditableMonth,
  type Duty,
  type MonthCalendar,
  type Role,
} from '@housework/shared';
import { STATUS_LABEL, childName, dayLabel, monthHeading } from '../calendar/format';
import { DutyRecordAction } from '../components/DutyRecordAction';
import { useMonthCalendar } from '../hooks/useMonthCalendar';
import type { NotificationGroupState } from '../hooks/useNotificationGroup';
import type { Authorized } from '../hooks/useSession';
import { colors } from '../theme';
import { DayDetail } from './DayDetail';
import { ErrorRetry } from './ErrorRetry';

// 割り当ての画面は、使うときだけ読み込む（NFR1.x のバンドルの大きさ）
const AssignmentPage = lazy(() =>
  import('./AssignmentPage').then((m) => ({ default: m.AssignmentPage })),
);

const STATUS_COLOR = {
  todo: colors.statusTodo,
  done: colors.statusDone,
  skipped: colors.statusSkipped,
} as const;

interface Props {
  familyName: string;
  authorized: Authorized;
  /** いまログインしている利用者の ID（子供は自分の担当だけ記録できる。U6） */
  currentUserId?: string;
  /** 「家族の設定」へ進む（U2）。渡さなければボタンは出さない */
  onOpenSettings?: () => void;
  /** 自分の役割とお知らせ先の読み込み結果（U3）。管理者で、お知らせ先がないと分かったときだけ登録の案内を出す */
  role?: Role;
  notificationGroup?: NotificationGroupState;
}

/** 日ごとの縦のカレンダー（BR1.10、BR6.11〜BR6.16）。今日の位置や今月・来月の判断は、応答の today だけを使う。 */
export function CalendarPage({
  familyName,
  authorized,
  currentUserId,
  onOpenSettings,
  role,
  notificationGroup,
}: Props) {
  const { month, state, previous, next, reload, refresh, replace } = useMonthCalendar(authorized);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const isAdmin = role === 'admin';

  function move(go: () => void) {
    setSelectedDate(undefined);
    go();
  }

  function renderBody() {
    if (state.kind === 'loading') {
      return (
        <div role="status" data-testid="calendar-loading">
          <CircularProgress aria-hidden />
          <Typography>読み込み中…</Typography>
        </div>
      );
    }
    if (state.kind === 'error') return <ErrorRetry onRetry={reload} />;
    const calendar = state.value;
    const canEdit = isAdmin && !calendar.confirmed && isEditableMonth(month, calendar.today);
    if (editing) {
      return (
        <Suspense fallback={<CircularProgress aria-label="読み込み中" />}>
          <AssignmentPage
            month={month}
            calendar={calendar}
            authorized={authorized}
            onSaved={(saved) => {
              replace(saved);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </Suspense>
      );
    }
    return (
      <>
        {canEdit && (
          <Button
            variant="outlined"
            onClick={() => setEditing(true)}
            sx={{ alignSelf: 'flex-start' }}
            data-testid={
              calendar.hasAssignment ? 'edit-assignment-button' : 'enter-assignment-button'
            }
          >
            {calendar.hasAssignment ? '割り当てを変える' : '割り当てを入力する'}
          </Button>
        )}
        {calendar.hasAssignment ? (
          <DayList
            calendar={calendar}
            selectedDate={selectedDate}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            authorized={authorized}
            onSelect={(date) => setSelectedDate((current) => (current === date ? undefined : date))}
            onChanged={(duty) =>
              replace({
                ...calendar,
                duties: calendar.duties.map((d) => (d.dutyId === duty.dutyId ? duty : d)),
              })
            }
            onRefresh={refresh}
          />
        ) : (
          <Typography data-testid="no-assignment-message">{NO_ASSIGNMENT_MESSAGE}</Typography>
        )}
      </>
    );
  }

  return (
    <Stack spacing={2} data-testid="calendar-page">
      <Typography component="h1" variant="h5" data-testid="family-name">
        {familyName}
      </Typography>
      {onOpenSettings && (
        <Button
          variant="outlined"
          onClick={onOpenSettings}
          sx={{ alignSelf: 'flex-start' }}
          data-testid="open-settings-button"
        >
          家族の設定
        </Button>
      )}
      {/* 子供には出さない（BR4.11）。子供の画面は API も呼ばない（App が管理者のときだけ読む） */}
      {role === 'admin' &&
        notificationGroup?.kind === 'ready' &&
        notificationGroup.value === null && (
          <Alert severity="info" role="status" data-testid="notification-group-hint">
            <Typography component="p" sx={{ fontWeight: 'bold' }}>
              {MESSAGES.NOTIFICATION_GROUP_NOT_REGISTERED}
            </Typography>
            <Typography component="p">{NOTIFICATION_GROUP_HOWTO}</Typography>
          </Alert>
        )}
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Button variant="outlined" onClick={() => move(previous)} data-testid="prev-month-button">
          前の月
        </Button>
        <Typography component="h2" variant="h6" data-testid="calendar-month">
          {monthHeading(month)}
        </Typography>
        <Button variant="outlined" onClick={() => move(next)} data-testid="next-month-button">
          次の月
        </Button>
      </Stack>
      {state.kind === 'ready' && state.value.confirmed && (
        <Typography
          sx={{ color: colors.confirmedText, fontWeight: 'bold' }}
          data-testid="confirmed-label"
        >
          {MONTH_CONFIRMED_LABEL}
        </Typography>
      )}
      {renderBody()}
    </Stack>
  );
}

interface DayListProps {
  calendar: MonthCalendar;
  selectedDate: string | undefined;
  isAdmin: boolean;
  currentUserId?: string;
  authorized: Authorized;
  onSelect: (date: string) => void;
  onChanged: (duty: Duty) => void;
  onRefresh: () => void;
}

function DayList({
  calendar,
  selectedDate,
  isAdmin,
  currentUserId,
  authorized,
  onSelect,
  onChanged,
  onRefresh,
}: DayListProps) {
  const byDate = useMemo(() => {
    const map = new Map<string, Duty[]>();
    for (const duty of calendar.duties) map.set(duty.date, [...(map.get(duty.date) ?? []), duty]);
    return map;
  }, [calendar.duties]);

  // 今日の位置は、最初に見えたときに 1 回だけ見せる
  const todayRef = useRef<HTMLLIElement | null>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !todayRef.current) return;
    scrolled.current = true;
    todayRef.current.scrollIntoView?.({ block: 'center' });
  });

  return (
    <>
      {selectedDate && (
        <DayDetail
          date={selectedDate}
          duties={byDate.get(selectedDate) ?? []}
          children={calendar.children}
          isAdmin={isAdmin}
          authorized={authorized}
          currentUserId={currentUserId}
          confirmed={calendar.confirmed}
          today={calendar.today}
          onChanged={onChanged}
          onRefresh={onRefresh}
          onClose={() => onSelect(selectedDate)}
        />
      )}
      <Box
        component="ol"
        aria-label={`${monthHeading(calendar.month)}の日ごとの担当`}
        data-testid="calendar-grid"
        sx={{ listStyle: 'none', p: 0, m: 0 }}
      >
        {datesOfMonth(calendar.month).map((date) => {
          const duties = byDate.get(date) ?? [];
          const isToday = date === calendar.today;
          return (
            <Box
              component="li"
              key={date}
              ref={isToday ? todayRef : undefined}
              aria-current={isToday ? 'date' : undefined}
              data-testid="day-row"
              data-date={date}
              sx={{ borderBottom: '1px solid', borderColor: 'text.secondary' }}
            >
              <ListItemButton
                onClick={() => onSelect(date)}
                selected={date === selectedDate}
                sx={{ alignItems: 'flex-start', gap: 2, bgcolor: 'background.paper' }}
              >
                <Box sx={{ minWidth: 72, fontWeight: 'bold' }}>
                  <span data-testid="day-label">{dayLabel(date)}</span>
                  {isToday && (
                    <Box
                      component="span"
                      data-testid="today-mark"
                      sx={{ display: 'block', color: 'primary.main' }}
                    >
                      ● 今日
                    </Box>
                  )}
                </Box>
                <Stack spacing={0.5} sx={{ overflowWrap: 'anywhere' }}>
                  {duties.length === 0 && <span>{NO_DUTY_LABEL}</span>}
                  {duties.map((duty) => (
                    <span
                      key={duty.dutyId}
                      data-testid="duty-item"
                      style={{ color: STATUS_COLOR[duty.status] }}
                    >
                      {`${duty.choreName}=${childName(calendar.children, duty.childUserId)}(${STATUS_LABEL[duty.status]})`}
                    </span>
                  ))}
                </Stack>
              </ListItemButton>
              {/* 自分の担当の「やった」ボタン・記録できない理由（BR7.10）。ボタンは行の外に置く（入れ子の押しボタンを避ける） */}
              {duties.some(
                (duty) => !isAdmin && duty.childUserId === currentUserId && duty.status !== 'done',
              ) && (
                <Stack spacing={0.5} sx={{ px: 2, pb: 1 }} data-testid="day-record-actions">
                  {duties
                    .filter((duty) => !isAdmin && duty.childUserId === currentUserId)
                    .map((duty) => (
                      <DutyRecordAction
                        key={duty.dutyId}
                        duty={duty}
                        confirmed={calendar.confirmed}
                        today={calendar.today}
                        currentUserId={currentUserId}
                        isAdmin={isAdmin}
                        authorized={authorized}
                        showChoreName
                        onChanged={onChanged}
                        onRefresh={onRefresh}
                      />
                    ))}
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
    </>
  );
}
