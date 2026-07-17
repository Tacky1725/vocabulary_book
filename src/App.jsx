// GitHub Pages のサブパス配信でも404にならないよう HashRouter を使う
import { useState } from 'react'
import { HashRouter, Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import Dashboard from './pages/Dashboard.jsx'
import AddWord from './pages/AddWord.jsx'
import WordList from './pages/WordList.jsx'
import TestPage from './pages/TestPage.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import { useAuth } from './hooks/useAuth.jsx'
import { logout } from './lib/firebase.js'

const NAV_ITEMS = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/add', label: '単語追加' },
  { to: '/words', label: '単語一覧' },
  { to: '/test', label: 'テスト' },
]

function AppNav() {
  const { pathname } = useLocation()
  const currentTab =
    NAV_ITEMS.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
      ?.to ?? false

  return (
    <Tabs
      value={currentTab}
      textColor="inherit"
      indicatorColor="secondary"
      variant="scrollable"
      scrollButtons="auto"
      allowScrollButtonsMobile
    >
      {NAV_ITEMS.map((item) => (
        <Tab key={item.to} label={item.label} value={item.to} component={RouterLink} to={item.to} />
      ))}
    </Tabs>
  )
}

// UID はセキュリティルールのピン留め設定（firestore.rules）に使うため、ここで確認できるようにしている
function AccountMenu({ user }) {
  const [anchorEl, setAnchorEl] = useState(null)

  return (
    <>
      <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} aria-label="アカウント">
        <Avatar src={user.photoURL ?? undefined} sx={{ width: 32, height: 32 }}>
          {(user.displayName ?? user.email ?? '?').slice(0, 1)}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 320 }}>
          <Typography variant="body2">{user.email}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            UID: {user.uid}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchorEl(null)
            logout()
          }}
        >
          ログアウト
        </MenuItem>
      </Menu>
    </>
  )
}

function AppContent() {
  const { status, error, retryMigration } = useAuth()

  if (status === 'loading' || status === 'preparing') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress />
      </Box>
    )
  }
  if (status === 'signedOut') {
    return <LoginScreen />
  }
  if (status === 'migrationError') {
    return (
      <Alert
        severity="error"
        sx={{ maxWidth: 480, mx: 'auto', mt: 6 }}
        action={<Button onClick={retryMigration}>再試行</Button>}
      >
        初回のデータ同期に失敗しました（{error}）。
        {error === 'permission-denied'
          ? ' このアカウントは利用を許可されていません。セキュリティルールの許可メールアドレス一覧に、右上メニューに表示されるアドレスが含まれているか確認してください。'
          : ' 接続を確認して再試行してください。'}
      </Alert>
    )
  }
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/add" element={<AddWord />} />
      <Route path="/words" element={<WordList />} />
      <Route path="/test" element={<TestPage />} />
    </Routes>
  )
}

export default function App() {
  const { user, status } = useAuth()

  return (
    <HashRouter>
      <AppBar position="static">
        <Toolbar sx={{ flexWrap: 'wrap', rowGap: 1, py: 1 }}>
          <MenuBookIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="h1" sx={{ mr: 3 }}>
            英単語帳
          </Typography>
          {status === 'ready' && <AppNav />}
          {user && (
            <Box sx={{ ml: 'auto' }}>
              <AccountMenu user={user} />
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ maxWidth: 960, mx: 'auto', px: 2, py: 3 }}>
        <AppContent />
      </Box>
    </HashRouter>
  )
}
