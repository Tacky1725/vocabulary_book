// 暗記カード（#9）。現時点では仮ページ。
// 仕様は docs/roadmap/09-flashcards.md を参照。実装時にここへ
// 設定→表示→結果の3画面と自己申告（覚えた／まだ）を入れる。
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import StyleIcon from '@mui/icons-material/Style'

export default function Flashcard() {
  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h2">
        暗記カード
      </Typography>
      <Card>
        <CardContent>
          <Stack spacing={1.5} sx={{ alignItems: 'center', py: 4, textAlign: 'center' }}>
            <StyleIcon color="disabled" sx={{ fontSize: 48 }} />
            <Typography variant="h6" component="h3">
              準備中
            </Typography>
            <Typography variant="body2" color="text.secondary">
              単語・熟語をカードで覚える暗記カードは近日追加予定です。
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
