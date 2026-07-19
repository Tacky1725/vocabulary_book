import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import TextField from '@mui/material/TextField'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import QuizIcon from '@mui/icons-material/Quiz'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import SettingsIcon from '@mui/icons-material/Settings'
import AddIcon from '@mui/icons-material/Add'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import { useWords } from '../hooks/useWords.js'
import { useTestSessions } from '../hooks/useTestSessions.js'
import { useSettings } from '../hooks/useSettings.js'
import { DataErrorState, LoadingState } from '../components/LoadingState.jsx'
import {
  calcStreak,
  calcMasteryDistribution,
  calcSummary,
  calcTodayProgress,
  buildActivityCalendar,
  toLocalDateKey,
} from '../lib/stats.js'
import {
  DEFAULT_REVIEW_INTERVALS,
  MAX_REVIEW_INTERVAL_DAYS,
  isDue,
  normalizeReviewIntervals,
  validateReviewIntervals,
} from '../lib/srs.js'

const RECENT_SESSION_COUNT = 5

// ヒートマップのマス寸法（px）。level 1〜4 は success.main の不透明度で濃淡を付ける。
const CELL = 13
const GAP = 3
const WEEKDAY_COL = 34
const LEVEL_OPACITY = [0, 0.25, 0.5, 0.75, 1]
// 曜日ラベル（0=日〜6=土）。全行に3文字略記で表示する。
const WEEKDAY_LABELS = ['Sun.', 'Mon.', 'Tue.', 'Wed.', 'Thu.', 'Fri.', 'Sat.']

// デイリーゴール。オフ始まり（enabled:false）。target はプリセットから選ぶ。
const DEFAULT_DAILY_GOAL = { metric: 'questions', target: 20, enabled: false }
const GOAL_TARGET_OPTIONS = [10, 20, 30, 50]
const GOAL_METRICS = [
  { id: 'questions', label: '出題数' },
  { id: 'newWords', label: '新規追加した語数' },
]
const goalMetricLabel = (metric) =>
  GOAL_METRICS.find((m) => m.id === metric)?.label ?? GOAL_METRICS[0].label

const MASTERY_BAR_COLOR = {
  unlearned: 'action.disabled',
  learning: 'primary.main',
  mastered: 'success.main',
}

export default function Dashboard() {
  const { words, isLoading: wordsLoading, error: wordsError } = useWords()
  const { sessions, isLoading: sessionsLoading, error: sessionsError } = useTestSessions()
  const {
    settings,
    updateSettings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useSettings()

  const summary = useMemo(() => calcSummary(words, sessions), [words, sessions])
  const streak = useMemo(() => calcStreak(sessions), [sessions])
  const distribution = useMemo(() => calcMasteryDistribution(words), [words])
  const calendar = useMemo(() => buildActivityCalendar(sessions), [sessions])
  const todayProgress = useMemo(() => calcTodayProgress(words, sessions), [words, sessions])
  const reviewCount = useMemo(() => words.filter((word) => isDue(word)).length, [words])
  const unlearnedCount = useMemo(
    () => words.filter((word) => !word.srs?.dueAt).length,
    [words],
  )
  const reviewIntervals = useMemo(
    () => normalizeReviewIntervals(settings.reviewIntervals),
    [settings.reviewIntervals],
  )

  const dailyGoal = settings.dailyGoal ?? DEFAULT_DAILY_GOAL
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)

  // 直近のセッションを新しい順に数件
  const recentSessions = useMemo(
    () => sessions.slice(-RECENT_SESSION_COUNT).reverse(),
    [sessions],
  )

  const hasWords = summary.totalWords > 0
  const hasTests = summary.totalTests > 0

  if (wordsLoading || sessionsLoading || settingsLoading) return <LoadingState />
  if (wordsError || sessionsError || settingsError) return <DataErrorState />

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

      {/* 今日の目標（デイリーゴール） */}
      <DailyGoalCard
        goal={dailyGoal}
        progress={todayProgress}
        onEdit={() => setGoalDialogOpen(true)}
      />

      <ReviewQueueCard
        reviewCount={reviewCount}
        unlearnedCount={unlearnedCount}
        onSettings={() => setReviewDialogOpen(true)}
      />

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

      <GoalSettingsDialog
        open={goalDialogOpen}
        initial={dailyGoal}
        onClose={() => setGoalDialogOpen(false)}
        onSave={(next) => {
          // dailyGoal だけを patch（他機能が同じ settings ドキュメントを共有するため丸ごと上書きしない）
          updateSettings({ dailyGoal: next })
          setGoalDialogOpen(false)
        }}
      />

      <ReviewIntervalSettingsDialog
        open={reviewDialogOpen}
        initial={reviewIntervals}
        onClose={() => setReviewDialogOpen(false)}
        onSave={(next) => {
          updateSettings({ reviewIntervals: next })
          setReviewDialogOpen(false)
        }}
      />
    </Stack>
  )
}

// 復習間隔の自動調整に基づく今日の復習導線。専門用語は表示せず、行動に直結する文言にする。
function ReviewQueueCard({ reviewCount, unlearnedCount, onSettings }) {
  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}
        >
          <Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <ReplayIcon color="primary" fontSize="small" />
              <Typography variant="h6" component="h3">
                今日の復習
              </Typography>
            </Stack>
            {reviewCount > 0 ? (
              <Typography color="text.secondary">
                忘れそうな単語が {reviewCount} 語あります。
              </Typography>
            ) : (
              <Typography color="text.secondary">
                今日の復習はありません。未学習の単語は {unlearnedCount} 語です。
              </Typography>
            )}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              component={Link}
              to="/test?mode=review"
              variant={reviewCount > 0 ? 'contained' : 'outlined'}
              startIcon={<PlayArrowIcon />}
              disabled={reviewCount === 0}
            >
              復習を始める
            </Button>
            <Button variant="outlined" startIcon={<SettingsIcon />} onClick={onSettings}>
              間隔を設定
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

