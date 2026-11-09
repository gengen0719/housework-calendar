import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import {
  RECORD_CANCEL_BUTTON,
  RECORD_CONFIRM_BUTTON,
  recordConfirmQuestion,
} from '@housework/shared';
import { colors } from '../theme';

interface Props {
  /** 記録する担当の日付（日本時間の YYYY-MM-DD） */
  date: string;
  /** お手伝いの名前（種類の名前はタグがあっても文字として出す。NFR4.62） */
  choreName: string;
  /** 「記録する」を押している間 true。押せなくする（二重送信を防ぐ） */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 記録の確認ダイアログ（BR7.10、Q4）。「{月}/{日} {お手伝い}を記録しますか」と「記録する」「やめる」。
 * MUI の Dialog を使う: 開いたときフォーカスは「記録する」に移り、Esc キーで閉じる（アクセシビリティ）。
 * 種類の名前は React の文字として出す（dangerouslySetInnerHTML は使わない）。
 */
export function RecordConfirmDialog({ date, choreName, busy = false, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="record-confirm-heading"
      data-testid="record-confirm-dialog"
    >
      <DialogTitle id="record-confirm-heading" sx={{ overflowWrap: 'anywhere' }}>
        {recordConfirmQuestion(date, choreName)}
      </DialogTitle>
      <DialogContent />
      <DialogActions>
        <Button
          variant="contained"
          autoFocus
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
          data-testid="record-confirm-button"
          sx={{ bgcolor: colors.recordButton, color: colors.recordButtonText }}
        >
          {RECORD_CONFIRM_BUTTON}
        </Button>
        <Button variant="outlined" onClick={onCancel} data-testid="record-cancel-button">
          {RECORD_CANCEL_BUTTON}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
