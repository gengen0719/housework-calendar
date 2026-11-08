import { Button, Stack, Typography } from '@mui/material';
import { MESSAGES } from '@housework/shared';

interface Props {
  onRetry: () => void;
}

/** 503 や通信の失敗のとき（NFR2.4）。 */
export function ErrorRetry({ onRetry }: Props) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="error-retry" role="alert">
      <Typography>{MESSAGES.SERVICE_TEMPORARILY_UNAVAILABLE}</Typography>
      <Button variant="contained" onClick={onRetry} data-testid="retry-button">
        読み込み直す
      </Button>
    </Stack>
  );
}
