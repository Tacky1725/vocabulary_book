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
import Paper from '@mui/material/Paper'
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import HomeIcon from '@mui/icons-material/Home'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import QuizIcon from '@mui/icons-material/Quiz'
import LeaderboardIcon from '@mui/icons-material/Leaderboard'
import Dashboard from './pages/Dashboard.jsx'
import AddWord from './pages/AddWord.jsx'
import WordList from './pages/WordList.jsx'
import TestPage from './pages/TestPage.jsx'
import Ranking from './pages/Ranking.jsx'
import Settings from './pages/Settings.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import { useAuth } from './hooks/useAuth.jsx'
import { logout } from './lib/firebase.js'
import {
  MOBILE_CONTENT_BOTTOM_PADDING,
  MOBILE_CONTENT_BOTTOM_PADDING_FALLBACK,
  MOBILE_NAV_CONTENT_HEIGHT,
  MOBILE_NAV_SAFE_AREA,
} from './lib/layout.js'

const NAV_ITEMS = [
  { to: '/', label: 'ダッシュボード', shortLabel: 'ホーム', icon: <HomeIcon />, end: true },
  { to: '/add', label: '単語追加', shortLabel: '追加', icon: <AddCircleIcon /> },
  { to: '/words', label: '単語一覧', shortLabel: '一覧', icon: <FormatListBulletedIcon /> },
  { to: '/test', label: 'テスト', shortLabel: 'テスト', icon: <QuizIcon /> },
  { to: '/ranking', label: 'ランキング', shortLabel: 'ランキング', icon: <LeaderboardIcon /> },
]

// 現在のパスに対応する NAV_ITEMS の to を返す（末尾は前方一致でネストにも耐える）
function useCurrentNavValue() {
  const { pathname } = useLocation()
  return (
    NAV_ITEMS.find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
      ?.to ?? false
  )
}

function AppNav() {
  const currentTab = useCurrentNavValue()

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

// スマホ用の画面下部固定ナビ。iOS のホームバー等を避けるため safe-area 分の余白を確保する。
function MobileNav() {
  const currentTab = useCurrentNavValue()

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        pb: MOBILE_NAV_SAFE_AREA,
      }}
    >
      <BottomNavigation
        value={currentTab}
        showLabels
        sx={{
          height: MOBILE_NAV_CONTENT_HEIGHT,
          // MUI の標準 minWidth は80pxで、5項目では400px必要になる。
          // 320px幅でも各項目を十分なタップ領域（幅64px以上）として表示する。
          '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.25 },
          '& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected': {
            fontSize: '0.625rem',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          },
          '& .mobile-nav-ranking .MuiBottomNavigationAction-label, & .mobile-nav-ranking .MuiBottomNavigationAction-label.Mui-selected': {
            fontSize: '0.5625rem',
          },
        }}
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.to}
            className={item.to === '/ranking' ? 'mobile-nav-ranking' : undefined}
            label={item.shortLabel}
            value={item.to}
            icon={item.icon}
            component={RouterLink}
            to={item.to}
          />
        ))}
      </BottomNavigation>
    </Paper>
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
        <MenuItem component={RouterLink} to="/settings" onClick={() => setAnchorEl(null)}>
          設定
        </MenuItem>
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
      <Route path="/ranking" element={<Ranking />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  )
}

export default function App() {
  const { user, status } = useAuth()
  const theme = useTheme()
  // 600px 未満をスマホ扱い。上部タブを畳んで下部ナビへ切り替える。
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const showMobileNav = isMobile && status === 'ready'

  return (
    // future フラグは v7 の挙動を先取りするオプトイン（開発コンソールの Future Flag 警告も消える）。
    // react-router は Node 18 制約で v6 に固定しているため、移行を滑らかにする目的で有効化しておく。
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppBar position="static">
        <Toolbar sx={{ flexWrap: 'wrap', rowGap: 1, py: 1 }}>
          <MenuBookIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="h1" sx={{ mr: { xs: 1, sm: 3 } }}>
            英単語帳
          </Typography>
          {!isMobile && status === 'ready' && <AppNav />}
          {user && (
            <Box sx={{ ml: 'auto' }}>
              <AccountMenu user={user} />
            </Box>
          )}
        </Toolbar>
      </AppBar>
      <Box
        component="main"
        sx={{
          maxWidth: 960,
          mx: 'auto',
          px: { xs: 1.5, sm: 3 },
          py: { xs: 2, sm: 3 },
          // 下部固定ナビと本文が重ならないよう余白を確保する。safe area 非対応ブラウザでは
          // 固定値を使い、対応ブラウザではホームバー分を上乗せする。
          pb: showMobileNav ? MOBILE_CONTENT_BOTTOM_PADDING_FALLBACK : { xs: 2, sm: 3 },
          ...(showMobileNav && {
            '@supports (padding-bottom: env(safe-area-inset-bottom))': {
              pb: MOBILE_CONTENT_BOTTOM_PADDING,
            },
          }),
        }}
      >
        <AppContent />
      </Box>
      {showMobileNav && <MobileNav />}
    </HashRouter>
  )
}
