import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

export function LoadingState() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 8 }}
    >
      <CircularProgress />
      <Typography color="text.secondary">読み込み中…</Typography>
    </Box>
  )
}

export function DataErrorState() {
  return (
    <Box role="alert" sx={{ py: 8, textAlign: 'center' }}>
      <Typography color="error">データの読み込みに失敗しました。</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        接続を確認して、ページを再読み込みしてください。
      </Typography>
    </Box>
  )
}
