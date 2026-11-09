import { useState } from 'react';
import { CircularProgress, Container, Typography } from '@mui/material';
import { MESSAGES } from '@housework/shared';
import { useNotificationGroup } from './hooks/useNotificationGroup';
import { useSession } from './hooks/useSession';
import { CalendarPage } from './pages/CalendarPage';
import { ChoreTypesPage } from './pages/ChoreTypesPage';
import { ErrorRetry } from './pages/ErrorRetry';
import { FamilySettingsPage } from './pages/FamilySettingsPage';
import { InvitationPage } from './pages/InvitationPage';
import { RegisterPage } from './pages/RegisterPage';
import { SetupPage } from './pages/SetupPage';
export function App() {
  const { state, reload, createFamily, authorized, invitation, closeInvitation, joined } =
    useSession();
  const [showSettings, setShowSettings] = useState(false);
  const [showChoreTypes, setShowChoreTypes] = useState(false);
  // お知らせ先は、管理者のカレンダーの枠と、家族の設定（管理者も子供も）のためだけに読む。子供のカレンダーの枠では呼ばない（BR4.11）
  const role = state.kind === 'ready' && !invitation ? state.me.family?.role : undefined;
  const notificationGroup = useNotificationGroup(
    authorized,
    role === 'admin' || (role !== undefined && showSettings),
  );
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
        return <RegisterPage fromInvitation={invitation !== undefined} />;
      case 'not-member':
        return (
          <Typography component="h1" variant="h5" data-testid="not-member-page">
            {MESSAGES.NOT_FAMILY_MEMBER}
          </Typography>
        );
      case 'error':
        return <ErrorRetry onRetry={() => void reload()} />;
      case 'ready': {
        // 招待のリンクから来たときは、家族に入っているかどうかにかかわらず招待の画面が最初（F5）
        if (invitation) {
          return (
            <InvitationPage
              invitationToken={invitation}
              authorized={authorized}
              onJoined={joined}
              onGoToCalendar={closeInvitation}
              inFamily={state.me.family !== null}
            />
          );
        }
        const { family } = state.me;
        if (!family) return <SetupPage onCreateFamily={createFamily} />;
        if (showSettings && showChoreTypes) {
          return (
            <ChoreTypesPage
              role={family.role}
              authorized={authorized}
              onBack={() => setShowChoreTypes(false)}
            />
          );
        }
        if (showSettings) {
          return (
            <FamilySettingsPage
              onOpenChoreTypes={() => setShowChoreTypes(true)}
              familyName={family.name}
              role={family.role}
              authorized={authorized}
              onBack={() => setShowSettings(false)}
              notificationGroup={notificationGroup}
            />
          );
        }
        return (
          <CalendarPage
            familyName={family.name}
            authorized={authorized}
            role={family.role}
            notificationGroup={notificationGroup}
            onOpenSettings={() => setShowSettings(true)}
          />
        );
      }
    }
  }
}
