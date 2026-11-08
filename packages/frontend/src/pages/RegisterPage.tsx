import { Button, Stack, Typography } from '@mui/material';
import { MESSAGES } from '@housework/shared';

function addFriendUrl(): string {
  const oaId = import.meta.env.VITE_LINE_OA_ID;
  return oaId ? `https://line.me/R/ti/p/${encodeURIComponent(oaId)}` : 'https://line.me/R/';
}

/** 友だちでない人には、友だち登録の案内だけを出す（BR1.5）。 */
export function RegisterPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="register-page">
      <Typography component="h1" variant="h5">
        {MESSAGES.NOT_FRIEND}
      </Typography>
      <Button
        variant="contained"
        href={addFriendUrl()}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="add-friend-button"
      >
        友だち追加する
      </Button>
    </Stack>
  );
}
