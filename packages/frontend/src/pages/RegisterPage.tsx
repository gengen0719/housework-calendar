import { Button, Stack, Typography } from '@mui/material';
import { INVITATION_NOT_FRIEND_HINT, MESSAGES } from '@housework/shared';

function addFriendUrl(): string {
  const oaId = import.meta.env.VITE_LINE_OA_ID;
  return oaId ? `https://line.me/R/ti/p/${encodeURIComponent(oaId)}` : 'https://line.me/R/';
}

interface Props {
  /** 招待のリンクから来たとき true（BR3.10） */
  fromInvitation?: boolean;
}

/** 友だちでない人には、友だち登録の案内だけを出す（BR1.5）。招待のリンクから来た人には一言足す（BR3.10）。 */
export function RegisterPage({ fromInvitation = false }: Props) {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="register-page">
      <Typography component="h1" variant="h5">
        {MESSAGES.NOT_FRIEND}
      </Typography>
      {fromInvitation && (
        <Typography data-testid="invitation-hint">{INVITATION_NOT_FRIEND_HINT}</Typography>
      )}
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
