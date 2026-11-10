import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import {
  STATUS_CANCEL_BUTTON,
  STATUS_CONFIRM_BUTTON,
  monthConfirmPreviewText,
} from '@housework/shared';
import type { MonthConfirmPreview } from '@housework/shared';
import { colors } from '../theme';

interface Props {
  /** 確認の中身（確定／取り消し。確定のときは未の件数。保存しない） */
  preview: MonthConfirmPreview;
  /** 「はい」を押している間 true。押せなくする（二重送信を防ぐ） */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 月の確定・取り消しの確認ダイアログ（U7。BR8.10）。確定のとき、未の担当が 1 件以上あれば注意を添える。
 * MUI の Dialog を使う: 開いたときフォーカスは「はい」に移り、Esc キーで閉じる（アクセシビリティ）。
 * 文言は共有パッケージから引く。文字として出す（dangerouslySetInnerHTML は使わない）。
 */
export function MonthConfirmDialog({ preview, busy = false, onConfirm, onCancel }: Props) {
  const isUnconfirm = preview.action === 'unconfirm';
  return (
    <Dialog
      open
      onClose={onCancel}
      aria-labelledby="month-confirm-heading"
      data-testid="month-confirm-dialog"
    >
      <DialogTitle id="month-confirm-heading" sx={{ overflowWrap: 'anywhere' }}>
        {monthConfirmPreviewText(preview)}
      </DialogTitle>
      <DialogContent />
      <DialogActions>
        <Button
          variant="contained"
          autoFocus
          disabled={busy}
          aria-busy={busy}
          onClick={onConfirm}
          data-testid="month-confirm-confirm-button"
          sx={{
            bgcolor: isUnconfirm ? colors.reviewRevertButton : colors.reviewActionButton,
            color: isUnconfirm ? colors.reviewRevertButtonText : colors.reviewActionButtonText,
          }}
        >
          {STATUS_CONFIRM_BUTTON}
        </Button>
        <Button variant="outlined" onClick={onCancel} data-testid="month-confirm-cancel-button">
          {STATUS_CANCEL_BUTTON}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
