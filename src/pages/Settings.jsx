import { useEffect, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Avatar from '@mui/material/Avatar'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { useAuth } from '../hooks/useAuth.jsx'
import { usePublicProfile } from '../hooks/usePublicProfile.js'
import { LoadingState } from '../components/LoadingState.jsx'
import { MOBILE_SNACKBAR_BOTTOM } from '../lib/layout.js'

export default function Settings() {
  const { user } = useAuth()
  const { profile, isLoading, saveProfile } = usePublicProfile()
  // null は「まだ初期値をセットしていない」の意。profile読み込み後に一度だけ初期値を入れ、
  // 以後はユーザーの入力を優先する（profileの変化で入力中の文字を上書きしないため）。
  const [name, setName] = useState(null)
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState(null)

  useEffect(() => {
    if (!isLoading && name === null) {
      setName(profile?.displayName ?? user?.displayName ?? '')
    }
  }, [isLoading, profile, user, name])

  if (isLoading || name === null) return <LoadingState />

  const trimmed = name.trim()
  const isValid = trimmed.length >= 1 && trimmed.length <= 20

  async function handleSave() {
    setSaving(true)
    const result = await saveProfile({ displayName: trimmed, photoURL: user?.photoURL ?? '' })
    setSaving(false)
    setSnackbar(
      result.ok
        ? { severity: 'success', message: '表示名を保存しました' }
        : { severity: 'error', message: result.error }
    )
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        設定
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            ランキング用の表示名
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            ランキング画面や応援機能で他の利用者に表示される名前です。
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
            <Avatar src={user?.photoURL ?? undefined} sx={{ width: 48, height: 48 }}>
              {(name || '?').slice(0, 1)}
            </Avatar>
            <TextField
              label="表示名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              slotProps={{ htmlInput: { maxLength: 20 } }}
              error={!isValid}
              helperText={isValid ? `${name.length}/20文字` : '1〜20文字で入力してください'}
              fullWidth
            />
          </Stack>
          <Button variant="contained" onClick={handleSave} disabled={!isValid || saving}>
            保存
          </Button>
        </CardContent>
      </Card>

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        sx={{ bottom: { xs: MOBILE_SNACKBAR_BOTTOM, sm: 3 } }}
      >
        {snackbar && (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Stack>
  )
}
