import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import QuizIcon from '@mui/icons-material/Quiz'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import AddIcon from '@mui/icons-material/Add'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { useWords } from '../hooks/useWords.js'
import { useTestSessions } from '../hooks/useTestSessions.js'
import { calcStreak, calcMasteryDistribution, calcSummary, toLocalDateKey } from '../lib/stats.js'

const RECENT_SESSION_COUNT = 5

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
          value={`${streak}日`}
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
