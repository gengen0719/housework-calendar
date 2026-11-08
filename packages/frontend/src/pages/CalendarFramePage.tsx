import { Box, Stack, Typography } from '@mui/material';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface Props {
  familyName: string;
  /** 表示する月の基準（テストで固定するために受け取る。省略すると今日） */
  today?: Date;
}

/** 今月の空のカレンダーの枠と家族の名前（BR1.10）。お手伝いの表示は U3 以降。 */
export function CalendarFramePage({ familyName, today = new Date() }: Props) {
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
