import { createTheme } from '@mui/material/styles';

/** 押す場所の最小の大きさ（px。NFR9.1） */
export const MIN_TOUCH_TARGET_PX = 44;

/** 文字の色と背景の色の差の下限（NFR9.1） */
export const MIN_CONTRAST_RATIO = 4.5;

export const colors = {
  textPrimary: '#1f2933',
  textSecondary: '#4a5560',
  backgroundDefault: '#faf8f3',
  backgroundPaper: '#ffffff',
  primaryMain: '#0b6b4a',
  primaryContrastText: '#ffffff',
  errorMain: '#b3261e',
  /** 担当の状態の文字の色（色だけに頼らず、必ず「済」「未」「×」の文字も出す。AC4.1.7） */
  statusDone: '#0b6b4a',
  statusTodo: '#8a4b00',
  statusSkipped: '#b3261e',
  /** 「確定済み」の文字の色 */
  confirmedText: '#5b2c83',
  /** 無効のボタンの文字と背景の色 */
  disabledText: '#4a5560',
  disabledBackground: '#e3e6ea',
  /** リンクの文字の色 */
  link: '#0b57d0',
  /** 入力欄の枠の色 */
  inputBorder: '#5f6b76',
  /** 「やった」ボタン（記録。U6）。背景とその上の文字（NFR9.7） */
  recordButton: '#0b6b4a',
  recordButtonText: '#ffffff',
  /** 確認ダイアログ（記録。U6）。見出しと本文の文字と、ダイアログの背景 */
  dialogText: '#1f2933',
  dialogBackground: '#ffffff',
  /** 状態を変える操作ボタン（U7。済にする・やらなかったを外す・確定する）。背景とその上の文字 */
  reviewActionButton: '#1f4e8c',
  reviewActionButtonText: '#ffffff',
  /** 元に戻す側の操作ボタン（U7。取り消す・やらなかったにする・確定を取り消す）。背景とその上の文字 */
  reviewRevertButton: '#b3261e',
  reviewRevertButtonText: '#ffffff',
  /** 確認ダイアログの注意の文字の色（U7。「お小遣いの回数から外れます」「未の担当が N 件あります」） */
  reviewNoteText: '#8a4b00',
} as const;

/** 文字の色と背景の色の組（色の差を単体テストで確かめる） */
export const textBackgroundPairs: ReadonlyArray<readonly [string, string, string]> = [
  ['本文 / 背景', colors.textPrimary, colors.backgroundDefault],
  ['本文 / 紙', colors.textPrimary, colors.backgroundPaper],
  ['補助の文字 / 背景', colors.textSecondary, colors.backgroundDefault],
  ['補助の文字 / 紙', colors.textSecondary, colors.backgroundPaper],
  ['ボタンの文字 / ボタン', colors.primaryContrastText, colors.primaryMain],
  ['主な色の文字 / 背景', colors.primaryMain, colors.backgroundDefault],
  ['エラーの文字 / 背景', colors.errorMain, colors.backgroundDefault],
  ['エラーの文字 / 紙', colors.errorMain, colors.backgroundPaper],
  ['済の文字 / 紙', colors.statusDone, colors.backgroundPaper],
  ['済の文字 / 背景', colors.statusDone, colors.backgroundDefault],
  ['未の文字 / 紙', colors.statusTodo, colors.backgroundPaper],
  ['未の文字 / 背景', colors.statusTodo, colors.backgroundDefault],
  ['×の文字 / 紙', colors.statusSkipped, colors.backgroundPaper],
  ['×の文字 / 背景', colors.statusSkipped, colors.backgroundDefault],
  ['確定済みの文字 / 紙', colors.confirmedText, colors.backgroundPaper],
  ['確定済みの文字 / 背景', colors.confirmedText, colors.backgroundDefault],
  ['無効のボタンの文字 / 無効のボタン', colors.disabledText, colors.disabledBackground],
  ['リンクの文字 / 紙', colors.link, colors.backgroundPaper],
  ['リンクの文字 / 背景', colors.link, colors.backgroundDefault],
  ['入力欄の枠 / 紙', colors.inputBorder, colors.backgroundPaper],
  ['入力欄の枠 / 背景', colors.inputBorder, colors.backgroundDefault],
  ['今日の印 / 紙', colors.primaryMain, colors.backgroundPaper],
  // U6（記録）で足す色
  ['「やった」ボタンの文字 / ボタン', colors.recordButtonText, colors.recordButton],
  ['確認ダイアログの文字 / ダイアログ', colors.dialogText, colors.dialogBackground],
  // U7（確認・修正と確定）で足す色
  ['操作ボタン（進める）の文字 / ボタン', colors.reviewActionButtonText, colors.reviewActionButton],
  ['操作ボタン（戻す）の文字 / ボタン', colors.reviewRevertButtonText, colors.reviewRevertButton],
  ['確認ダイアログの注意の文字 / ダイアログ', colors.reviewNoteText, colors.dialogBackground],
];

const touchTarget = { minWidth: MIN_TOUCH_TARGET_PX, minHeight: MIN_TOUCH_TARGET_PX };
const touchHeight = { minHeight: MIN_TOUCH_TARGET_PX };

export const theme = createTheme({
  palette: {
    text: { primary: colors.textPrimary, secondary: colors.textSecondary },
    background: { default: colors.backgroundDefault, paper: colors.backgroundPaper },
    primary: { main: colors.primaryMain, contrastText: colors.primaryContrastText },
    error: { main: colors.errorMain },
  },
  typography: {
    fontFamily: '"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
    fontSize: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          ...touchTarget,
          '&.Mui-disabled': {
            color: colors.disabledText,
            backgroundColor: colors.disabledBackground,
          },
        },
      },
    },
    MuiIconButton: { styleOverrides: { root: touchTarget } },
    MuiCheckbox: { styleOverrides: { root: touchTarget } },
    MuiListItemButton: { styleOverrides: { root: touchHeight } },
    MuiMenuItem: { styleOverrides: { root: touchHeight } },
    MuiLink: { styleOverrides: { root: { color: colors.link } } },
    MuiOutlinedInput: {
      styleOverrides: { notchedOutline: { borderColor: colors.inputBorder } },
    },
  },
});
