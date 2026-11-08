import { useState, type FormEvent } from 'react';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { FAMILY_NAME_MAX_LENGTH, getMessage } from '@housework/shared';
import type { CreateFamilyOutcome } from '../hooks/useSession';

type Mode = 'choose' | 'create' | 'waiting';

interface Props {
  onCreateFamily: (name: string) => Promise<CreateFamilyOutcome>;
}

/** 家族に入っていない人に、家族を作る・招待を待つの入口を出す（BR1.6、BR1.10）。 */
export function SetupPage({ onCreateFamily }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(undefined);
    const outcome = await onCreateFamily(name);
    // 成功すると画面が切り替わるので、失敗のときだけここに戻る。入力はそのまま残す
    setSaving(false);
    if (!outcome.ok) setErrorMessage(getMessage(outcome.reason));
  }

  if (mode === 'waiting') {
    return (
      <Stack spacing={2} data-testid="waiting-page">
        <Typography component="h1" variant="h5">
          お母さんから届いた招待のリンクを開いてください
        </Typography>
      </Stack>
    );
  }

  if (mode === 'create') {
    return (
      <Stack
        component="form"
        spacing={2}
        onSubmit={submit}
        noValidate
        data-testid="create-family-form"
      >
        <Typography component="h1" variant="h5">
          家族を作る
        </Typography>
        <TextField
          label="家族の名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errorMessage !== undefined}
          slotProps={{
            htmlInput: {
              maxLength: FAMILY_NAME_MAX_LENGTH + 10,
              'data-testid': 'family-name-input',
            },
          }}
        />
        {errorMessage && (
          <Typography color="error" role="alert" data-testid="family-name-error">
            {errorMessage}
          </Typography>
        )}
        <Button
          type="submit"
          variant="contained"
          disabled={saving}
          data-testid="save-family-button"
        >
          保存する
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }} data-testid="setup-page">
      <Typography component="h1" variant="h5">
        はじめに
      </Typography>
      <Button
        variant="contained"
        onClick={() => setMode('create')}
        data-testid="create-family-button"
      >
        家族を作る
      </Button>
      <Button
        variant="outlined"
        onClick={() => setMode('waiting')}
        data-testid="wait-invitation-button"
      >
        招待を待つ
      </Button>
    </Stack>
  );
}
