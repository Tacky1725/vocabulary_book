import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import QuizIcon from '@mui/icons-material/Quiz'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ReplayIcon from '@mui/icons-material/Replay'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import {
  QUIZ_MODES,
  MIN_WORDS_FOR_TEST,
  pickQuestionWords,
  buildQuestions,
  applyAnswerResult,
  markAsMastered,
} from '../lib/quiz.js'
import { hasMeaningJa, joinedMeaningJa } from '../lib/senses.js'
import { CEFR_LEVELS, collectKnownCategories } from '../lib/attributes.js'
import { useWords } from '../hooks/useWords.js'
import { useTestSessions } from '../hooks/useTestSessions.js'
import { DataErrorState, LoadingState } from '../components/LoadingState.jsx'

const COUNT_OPTIONS = [
  { value: '10', label: '10問' },
  { value: '20', label: '20問' },
  { value: 'all', label: '全問' },
]

export default function TestPage() {
  const { words, updateWords, isLoading: wordsLoading, error: wordsError } = useWords()
  const {
    recordTestSession,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useTestSessions()

  // 画面状態: setup（設定） → quiz（出題中） → result（結果）
  const [phase, setPhase] = useState('setup')
  const [mode, setMode] = useState('random')
  const [countOption, setCountOption] = useState('10')
  // 出題範囲フィルタ: 出題モード（QUESTION_PICKERS）とは直交する絞り込み。空配列は「絞り込みなし」
  const [cefrFilter, setCefrFilter] = useState([])
  const [categoryFilter, setCategoryFilter] = useState([])

  // 出題中の状態
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  // 回答済みなら選んだ答え: 選択肢のindex（number）| 'none'（この中にはない）| 'unknown'（わからない）
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [score, setScore] = useState(0)
  const [wrongWords, setWrongWords] = useState([])

  // 出題対象: 日本語訳がある単語のみ（正解選択肢が作れないため）
  const eligibleWords = useMemo(() => words.filter(hasMeaningJa), [words])
  const knownCategories = useMemo(() => collectKnownCategories(words), [words])
  // CEFR・カテゴリによる出題範囲フィルタ（出題モードとは直交）。空配列は絞り込みなし。
  // ダミー選択肢の多様性のため、buildQuestions には絞り込み前の eligibleWords を渡す（下記）。
  const filteredWords = useMemo(() => {
    let filtered = eligibleWords
    if (cefrFilter.length > 0) filtered = filtered.filter((w) => cefrFilter.includes(w.cefr))
    if (categoryFilter.length > 0) {
      const wanted = categoryFilter.map((t) => t.toLowerCase())
      filtered = filtered.filter((w) =>
        (w.categories ?? []).some((tag) => wanted.includes(tag.toLowerCase()))
      )
    }
    return filtered
  }, [eligibleWords, cefrFilter, categoryFilter])
  const isFilteringRange = cefrFilter.length > 0 || categoryFilter.length > 0
  // 選択中モードで実際に出題できる語（count=null で全件）。ピッカー自身を単一の真実として使う。
  // random/recent/weak は filteredWords 全件だが、unlearned のようにフィルタするモードは減る。
  const modeWords = useMemo(
    () => pickQuestionWords(filteredWords, null, mode),
    [filteredWords, mode]
  )
  const hasEnoughEligible = eligibleWords.length >= MIN_WORDS_FOR_TEST
  // 全体・モード別・範囲フィルタの三方で最低語数を満たすこと。
  const canStart = hasEnoughEligible && modeWords.length >= MIN_WORDS_FOR_TEST
  const currentModeLabel = QUIZ_MODES.find((m) => m.id === mode)?.label ?? ''

  if (wordsLoading || sessionsLoading) return <LoadingState />
  if (wordsError || sessionsError) return <DataErrorState />

  function startTest() {
    const count = countOption === 'all' ? null : Number(countOption)
    const picked = pickQuestionWords(filteredWords, count, mode)
    if (picked.length < MIN_WORDS_FOR_TEST) return
    setQuestions(buildQuestions(picked, eligibleWords))
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setScore(0)
    setWrongWords([])
    setPhase('quiz')
  }

  function handleAnswer(answer) {
    if (selectedAnswer !== null) return // 回答済みなら無視
    const question = questions[currentIndex]
    const isCorrect = isAnswerCorrect(question, answer)
    setSelectedAnswer(answer)
    if (isCorrect) {
      setScore((prev) => prev + 1)
    } else {
      setWrongWords((prev) => [...prev, question.word])
    }
    // 回答結果を即時に永続化（1問ごとに保存）
    updateWords((prev) =>
      prev.map((w) => (w.id === question.word.id ? applyAnswerResult(w, isCorrect) : w))
    )
  }

  function goNext() {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null)
    } else {
      // 結果画面への遷移時に1回だけ記録する（effectではなくハンドラ内で呼び二重記録を防ぐ）
      recordTestSession({ total: questions.length, correct: score })
      setPhase('result')
    }
  }

  // 「習得済みにする」: masteryLevel を最大値にして、そのまま次の問題へ進む
  function markMasteredAndNext() {
    const question = questions[currentIndex]
    updateWords((prev) => prev.map((w) => (w.id === question.word.id ? markAsMastered(w) : w)))
    goNext()
  }

  function restart() {
    setPhase('setup')
    setQuestions([])
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setScore(0)
    setWrongWords([])
  }

  if (phase === 'quiz') {
    return (
      <QuizScreen
        question={questions[currentIndex]}
        currentIndex={currentIndex}
        total={questions.length}
        score={score}
        selectedAnswer={selectedAnswer}
        onAnswer={handleAnswer}
        onNext={goNext}
        onMastered={markMasteredAndNext}
      />
    )
  }

  if (phase === 'result') {
    return (
      <ResultScreen
        total={questions.length}
        score={score}
        wrongWords={wrongWords}
        onRestart={restart}
      />
    )
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <QuizIcon color="primary" />
          <Typography variant="h5" component="h2">
            単語テスト
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          出題モードと問題数を選んでください。
        </Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="quiz-mode-label">出題モード</InputLabel>
          <Select
            labelId="quiz-mode-label"
            label="出題モード"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {QUIZ_MODES.map((m) => (
              <MenuItem key={m.id} value={m.id} disabled={!m.available}>
                {m.label}
                {m.available ? '' : '（準備中）'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="quiz-count-label">問題数</InputLabel>
          <Select
            labelId="quiz-count-label"
            label="問題数"
            value={countOption}
            onChange={(e) => setCountOption(e.target.value)}
          >
            {COUNT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary">
            出題範囲（CEFR・カテゴリ）
          </Typography>
          <Button
            size="small"
            startIcon={<FilterAltOffIcon />}
            onClick={() => {
              setCefrFilter([])
              setCategoryFilter([])
            }}
            disabled={!isFilteringRange}
          >
            絞り込みをリセット
          </Button>
        </Stack>
        <ToggleButtonGroup
          value={cefrFilter}
          onChange={(e, newValue) => setCefrFilter(newValue)}
          aria-label="CEFRで絞り込み"
          color="primary"
          size="small"
          sx={{ mb: 2, flexWrap: 'wrap' }}
        >
          {CEFR_LEVELS.map((level) => (
            <ToggleButton key={level} value={level} aria-label={level}>
              {level}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Autocomplete
          multiple
          size="small"
          options={knownCategories}
          value={categoryFilter}
          onChange={(e, newValue) => setCategoryFilter(newValue)}
          sx={{ mb: 2 }}
          renderInput={(params) => <TextField {...params} label="出題範囲（カテゴリ）" />}
        />

        <Typography color="text.secondary" sx={{ mb: 2 }}>
          出題対象: {modeWords.length} 語（{currentModeLabel}）
        </Typography>

        {!hasEnoughEligible && (
          <Alert severity="error" sx={{ mb: 2 }}>
            テストを開始するには日本語訳のある単語が{MIN_WORDS_FOR_TEST}語以上必要です。
            <Link component={RouterLink} to="/add" sx={{ ml: 0.5 }}>
              単語を追加する
            </Link>
          </Alert>
        )}

        {/* 全体は足りているが、選択モード・範囲フィルタでの出題対象が不足しているケース */}
        {hasEnoughEligible && !canStart && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            「{currentModeLabel}」
            {isFilteringRange ? '・選択した出題範囲' : ''}の出題対象が{MIN_WORDS_FOR_TEST}
            語未満です。{isFilteringRange ? '範囲を広げる、別のモードを選ぶ、' : '別のモードを選ぶか、'}
            単語を追加してください。
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={startTest}
          disabled={!canStart}
        >
          テスト開始
        </Button>
      </CardContent>
    </Card>
  )
}

// 回答（選択肢のindex | 'none' | 'unknown'）の正誤を判定する。
// 「この中にはない」は正解なし問題でのみ正解、「わからない」は常に不正解。
function isAnswerCorrect(question, answer) {
  if (answer === 'none') return question.noneIsCorrect
  if (answer === 'unknown') return false
  return question.choices[answer].isCorrect
}

// 回答済みの回答ボタンの見た目（正解=緑・選んだ不正解=赤・その他=薄く）。
// 4択と「この中にはない」「わからない」で共用する。
// Button はdisabled時に既定でopacityとcolorを落とすため、Mui-disabled側にも明示的に上書きする。
function answerSx(answered, isCorrectAnswer, isSelected) {
  const base = { justifyContent: 'flex-start', textAlign: 'left', py: 1.5, px: 2 }
  if (!answered) return base
  if (isCorrectAnswer) {
    return {
      ...base,
      '&.Mui-disabled': {
        borderColor: 'success.main',
        color: 'success.main',
        bgcolor: 'rgba(46, 158, 91, 0.12)',
        fontWeight: 600,
        opacity: 1,
      },
    }
  }
  if (isSelected) {
    return {
      ...base,
      '&.Mui-disabled': {
        borderColor: 'error.main',
        color: 'error.main',
        bgcolor: 'rgba(214, 69, 69, 0.1)',
        opacity: 1,
      },
    }
  }
  return { ...base, '&.Mui-disabled': { opacity: 0.55 } }
}

function QuizScreen({
  question,
  currentIndex,
  total,
  score,
  selectedAnswer,
  onAnswer,
  onNext,
  onMastered,
}) {
  const answered = selectedAnswer !== null
  const isCorrect = answered && isAnswerCorrect(question, selectedAnswer)
  const correctChoice = question.choices.find((c) => c.isCorrect)
  const isLast = currentIndex + 1 === total
  const { word } = question
  // フィードバックに出す語義: 日本語訳のあるものだけ（多すぎる場合は8件まで）
  const feedbackSenses = (word.senses ?? [])
    .filter((s) => s.meaningJa && s.meaningJa.trim() !== '')
    .slice(0, 8)

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Chip label={`${currentIndex + 1} / ${total}`} size="small" />
          <Typography color="text.secondary">スコア: {score}</Typography>
        </Stack>

        <Box sx={{ textAlign: 'center', my: 2.5 }}>
          <Typography variant="h4" fontWeight={700}>
            {word.word}
          </Typography>
          {word.phonetic && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {word.phonetic}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: 'grid',
            // スマホは1列固定でタップしやすく、PC以上は2列に折り返す
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(220px, 1fr))' },
            gap: 1.25,
            mb: 2,
          }}
        >
          {question.choices.map((choice, i) => (
            <Button
              key={i}
              variant="outlined"
              onClick={() => onAnswer(i)}
              disabled={answered}
              sx={answerSx(answered, choice.isCorrect, i === selectedAnswer)}
              endIcon={
                answered && choice.isCorrect ? (
                  <CheckCircleIcon color="success" />
                ) : answered && i === selectedAnswer ? (
                  <CancelIcon color="error" />
                ) : null
              }
            >
              {choice.meaningJa}
            </Button>
          ))}
        </Box>

        {/* 特殊回答: 「この中にはない」は正解なし問題でのみ正解、「わからない」は常に不正解 */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => onAnswer('none')}
            disabled={answered}
            sx={{
              ...answerSx(answered, question.noneIsCorrect, selectedAnswer === 'none'),
              justifyContent: 'center',
              textAlign: 'center',
            }}
            endIcon={
              answered && question.noneIsCorrect ? (
                <CheckCircleIcon color="success" />
              ) : answered && selectedAnswer === 'none' ? (
                <CancelIcon color="error" />
              ) : null
            }
          >
            この中にはない
          </Button>
          <Button
            fullWidth
            variant="outlined"
            color="inherit"
            onClick={() => onAnswer('unknown')}
            disabled={answered}
            sx={{
              ...answerSx(answered, false, selectedAnswer === 'unknown'),
              justifyContent: 'center',
              textAlign: 'center',
            }}
            endIcon={
              answered && selectedAnswer === 'unknown' ? <CancelIcon color="error" /> : null
            }
          >
            わからない
          </Button>
        </Stack>

        {answered && (
          <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1 }}>
              {isCorrect ? (
                <>
                  <CheckCircleIcon color="success" fontSize="small" />
                  <Typography color="success.main" fontWeight={700}>
                    {question.noneIsCorrect
                      ? '正解！選択肢に正しい意味はありませんでした'
                      : '正解！'}
                  </Typography>
                </>
              ) : (
                <>
                  <CancelIcon color="error" fontSize="small" />
                  <Typography color="error.main" fontWeight={700}>
                    不正解…正解は「
                    {question.noneIsCorrect ? 'この中にはない' : correctChoice?.meaningJa}」
                  </Typography>
                </>
              )}
            </Stack>

            {feedbackSenses.length > 0 && (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {question.noneIsCorrect && (
                  <Typography variant="subtitle2" color="text.secondary">
                    本来の意味:
                  </Typography>
                )}
                {feedbackSenses.map((sense, i) => (
                  <Stack key={i} spacing={0.25}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      {sense.partOfSpeech && <Chip label={sense.partOfSpeech} size="small" />}
                      <Typography fontWeight={600}>{sense.meaningJa}</Typography>
                    </Stack>
                    {sense.meaningEn && (
                      <Typography variant="body2" color="text.secondary">
                        英語での意味: {sense.meaningEn}
                      </Typography>
                    )}
                    {sense.example && (
                      <Typography variant="body2" color="text.secondary">
                        例文: {sense.example}
                      </Typography>
                    )}
                    {sense.exampleJa && (
                      <Typography variant="body2" color="text.secondary">
                        （{sense.exampleJa}）
                      </Typography>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}

            <Stack direction="row" spacing={1.25} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={onNext}>
                {isLast ? '結果を見る' : '次へ'}
              </Button>
              <Button
                variant="outlined"
                color="success"
                startIcon={<DoneAllIcon />}
                onClick={onMastered}
              >
                習得済みにする
              </Button>
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

function ResultScreen({ total, score, wrongWords, onRestart }) {
  const rate = total > 0 ? Math.round((score / total) * 100) : 0

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <EmojiEventsIcon color="warning" />
          <Typography variant="h5" component="h2">
            テスト結果
          </Typography>
        </Stack>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {total}問中 {score}問正解（正答率 {rate}%）
        </Typography>

        {wrongWords.length > 0 ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" component="h3" gutterBottom>
              間違えた単語
            </Typography>
            <List dense disablePadding>
              {wrongWords.map((w) => (
                <ListItem key={w.id} disablePadding sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={<Typography fontWeight={700}>{w.word}</Typography>}
                    secondary={joinedMeaningJa(w)}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ) : (
          <Alert severity="success" sx={{ mb: 2 }}>
            全問正解です。お見事！
          </Alert>
        )}

        <Button variant="contained" startIcon={<ReplayIcon />} onClick={onRestart}>
          もう一度テスト
        </Button>
      </CardContent>
    </Card>
  )
}
