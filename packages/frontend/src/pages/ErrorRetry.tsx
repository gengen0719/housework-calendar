import { Button, Stack, Typography } from '@mui/material';
import { MESSAGES } from '@housework/shared';

interface Props {
  onRetry: () => void;
  /** ボタンの文字（省略すると「読み込み直す」） */
  label?: string;
}

/** 503 や通信の失敗のとき（NFR2.4）。 */
export function ErrorRetry({ onRetry, label = '読み込み直す' }: Props) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="error-retry" role="alert">
      <Typography>{MESSAGES.SERVICE_TEMPORARILY_UNAVAILABLE}</Typography>
      <Button variant="contained" onClick={onRetry} data-testid="retry-button">
        {label}
      </Button>
    </Stack>
  );
}
