import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    background: { default: '#f5f6fa', paper: '#ffffff' },
    text: { primary: '#2c3145', secondary: '#7a8095' },
    primary: { main: '#74006b' },
    secondary: { main: '#e9042f' },
    error: { main: '#d64545' },
    success: { main: '#2e9e5b' },
    divider: '#dfe2ec',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: [
      'LINE Seed JP',
      'Roboto',
      'Helvetica Neue',
      'Arial',
      'Hiragino Kaku Gothic ProN',
      'Meiryo',
      'sans-serif',
    ].join(','),
  },
  components: {
    // タッチ操作向けに主要な操作要素の最小タップ領域を約44pxへ引き上げる。
    // size="small" の要素（一覧の絞り込み等、密度を優先したい箇所）は個別指定を尊重するため対象外にする。
    MuiButton: {
      styleOverrides: {
        root: { minHeight: 44 },
        sizeSmall: { minHeight: 'auto' },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: 44, minHeight: 44 },
        sizeSmall: { minWidth: 'auto', minHeight: 'auto' },
      },
    },
  },
})
