import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { MESSAGES, NOTIFICATION_GROUP_HOWTO, type Role } from '@housework/shared';
import type { NotificationGroupState } from '../hooks/useNotificationGroup';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface Props {
  familyName: string;
  /** 表示する月の基準（テストで固定するために受け取る。省略すると今日） */
  today?: Date;
  /** 「家族の設定」へ進む（U2）。渡さなければボタンは出さない */
  onOpenSettings?: () => void;
  /** 自分の役割とお知らせ先の読み込み結果（U3）。管理者で、お知らせ先がないと分かったときだけ登録の案内を出す */
  role?: Role;
  notificationGroup?: NotificationGroupState;
}

/** 今月の空のカレンダーの枠と家族の名前（BR1.10）。お手伝いの表示は U3 以降。 */
export function CalendarFramePage({
  familyName,
  today = new Date(),
  onOpenSettings,
  role,
  notificationGroup,
}: Props) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Stack spacing={2} data-testid="calendar-frame-page">
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
      <Typography component="h2" variant="h6" data-testid="calendar-month">
        {year}年{month + 1}月
      </Typography>
      <Box
        data-testid="calendar-grid"
        role="grid"
        aria-label={`${year}年${month + 1}月のカレンダー`}
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}
      >
        {WEEKDAYS.map((day) => (
          <Box key={day} role="columnheader" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
            {day}
          </Box>
        ))}
        {cells.map((day, index) => {
          const isToday = day === today.getDate();
          return (
            <Box
              key={index}
              role="gridcell"
              aria-current={isToday ? 'date' : undefined}
              sx={{
                minHeight: 56,
                padding: '4px',
                border: '1px solid',
                borderColor: 'text.secondary',
                borderWidth: isToday ? '3px' : '1px',
                bgcolor: 'background.paper',
              }}
            >
              {day}
              {isToday && <span aria-label="今日"> ●</span>}
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