const REVIEW_INTERVAL_FIELDS = [
  { key: 'correctFirstDays', label: '正解・1回目', helper: '初めて正解した後' },
  { key: 'correctSecondDays', label: '正解・2回目', helper: '2回連続で正解した後' },
  {
    key: 'correctLaterMinDays',
    label: '正解・3回目以降の最低値',
    helper: '自動計算された間隔が短くならないための下限',
  },
  { key: 'incorrectDays', label: '不正解', helper: '不正解を選んだ後' },
  { key: 'unknownDays', label: '「わからない」', helper: '「わからない」を選んだ後' },
  { key: 'masteredDays', label: '「習得済みにする」', helper: '手動で習得済みにした後' },
]

function ReviewIntervalSettingsDialog({ open, initial, onClose, onSave }) {
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      setDraft(initial)
      setErrors({})
    }
  }, [open, initial])

  const handleSave = () => {
    const validation = validateReviewIntervals(draft)
    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }
    onSave(normalizeReviewIntervals(draft))
  }

  const resetDefaults = () => {
    setDraft({ ...DEFAULT_REVIEW_INTERVALS })
    setErrors({})
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>復習間隔を設定</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2
         }}>
          正解状況に応じて、次に復習する日を自動的に調整します。設定値は復習間隔の基準として使われます。0日に設定すると本日中に再び復習対象になります。
        </Typography>
        <Stack spacing={3}>
          {REVIEW_INTERVAL_FIELDS.map((field) => (
            <TextField
              key={field.key}
              fullWidth
              type="number"
              label={`${field.label}（日）`}
              value={draft[field.key]}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                setErrors((prev) => ({ ...prev, [field.key]: undefined }))
              }}
              error={Boolean(errors[field.key])}
              helperText={errors[field.key] ?? `${field.helper}`}
              inputProps={{ min: 0, max: MAX_REVIEW_INTERVAL_DAYS, step: 1 }}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={resetDefaults}>標準値に戻す</Button>
        <Button onClick={onClose}>キャンセル</Button>
        <Button variant="contained" onClick={handleSave}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
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

// 今日の目標カード。進捗は算出値（Firestore に実績は書かない）。オフ時は設定導線を出す。
function DailyGoalCard({ goal, progress, onEdit }) {
  const current = goal.metric === 'newWords' ? progress.newWordsToday : progress.answeredToday
  const percent = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0
  const achieved = current >= goal.target
  const unit = goal.metric === 'newWords' ? '語' : '問'

  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: goal.enabled ? 1.5 : 0 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TrackChangesIcon color="primary" fontSize="small" />
            <Typography variant="h6" component="h3">
              今日の目標
            </Typography>
          </Stack>
          <IconButton aria-label="目標を設定" size="small" onClick={onEdit}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Stack>

        {goal.enabled ? (
          <Box>
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}
            >
              <Typography variant="body2">{goalMetricLabel(goal.metric)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {current} / {goal.target} {unit}
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
                  bgcolor: achieved ? 'success.main' : 'primary.main',
                  borderRadius: 999,
                },
              }}
            />
            {achieved && (
              <Alert severity="success" sx={{ mt: 1.5 }}>
                今日の目標を達成しました！🎉
              </Alert>
            )}
          </Box>
        ) : (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Typography color="text.secondary">
              1日の学習目標を設定すると、今日の進捗が表示されます。
            </Typography>
            <Button variant="outlined" startIcon={<SettingsIcon />} onClick={onEdit}>
              目標を設定する
            </Button>
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

// 目標設定ダイアログ。開くたびに現在値で初期化し、保存時に dailyGoal をまとめて patch する。
function GoalSettingsDialog({ open, initial, onClose, onSave }) {
  const [metric, setMetric] = useState(initial.metric)
  const [target, setTarget] = useState(initial.target)
  const [enabled, setEnabled] = useState(initial.enabled)

  useEffect(() => {
    if (open) {
      setMetric(initial.metric)
      setTarget(initial.target)
      setEnabled(initial.enabled)
    }
  }, [open, initial.metric, initial.target, initial.enabled])

  // 別端末などでプリセット外の値が入っていても選べるように、現在値を選択肢に含める
  const targetOptions = GOAL_TARGET_OPTIONS.includes(target)
    ? GOAL_TARGET_OPTIONS
    : [...GOAL_TARGET_OPTIONS, target].sort((a, b) => a - b)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>今日の目標を設定</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
            label="デイリーゴールを有効にする"
          />
          <FormControl fullWidth disabled={!enabled}>
            <InputLabel id="goal-metric-label">指標</InputLabel>
            <Select
              labelId="goal-metric-label"
              label="指標"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {GOAL_METRICS.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!enabled}>
            <InputLabel id="goal-target-label">1日の目標</InputLabel>
            <Select
              labelId="goal-target-label"
              label="1日の目標"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {targetOptions.map((t) => (
                <MenuItem key={t} value={t}>
                  {t} {metric === 'newWords' ? '語' : '問'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        <Button
          variant="contained"
          onClick={() => onSave({ metric, target: Number(target), enabled })}
        >
          保存
        </Button>
      </DialogActions>
    </Dialog>
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
