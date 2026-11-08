import { CircularProgress, Container, Typography } from '@mui/material';
import { MESSAGES } from '@housework/shared';
import { useSession } from './hooks/useSession';
import { CalendarFramePage } from './pages/CalendarFramePage';
import { ErrorRetry } from './pages/ErrorRetry';
import { RegisterPage } from './pages/RegisterPage';
import { SetupPage } from './pages/SetupPage';

export function App() {
  const { state, reload, createFamily } = useSession();

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {renderScreen()}
    </Container>
  );

  function renderScreen() {
    switch (state.kind) {
      case 'loading':
      case 'redirecting':
        return (
          <div data-testid="loading" role="status">
            <CircularProgress aria-hidden />
            <Typography>読み込み中…</Typography>
          </div>
        );
      case 'not-friend':
        return <RegisterPage />;
      case 'not-member':
        return (
          <Typography component="h1" variant="h5" data-testid="not-member-page">
            {MESSAGES.NOT_FAMILY_MEMBER}
          </Typography>
        );
      case 'error':
        return <ErrorRetry onRetry={() => void reload()} />;
      case 'ready':
        return state.me.family ? (
          <CalendarFramePage familyName={state.me.family.name} />
        ) : (
          <SetupPage onCreateFamily={createFamily} />
        );
    }
  }
}
