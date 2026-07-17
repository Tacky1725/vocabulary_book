import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import QuizIcon from '@mui/icons-material/Quiz'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import AddIcon from '@mui/icons-material/Add'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useWords } from '../hooks/useWords.js'
import { useTestSessions } from '../hooks/useTestSessions.js'
import {
  calcStreak,
  calcMasteryDistribution,
  calcSummary,
  buildActivityCalendar,
  toLocalDateKey,
} from '../lib/stats.js'

const RECENT_SESSION_COUNT = 5

// ヒートマップのマス寸法（px）。level 1〜4 は success.main の不透明度で濃淡を付ける。
const CELL = 13
const GAP = 3
const WEEKDAY_COL = 34
const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1]
// 曜日ラベル（0=日〜6=土）。全行に3文字略記で表示する。
const WEEKDAY_LABELS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.']

const MASTERY_BAR_COLOR = {
  unlearned: 'action.disabled',
  learning: 'primary.main',
  mastered: 'success.main',
}

export default function Dashboard() {
  const { words } = useWords()
  const { sessions } = useTestSessions()

  const summary = useMemo(() => calcSummary(words, sessions), [words, sessions])
  const streak = useMemo(() => calcStreak(sessions), [sessions])
  const distribution = useMemo(() => calcMasteryDistribution(words), [words])
  const calendar = useMemo(() => buildActivityCalendar(sessions), [sessions])

  // 直近のセッションを新しい順に数件
  const recentSessions = useMemo(
    () => sessions.slice(-RECENT_SESSION_COUNT).reverse(),
    [sessions],
  )

  const hasWords = summary.totalWords > 0
  const hasTests = summary.totalTests > 0

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h2">
        ダッシュボード
      </Typography>

      {/* サマリータイル */}
      <Box
        sx={{
          display: 'grid',
          // スマホは常に2列（縦に長くなりすぎるのを防ぐ）、sm以上は幅に応じて自動
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(auto-fit, minmax(160px, 1fr))' },
          gap: { xs: 1.5, sm: 2 },
        }}
      >
        <StatTile
          icon={<LocalFireDepartmentIcon color="warning" fontSize="small" />}
          label="連続学習日数"
          value={
            <>
              {streak}
              <Box component="span" sx={{ fontSize: '0.7em', fontWeight: 600, ml: 0.5 }}>
                {streak === 1 ? 'day' : 'days'}
              </Box>
            </>
          }
        />
        <StatTile
          icon={<MenuBookIcon color="primary" fontSize="small" />}
          label="総単語数"
          value={summary.totalWords}
        />
        <StatTile
          icon={<QuizIcon color="primary" fontSize="small" />}
          label="総テスト回数"
          value={summary.totalTests}
        />
        <StatTile
          icon={<TrackChangesIcon color="primary" fontSize="small" />}
          label="正答率"
          value={summary.accuracy !== null ? `${summary.accuracy}%` : '--'}
        />
      </Box>

      {/* 習熟度の分布 */}
      <Card>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            習熟度の分布
          </Typography>
          {hasWords ? (
            <Stack spacing={1.5}>
              {distribution.map((bucket) => {
                const percent = Math.round((bucket.count / summary.totalWords) * 100)
                return (
                  <Box key={bucket.id}>
                    <Stack
                      direction="row"
                      sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}
                    >
                      <Typography variant="body2">{bucket.label}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {bucket.count}件（{percent}%）
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={percent}
                      sx={{
                        height: 10,
                        borderRadius: 999,
                        bgcolor: 'action.hover',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: MASTERY_BAR_COLOR[bucket.id],
                          borderRadius: 999,
                        },
                      }}
                    />
                  </Box>
                )
              })}
            </Stack>
          ) : (
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Typography color="text.secondary">
                まだ単語が登録されていません。まずは単語を追加しましょう。
              </Typography>
              <Button component={Link} to="/add" variant="contained" startIcon={<AddIcon />}>
                単語を追加する
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* 学習記録カレンダー（GitHub 風ヒートマップ） */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <CalendarMonthIcon color="primary" fontSize="small" />
            <Typography variant="h6" component="h3">
              学習記録カレンダー
            </Typography>
          </Stack>
          {calendar.totalDays > 0 ? (
            <ActivityCalendar calendar={calendar} />
          ) : (
            <Typography color="text.secondary">まだ学習記録がありません。</Typography>
          )}
        </CardContent>
      </Card>

      {/* 最近の学習 */}
      <Card>
        <CardContent>
          <Typography variant="h6" component="h3" gutterBottom>
            最近の学習
          </Typography>
          {hasTests ? (
            <Stack divider={<Divider />}>
              {recentSessions.map((session, index) => (
                <Stack
                  key={`${session.date}-${index}`}
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'baseline', py: 1 }}
                >
                  <Typography fontWeight={600}>{toLocalDateKey(session.date)}</Typography>
                  <Typography color="text.secondary">出題 {session.total}問</Typography>
                  <Typography color="success.main">正解 {session.correct}問</Typography>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <Typography color="text.secondary">まだテストを実施していません。</Typography>
              {hasWords && (
                <Button component={Link} to="/test" variant="contained" startIcon={<PlayArrowIcon />}>
                  テストを始める
                </Button>
              )}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}

// マスの背景色（level 0 は薄いグレー、1〜4 は success の濃淡）。palette 経由で light/dark 両対応。
function cellSx(level, future) {
  return (theme) => ({
    width: CELL,
    height: CELL,
    mb: `${GAP}px`,
    borderRadius: 0.5,
    bgcolor: future
      ? 'transparent'
      : level === 0
        ? theme.palette.action.hover
        : alpha(theme.palette.success.main, LEVEL_OPACITY[level]),
  })
}

// GitHub 風の日別ヒートマップ。列=週・行=曜日(日→土)。カード内で横スクロールさせる。
function ActivityCalendar({ calendar }) {
  const colWidth = CELL + GAP
  return (
    <Box>
      <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
        {/* inline-flex で内容幅に合わせ、狭い画面ではこの器がスクロールする */}
        <Box sx={{ display: 'inline-flex', flexDirection: 'column' }}>
          {/* 月ラベル行（曜日ラベル列の分だけ左に寄せる） */}
          <Box sx={{ display: 'flex', pl: `${WEEKDAY_COL + GAP}px`, mb: 0.5 }}>
            {calendar.weeks.map((_, w) => {
              const month = calendar.months.find((m) => m.colIndex === w)
              return (
                <Box
                  key={w}
                  sx={{ width: colWidth, fontSize: 10, color: 'text.secondary', lineHeight: 1 }}
                >
                  {month?.label ?? ''}
                </Box>
              )
            })}
          </Box>

          {/* 曜日ラベル列 + 週ごとの縦7マス */}
          <Box sx={{ display: 'flex' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: WEEKDAY_COL, mr: `${GAP}px` }}>
              {WEEKDAY_LABELS.map((label, i) => (
                <Box
                  key={i}
                  sx={{
                    height: CELL,
                    mb: `${GAP}px`,
                    fontSize: 10,
                    color: 'text.secondary',
                    lineHeight: `${CELL}px`,
                  }}
                >
                  {label}
                </Box>
              ))}
            </Box>
            {calendar.weeks.map((col, w) => (
              <Box key={w} sx={{ display: 'flex', flexDirection: 'column', mr: `${GAP}px` }}>
                {col.map((day) => (
                  <Tooltip
                    key={day.dateKey}
                    title={day.future ? '' : `${day.dateKey}: ${day.count}問`}
                    arrow
                    disableInteractive
                  >
                    <Box sx={cellSx(day.level, day.future)} />
                  </Tooltip>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* サマリー */}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        直近26週で <SummaryNum>{calendar.totalDays}</SummaryNum>日・計{' '}
        <SummaryNum>{calendar.totalCount}</SummaryNum>問
      </Typography>
    </Box>
  )
}

// サマリー内の数値だけ一回り大きく強調する。
function SummaryNum({ children }) {
  return (
    <Box component="span" sx={{ fontSize: '1.25em', fontWeight: 700, color: 'text.primary' }}>
      {children}
    </Box>
  )
}

function StatTile({ icon, label, value }) {
  return (
    <Card>
      <CardContent sx={{ textAlign: 'center' }}>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ justifyContent: 'center', alignItems: 'center', mb: 0.5 }}
        >
          {icon}
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
        </Stack>
        <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.3 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}
