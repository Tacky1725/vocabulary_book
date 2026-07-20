import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { WEEKLY_CHALLENGE_TARGET } from '../lib/socialStats.js'

// 週間チャレンジ（今週100問）の進捗カード。Ranking画面とDashboardの両方から使う共有コンポーネント。
// childrenに導線ボタン等を渡せる（Dashboard側は「ランキングを見る」ボタンを追加する）。
export function WeeklyChallengeCard({ count, completed, children }) {
  const progress = Math.min(100, (count / WEEKLY_CHALLENGE_TARGET) * 100)
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <EmojiEventsIcon color="primary" fontSize="small" />
            <Typography variant="h6">今週のチャレンジ</Typography>
          </Stack>
          {completed && <Chip icon={<EmojiEventsIcon />} label="達成！" color="success" />}
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          100問解こう
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 8, borderRadius: 4, mb: 0.5 }}
        />
        <Typography variant="body2" color="text.secondary">
          {count} / {WEEKLY_CHALLENGE_TARGET}問
        </Typography>
        {children}
      </CardContent>
    </Card>
  )
}
