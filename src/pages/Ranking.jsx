import { useMemo, useState } from 'react'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Avatar from '@mui/material/Avatar'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import FavoriteIcon from '@mui/icons-material/Favorite'
import { useAuth } from '../hooks/useAuth.jsx'
import { usePublicProfile } from '../hooks/usePublicProfile.js'
import { useCheers } from '../hooks/useCheers.js'
import { useDailyLeaderboard, useWeeklyLeaderboard } from '../hooks/useLeaderboard.js'
import { useSenderDisplayNames } from '../hooks/useSenderDisplayNames.js'
import { sendCheer } from '../lib/socialCloud.js'
import {
  CHEER_REACTIONS,
  buildRanking,
  formatCheerTimestamp,
  formatOrdinal,
  getMedalEmoji,
  getWeekStartDateKey,
  isWeeklyChallengeCompleted,
  toJstDateKey,
} from '../lib/socialStats.js'
import { LoadingState } from '../components/LoadingState.jsx'
import { WeeklyChallengeCard } from '../components/WeeklyChallengeCard.jsx'

const RANKING_TABS = [
  { id: 'weeklyQuestions', label: '問題数 - Weekly', valueField: 'questionCount' },
  { id: 'dailyQuestions', label: '問題数 - Daily', valueField: 'questionCount' },
  { id: 'streak', label: '継続日数', valueField: 'streak' },
]

