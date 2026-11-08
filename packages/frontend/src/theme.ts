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
];

const touchTarget = { minWidth: MIN_TOUCH_TARGET_PX, minHeight: MIN_TOUCH_TARGET_PX };

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
    MuiButton: { styleOverrides: { root: touchTarget } },
    MuiIconButton: { styleOverrides: { root: touchTarget } },
  },
});
