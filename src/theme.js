import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    background: { default: '#f5f6fa', paper: '#ffffff' },
    text: { primary: '#2c3145', secondary: '#7a8095' },
    primary: { main: '#3d6bd8', dark: '#2f54ac' },
    error: { main: '#d64545' },
    success: { main: '#2e9e5b' },
    divider: '#dfe2ec',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: [
      'Roboto',
      'Helvetica Neue',
      'Arial',
      'Hiragino Kaku Gothic ProN',
      'Meiryo',
      'sans-serif',
    ].join(','),
  },
})