export default function Ranking() {
  const { user } = useAuth()
  const { profile, isLoading: profileLoading, saveProfile } = usePublicProfile()
  const { cheers } = useCheers()
  const [tabId, setTabId] = useState(RANKING_TABS[0].id)
  const [snackbar, setSnackbar] = useState(null)
  const needsInitialSetup = !profileLoading && profile === null

  const todayKey = useMemo(() => toJstDateKey(new Date()), [])
  const weekStartKey = useMemo(() => getWeekStartDateKey(todayKey), [todayKey])

  const daily = useDailyLeaderboard(todayKey)
  const weekly = useWeeklyLeaderboard(weekStartKey)

  const activeTab = RANKING_TABS.find((t) => t.id === tabId)
  const activeData = tabId === 'weeklyQuestions' ? weekly : daily

  const ranking = useMemo(() => {
    const byUid = new Map(activeData.entries.map((e) => [e.uid, e]))
    const ranked = buildRanking(
      activeData.entries.map((e) => ({ uid: e.uid, value: e[activeTab.valueField] ?? 0 }))
    )
    return ranked.map((r) => ({ ...r, ...byUid.get(r.uid) }))
  }, [activeData.entries, activeTab.valueField])

  const myWeeklyCount = useMemo(
    () => weekly.entries.find((e) => e.uid === user?.uid)?.questionCount ?? 0,
    [weekly.entries, user?.uid]
  )
  const challengeCompleted = isWeeklyChallengeCompleted(myWeeklyCount)

  async function handleSendCheer(recipientUid, type) {
    const result = await sendCheer({ recipientUid, type })
    setSnackbar(
      result.ok
        ? { severity: 'success', message: '応援を送りました' }
        : { severity: 'error', message: result.error }
    )
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        ランキング
      </Typography>

      <WeeklyChallengeCard count={myWeeklyCount} completed={challengeCompleted} />

      <Card>
        <Tabs
          value={tabId}
          onChange={(_, value) => setTabId(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {RANKING_TABS.map((t) => (
            <Tab key={t.id} value={t.id} label={t.label} />
          ))}
        </Tabs>
        <CardContent>
          {activeData.isLoading ? (
            <LoadingState />
          ) : (
            <RankingTable rows={ranking} myUid={user?.uid} onSendCheer={handleSendCheer} />
          )}
        </CardContent>
      </Card>

      <ReceivedCheers cheers={cheers} />

      {needsInitialSetup && (
        <ProfileSetupDialog
          defaultName={user?.displayName ?? ''}
          photoURL={user?.photoURL ?? ''}
          onSave={saveProfile}
        />
      )}

      <Snackbar open={Boolean(snackbar)} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar && (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Stack>
  )
}

const MEDAL_CELL_SX = { width: 52, px: 0.5 }
const RANK_CELL_SX = { width: 44, px: 0.5 }

function RankingTable({ rows, myUid, onSendCheer }) {
  const [menuState, setMenuState] = useState(null) // { anchorEl, uid }

  if (rows.length === 0) {
    return <Typography color="text.secondary">まだデータがありません。</Typography>
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={MEDAL_CELL_SX} />
            <TableCell align="right" sx={RANK_CELL_SX} />
            <TableCell />
            <TableCell>名前</TableCell>
            <TableCell align="right">スコア</TableCell>
            <TableCell align="right">応援</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const isMe = row.uid === myUid
            return (
              <TableRow
                key={row.uid}
                sx={isMe ? { bgcolor: (theme) => theme.palette.action.selected } : undefined}
              >
                <TableCell align="center" sx={MEDAL_CELL_SX}>
                  {getMedalEmoji(row.rank) ?? ''}
                </TableCell>
                <TableCell align="right" sx={RANK_CELL_SX}>
                  {formatOrdinal(row.rank)}
                </TableCell>
                <TableCell>
                  <Avatar src={row.photoURL || undefined} sx={{ width: 28, height: 28 }}>
                    {(row.displayName ?? '?').slice(0, 1)}
                  </Avatar>
                </TableCell>
                <TableCell>
                  {row.displayName}
                  {isMe && '（あなた）'}
                </TableCell>
                <TableCell align="right">{row.value}</TableCell>
                <TableCell align="right">
                  {!isMe && (
                    <IconButton
                      size="small"
                      aria-label="応援する"
                      onClick={(e) => setMenuState({ anchorEl: e.currentTarget, uid: row.uid })}
                    >
                      <FavoriteIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Menu anchorEl={menuState?.anchorEl} open={Boolean(menuState)} onClose={() => setMenuState(null)}>
        {CHEER_REACTIONS.map((reaction) => (
          <MenuItem
            key={reaction.id}
            onClick={() => {
              onSendCheer(menuState.uid, reaction.id)
              setMenuState(null)
            }}
          >
            {reaction.label}
          </MenuItem>
        ))}
      </Menu>
    </TableContainer>
  )
}

function ReceivedCheers({ cheers }) {
  // 参照を安定させないと useSenderDisplayNames が毎回取得し直してしまう
  const senderUids = useMemo(() => [...new Set(cheers.map((c) => c.senderUid))], [cheers])
  const namesByUid = useSenderDisplayNames(senderUids)

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          届いた応援
        </Typography>
        {cheers.length === 0 ? (
          <Typography color="text.secondary">まだ応援はありません。</Typography>
        ) : (
          <List dense>
            {cheers.map((cheer) => {
              const senderName = namesByUid[cheer.senderUid] ?? '読み込み中…'
              const receivedAt = formatCheerTimestamp(cheer.createdAt)
              return (
                <ListItem key={cheer.id} disableGutters>
                  <ListItemText
                    primary={CHEER_REACTIONS.find((r) => r.id === cheer.type)?.label ?? cheer.type}
                    secondary={receivedAt ? `${senderName} ・ ${receivedAt}` : senderName}
                  />
                </ListItem>
              )
            })}
          </List>
        )}
      </CardContent>
    </Card>
  )
}

// ランキング初回閲覧時のみ表示する。保存完了までは閉じられない
// （以後の変更は アカウントメニュー →設定 ページで行う。src/pages/Settings.jsx）。
function ProfileSetupDialog({ defaultName, photoURL, onSave }) {
  const [name, setName] = useState(defaultName)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  async function handleSave() {
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 20) {
      setErrorMessage('表示名は1〜20文字で入力してください')
      return
    }
    setSaving(true)
    const result = await onSave({ displayName: trimmed, photoURL })
    setSaving(false)
    if (!result.ok) setErrorMessage(result.error)
  }

  return (
    <Dialog open disableEscapeKeyDown>
      <DialogTitle>ランキング参加の表示名を設定</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          ランキングに表示する名前を設定してください。あとから設定ページで変更できます。
        </Typography>
        <TextField
          autoFocus
          fullWidth
          label="表示名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 20 } }}
          error={Boolean(errorMessage)}
          helperText={errorMessage ?? `${name.length}/20文字`}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  )
}
