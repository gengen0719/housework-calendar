import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import {
  STATUS_CANCEL_BUTTON,
  STATUS_CONFIRM_BUTTON,
  statusChangePreviewLine,
} from '@housework/shared';
import type { StatusChangePreview } from '@housework/shared';
import { colors } from '../theme';

interface Props {
  /** 確認の中身（1 行の変化と注意。保存しない） */
  preview: StatusChangePreview;
  /** 「はい」を押している間 true。押せなくする（二重送信を防ぐ） */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 状態の変更の確認ダイアログ（U7。BR8.3）。「{月}/{日} {お手伝い} {子供}: {前} → {後}」と注意、「はい」「やめる」。
 * MUI の Dialog を使う: 開いたときフォーカスは「はい」に移り、Esc キーで閉じる（アクセシビリティ）。
 * お手伝いの名前・子供の表示名は React の文字として出す（dangerouslySetInnerHTML は使わない。NFR9.8）。
 */
export function StatusChangeDialog({ preview, busy = false, onConfirm, onCancel }: Props) {
  const isRevert = preview.toStatus === 'todo' || preview.toStatus === 'skipped';
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="status-change-heading"
      data-testid="status-change-dialog"
    >
      <DialogTitle id="status-change-heading" sx={{ overflowWrap: 'anywhere' }}>
        {statusChangePreviewLine(preview)}
      </DialogTitle>
      <DialogContent>
        {preview.countNote !== null && (
          <Typography
            data-testid="status-change-note"
            sx={{ color: colors.reviewNoteText, overflowWrap: 'anywhere' }}
          >
            {preview.countNote}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          autoFocus
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
          data-testid="status-change-confirm-button"
          sx={{
            bgcolor: isRevert ? colors.reviewRevertButton : colors.reviewActionButton,
            color: isRevert ? colors.reviewRevertButtonText : colors.reviewActionButtonText,
          }}
        >
          {STATUS_CONFIRM_BUTTON}
        </Button>
        <Button variant="outlined" onClick={onCancel} data-testid="status-change-cancel-button">
          {STATUS_CANCEL_BUTTON}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
