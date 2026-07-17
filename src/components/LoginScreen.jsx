import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import GoogleIcon from '@mui/icons-material/Google'
import { loginWithGoogle } from '../lib/firebase.js'

// 未ログイン時に Routes の代わりに表示するログイン画面。
// ログイン成功後の画面切り替えは useAuth の onAuthStateChanged 購読が行う。
export default function LoginScreen() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleLogin() {
    setBusy(true)
    setError('')
    const result = await loginWithGoogle()
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
    }
  }

  return (
    <Card sx={{ maxWidth: 480, mx: 'auto', mt: 6 }}>
      <CardContent>
        <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
          <Typography variant="h6" component="h2">
            ログイン
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            単語帳のデータを端末間で同期するため、Google アカウントでログインしてください。
            利用できるのは許可されたアカウントのみで、単語帳はアカウントごとに独立しています。
            初回ログインは接続のある環境で行う必要があります（2回目以降はオフラインでも起動できます）。
          </Typography>
          {error && (
            <Alert severity="error" sx={{ width: '100%' }}>
              {error}
            </Alert>
          )}
          <Button
            variant="contained"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleLogin}
            disabled={busy}
          >
            Google でログイン
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
