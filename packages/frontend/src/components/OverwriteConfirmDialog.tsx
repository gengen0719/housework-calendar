import { Button, Stack, Typography } from '@mui/material';
import { OVERWRITE_CONFIRM_HEADING, overwriteChangeMessage } from '@housework/shared';
import type { OverwriteChange } from '@housework/shared';

interface Props {
  changes: readonly OverwriteChange[];
  /** 種類の ID から名前を引く（見つからなければ空の文字） */
  choreName: (choreTypeId: string) => string;
  /** 子供の ID から表示名を引く（見つからなければ空の文字） */
  childName: (userId: string) => string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 上書きされる担当の一覧と、確かめて保存するかどうかの選び（AC3.1.5、BR6.7）。
 * 名前は React の文字として出す（HTML としては解釈しない）。
 */
export function OverwriteConfirmDialog({
  changes,
  choreName,
  childName,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Stack
      component="section"
      role="alertdialog"
      aria-labelledby="overwrite-heading"
      spacing={1.5}
      data-testid="overwrite-dialog"
      sx={{ p: 2, border: '2px solid', borderColor: 'text.secondary', bgcolor: 'background.paper' }}
    >
      <Typography component="h3" variant="h6" id="overwrite-heading">
        {OVERWRITE_CONFIRM_HEADING}
      </Typography>
      <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 3 }}>
        {changes.map((change) => (
          <li
            key={`${change.date}-${change.choreTypeId}`}
            data-testid="overwrite-change"
            style={{ overflowWrap: 'anywhere' }}
          >
            {overwriteChangeMessage(
              change.date,
              choreName(change.choreTypeId),
              childName(change.fromChildUserId),
              change.toChildUserId === null ? 'なし' : childName(change.toChildUserId),
            )}
          </li>
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          disabled={busy}
          onClick={onConfirm}
          data-testid="overwrite-confirm-button"
        >
          この内容で保存する
        </Button>
        <Button variant="outlined" onClick={onCancel} data-testid="overwrite-cancel-button">
          やめる
        </Button>
      </Stack>
    </Stack>
  );
}
