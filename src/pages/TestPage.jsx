import { useEffect, useMemo, useRef, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
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
  QUESTION_TYPES,
  QUESTION_FORMATS,
  pickQuestionWords,
  buildQuestions,
  applyAnswerResult,
  markAsMastered,
  getChoiceText,
  completeFillBlankAnswer,
  getFillBlankInputValidation,
  isQuestionAnswerCorrect,
} from '../lib/quiz.js'
import {
  DEFAULT_REVIEW_INTERVALS,
  applyReviewOutcome,
  markAsMasteredWithSrs,
  normalizeReviewIntervals,
  reviewOutcomeFromAnswer,
} from '../lib/srs.js'
import { hasMeaningJa, joinedMeaningJa } from '../lib/senses.js'
import { CEFR_LEVELS, collectKnownCategories } from '../lib/attributes.js'
import { useWords } from '../hooks/useWords.js'
import { useTestSessions } from '../hooks/useTestSessions.js'
import { useSettings } from '../hooks/useSettings.js'
import { useFillBlankQuestionCache } from '../hooks/useFillBlankQuestionCache.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { DataErrorState, LoadingState } from '../components/LoadingState.jsx'
import { formatDuration } from '../lib/stats.js'
import { useQuestionTimer } from '../hooks/useQuestionTimer.js'

const COUNT_OPTIONS = [
  { value: '10', label: '10問' },
  { value: '20', label: '20問' },
  { value: 'all', label: '全問' },
]

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

export default function TestPage() {
  const { user } = useAuth()
  const { words, updateWords, isLoading: wordsLoading, error: wordsError } = useWords()
  const {
    recordTestSession,
    recordLeaderboardAnswer,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useTestSessions()
  const {
    settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useSettings()

  // 画面状態: setup（設定） → quiz（出題中） → result（結果）
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('mode')
  const defaultMode = QUIZ_MODES.some((m) => m.id === initialMode && m.available)
    ? initialMode
    : 'random'
  const [phase, setPhase] = useState('setup')
  const [mode, setMode] = useState(defaultMode)
  const [questionType, setQuestionType] = useState(QUESTION_TYPES.MEANING_CHOICE)
  const [countOption, setCountOption] = useState('10')
  // 出題範囲フィルタ: 出題モード（QUESTION_PICKERS）とは直交する絞り込み。空配列は「絞り込みなし」
  const [cefrFilter, setCefrFilter] = useState([])
  const [categoryFilter, setCategoryFilter] = useState([])

  // 出題中の状態
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  // 回答済みなら選んだ答え: 選択肢index | 特殊回答 | { kind: 'typed', value }（穴埋め入力）
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [score, setScore] = useState(0)
  const [wrongWords, setWrongWords] = useState([])
  const [activeReviewIntervals, setActiveReviewIntervals] = useState(DEFAULT_REVIEW_INTERVALS)
  const [totalElapsedMs, setTotalElapsedMs] = useState(0)
  const totalElapsedMsRef = useRef(0)
  const questionTimer = useQuestionTimer()
  const {
    questionsByWordId: fillBlankQuestionsByWordId,
    isGenerating: isFillBlankGenerating,
  } = useFillBlankQuestionCache(words, user?.uid, wordsLoading)

  // 問題が表示された時点で開始する。回答後はhandleAnswerが停止するため、
  // 正誤フィードバックから「次へ」までの待ち時間は計測されない。
  useEffect(() => {
    if (phase !== 'quiz') return
    questionTimer.start()
  }, [phase, currentIndex, questionTimer.start])

  // 出題対象は問題形式ごとに判定する。日本語→英語では英単語も必須。
  const eligibleWords = useMemo(
    () =>
      questionType === QUESTION_TYPES.FILL_BLANK
        ? words.filter((word) => fillBlankQuestionsByWordId.has(word.id))
        : words.filter((word) => {
            if (!hasMeaningJa(word)) return false
            if (questionType === QUESTION_TYPES.MEANING_TO_WORD) {
              return String(word.word ?? '').trim() !== ''
            }
            return true
          }),
    [words, questionType, fillBlankQuestionsByWordId],
  )
  const knownCategories = useMemo(() => collectKnownCategories(words), [words])
  const reviewIntervals = useMemo(
    () => normalizeReviewIntervals(settings.reviewIntervals),
    [settings.reviewIntervals],
  )
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
  const requiredEligibleCount =
    questionType === QUESTION_TYPES.FILL_BLANK ? 1 : MIN_WORDS_FOR_TEST
  const hasEnoughEligible = eligibleWords.length >= requiredEligibleCount
  const hasEnoughDistinctAnswers =
    questionType !== QUESTION_TYPES.MEANING_TO_WORD ||
    new Set(eligibleWords.map((word) => String(word.word ?? '').trim().toLowerCase())).size >=
      MIN_WORDS_FOR_TEST
  // 穴埋めはダミー選択肢を必要としないため、どのモードでも1語から開始できる。
  // 選択式は通常4語、今日の復習だけ1語から開始できる既存仕様を維持する。
  const modeMinimum =
    questionType === QUESTION_TYPES.FILL_BLANK || mode === 'review' ? 1 : MIN_WORDS_FOR_TEST
  const canStart =
    hasEnoughEligible &&
    hasEnoughDistinctAnswers &&
    modeWords.length >= modeMinimum &&
    (questionType !== QUESTION_TYPES.FILL_BLANK || !isFillBlankGenerating)
  const currentModeLabel = QUIZ_MODES.find((m) => m.id === mode)?.label ?? ''
  const currentQuestionFormatLabel =
    QUESTION_FORMATS.find((format) => format.type === questionType)?.label ?? ''
  const eligibilityLabel =
    questionType === QUESTION_TYPES.MEANING_TO_WORD
      ? '日本語訳と英単語のある単語'
      : questionType === QUESTION_TYPES.FILL_BLANK
        ? '例文内に見出し語または活用形がある単語'
        : '日本語訳のある単語'

  if (wordsLoading || sessionsLoading || settingsLoading) return <LoadingState />
  if (wordsError || sessionsError || settingsError) return <DataErrorState />

  function startTest() {
    const count = countOption === 'all' ? null : Number(countOption)
    const picked = pickQuestionWords(filteredWords, count, mode)
    if (picked.length < modeMinimum) return
    const builtQuestions = buildQuestions(picked, eligibleWords, {
      type: questionType,
      ...(questionType === QUESTION_TYPES.FILL_BLANK ? { fillBlankQuestionsByWordId } : {}),
    })
    if (builtQuestions.length < modeMinimum) return
    scrollToPageTop()
    setQuestions(builtQuestions)
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setScore(0)
    setWrongWords([])
    setTotalElapsedMs(0)
    totalElapsedMsRef.current = 0
    questionTimer.reset()
    // テスト中に別タブで設定が変わっても、進行中の問題の条件を揃える。
    setActiveReviewIntervals(reviewIntervals)
    setPhase('quiz')
  }

  function handleAnswer(answer) {
    if (selectedAnswer !== null) return // 回答済みなら無視
    const question = questions[currentIndex]
    const isCorrect = isQuestionAnswerCorrect(question, answer)
    setSelectedAnswer(answer)
    recordLeaderboardAnswer() // 有効回答数+1（正誤・特殊回答を問わずここで確定する）
    if (isCorrect) {
      setScore((prev) => prev + 1)
    } else {
      setWrongWords((prev) => [...prev, question.word])
    }
    // 回答時間を先に確定し、正誤判定後の待ち時間を含めない。
    const elapsedMs = questionTimer.stop()
    totalElapsedMsRef.current += elapsedMs
    setTotalElapsedMs(totalElapsedMsRef.current)
    // 正誤フィードバックを先に描画する。単語一覧全体の更新・Firestore同期は
    // 次のタスクへ回し、Enter押下後の画面更新を待たせない。
    const reviewedAt = new Date()
    const outcome = reviewOutcomeFromAnswer(answer, isCorrect)
    setTimeout(() => {
      updateWords((prev) =>
        prev.map((w) => {
          if (w.id !== question.word.id) return w
          return {
            ...applyAnswerResult(w, isCorrect),
            srs: applyReviewOutcome(w.srs, outcome, reviewedAt, activeReviewIntervals),
          }
        })
      )
    }, 0)
  }

  function goNext() {
    if (currentIndex + 1 < questions.length) {
      scrollToPageTop()
      setCurrentIndex((prev) => prev + 1)
      setSelectedAnswer(null)
    } else {
      scrollToPageTop()
      // 結果画面への遷移時に1回だけ記録する（effectではなくハンドラ内で呼び二重記録を防ぐ）
      recordTestSession({
        total: questions.length,
        correct: score,
        durationMs: totalElapsedMsRef.current,
      })
      setPhase('result')
    }
  }

  // 「習得済みにする」: 習熟度を最大値にし、設定された日数後へ進める
  function markMasteredAndNext() {
    const question = questions[currentIndex]
    const masteredAt = new Date()
    updateWords((prev) =>
      prev.map((w) =>
        w.id === question.word.id
          ? {
              ...markAsMastered(w),
              srs: markAsMasteredWithSrs(w.srs, masteredAt, activeReviewIntervals),
            }
          : w,
      ),
    )
    goNext()
  }

  function restart() {
    scrollToPageTop()
    setPhase('setup')
    setQuestions([])
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setScore(0)
    setWrongWords([])
    setTotalElapsedMs(0)
    totalElapsedMsRef.current = 0
    questionTimer.reset()
  }

  if (phase === 'quiz') {
    return (
      <QuizScreen
        question={questions[currentIndex]}
        currentIndex={currentIndex}
        total={questions.length}
        score={score}
        selectedAnswer={selectedAnswer}
        elapsedMs={questionTimer.elapsedMs}
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
        durationMs={totalElapsedMs}
        onRestart={restart}
      />
    )
  }

  return (
    <Card sx={{ mb: { xs: 2, sm: 0 } }}>
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
          <InputLabel id="question-type-label">出題形式</InputLabel>
          <Select
            labelId="question-type-label"
            label="出題形式"
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value)}
          >
            {QUESTION_FORMATS.map((format) => (
              <MenuItem key={format.type} value={format.type} disabled={!format.available}>
                {format.label}
                {format.available ? '' : '（準備中）'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

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
          出題対象: {modeWords.length} 語（{currentModeLabel}・{currentQuestionFormatLabel}）
        </Typography>

        {!hasEnoughEligible && !isFillBlankGenerating && (
          <Alert severity="error" sx={{ mb: 2 }}>
            テストを開始するには{eligibilityLabel}が
            {requiredEligibleCount}語以上必要です。
            <Link component={RouterLink} to="/add" sx={{ ml: 0.5 }}>
              単語を追加する
            </Link>
          </Alert>
        )}

        {hasEnoughEligible && !hasEnoughDistinctAnswers && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            日本語→英語問題には、異なる英単語が{MIN_WORDS_FOR_TEST}語以上必要です。
            英単語の重複を確認するか、別の出題形式を選んでください。
          </Alert>
        )}

        {/* 全体は足りているが、選択モード・範囲フィルタでの出題対象が不足しているケース */}
        {hasEnoughEligible && hasEnoughDistinctAnswers && !canStart && !isFillBlankGenerating && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {mode === 'review'
              ? '今日の復習対象がありません。通常テストや未出題の語を学習できます。'
              : `「${currentModeLabel}」${isFilteringRange ? '・選択した出題範囲' : ''}の出題対象が${modeMinimum}語未満です。${isFilteringRange ? '範囲を広げる、別のモードを選ぶ、' : '別のモードを選ぶか、'}単語を追加してください。`}
          </Alert>
        )}

        {questionType === QUESTION_TYPES.FILL_BLANK && isFillBlankGenerating && (
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            テスト問題データ生成中...
          </Typography>
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

function FillBlankAnswer({
  answered,
  value,
  error,
  inputRef,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}) {
  if (answered) return null

  return (
    <Stack spacing={1.25} sx={{ mb: 2 }}>
      <Typography variant="body2" color="text.secondary">
        空欄部分を入力してください（Enterで回答）
      </Typography>
      <TextField
        inputRef={inputRef}
        autoFocus
        fullWidth
        label="空欄部分を入力"
        value={value}
        error={error}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        slotProps={{
          htmlInput: {
            inputMode: 'text',
            autoCapitalize: 'none',
            autoCorrect: 'off',
            autoComplete: 'off',
            enterKeyHint: 'done',
            spellCheck: false,
          },
        }}
      />
    </Stack>
  )
}

function PartialBlank({ surface, validation }) {
  let characterIndex = 0
  const segments = String(surface)
    .trim()
    .split(/(\s+)/)
    .map((part, partIndex) => {
      if (/^\s+$/.test(part)) return part
      const characters = part.match(/[A-Za-z0-9]/g) ?? []
      const nodes = characters.map((character, index) => {
        if (index === 0) {
          return (
            <Box component="span" key={`${partIndex}-${index}`}>
              {character}
            </Box>
          )
        }
        const typedCharacter = validation.typedCharacters[characterIndex]
        characterIndex += 1
        return (
          <Box
            component="span"
            key={`${partIndex}-${index}`}
            sx={
              typedCharacter && validation.isTooLong
                ? { color: 'error.main', fontWeight: 700 }
                : undefined
            }
          >
            {typedCharacter ?? '_'}
          </Box>
        )
      })
      return <Box component="span" key={`part-${partIndex}`}>{nodes}</Box>
    })

  // 文字数超過分は穴の末尾に追記する。先頭文字は常に問題文側の表示を残す。
  const overflowCharacters = validation.typedCharacters.slice(validation.expectedLength)
  return (
    <>
      {segments}
      {overflowCharacters.map((character, index) => (
        <Box component="span" key={`overflow-${index}`} sx={{ color: 'error.main', fontWeight: 700 }}>
          {character}
        </Box>
      ))}
    </>
  )
}

function FillBlankPrompt({ question, validation }) {
  const blanks = question.blanks ?? []
  if (blanks.length === 0) return question.prompt
  const nodes = []
  let cursor = 0
  blanks.forEach((blank, index) => {
    nodes.push(question.example.slice(cursor, blank.start))
    nodes.push(
      <PartialBlank
        key={`blank-${index}`}
        surface={blank.surface}
        validation={validation}
      />,
    )
    cursor = blank.end
  })
  nodes.push(question.example.slice(cursor))
  return nodes
}

function QuizScreen({
  question,
  currentIndex,
  total,
  score,
  selectedAnswer,
  elapsedMs,
  onAnswer,
  onNext,
  onMastered,
}) {
  const [typedValue, setTypedValue] = useState('')
  const fillBlankInputRef = useRef(null)
  const feedbackStartRef = useRef(null)
  const wasAnsweredRef = useRef(false)
  const isComposingRef = useRef(false)
  const didAdvanceOnEnterRef = useRef(false)
  const answered = selectedAnswer !== null
  const isCorrect = answered && isQuestionAnswerCorrect(question, selectedAnswer)
  const isFillBlank = question.type === QUESTION_TYPES.FILL_BLANK
  const fillBlankValidation = isFillBlank
    ? getFillBlankInputValidation(typedValue, question.answer)
    : null
  const fillBlankCanSubmit =
    !fillBlankValidation ||
    (!fillBlankValidation.isTooLong &&
      fillBlankValidation.typedCharacters.length === fillBlankValidation.expectedLength)
  const correctChoice = question.choices?.find((c) => c.isCorrect)
  const showNoneChoice =
    !question.type || question.type === QUESTION_TYPES.MEANING_CHOICE
  const isLast = currentIndex + 1 === total
  const { word } = question
  // フィードバックに出す語義: 日本語訳のあるものだけ（多すぎる場合は8件まで）
  const feedbackSenses = (word.senses ?? [])
    .filter((s) => s.meaningJa && s.meaningJa.trim() !== '')
    .slice(0, 8)
  const fillBlankMeaning =
    word.senses?.[question.match?.senseIndex]?.meaningJa?.trim() || joinedMeaningJa(word)

  useEffect(() => {
    setTypedValue('')
    isComposingRef.current = false
    didAdvanceOnEnterRef.current = false
  }, [question])

  // 実入力欄にフォーカスして、PCではすぐ入力できるようにする。
  // スマホでキーボードが自動表示されないブラウザでも、表示された入力欄をタップすれば
  // 端末標準キーボードを利用できる。
  useEffect(() => {
    if (!isFillBlank || answered) return
    fillBlankInputRef.current?.focus({ preventScroll: true })
  }, [question, isFillBlank, answered])

  // 回答後に解答解説の先頭へ移動する。スマホでは入力欄の消滅に伴って
  // キーボードが閉じ、viewportが変化するため、変化が落ち着いてから1回だけ実行する。
  useEffect(() => {
    const justAnswered = answered && !wasAnsweredRef.current
    wasAnsweredRef.current = answered
    if (!justAnswered) return undefined

    let timeoutId
    let didScroll = false
    const viewport = window.visualViewport
    const scrollToFeedback = () => {
      if (didScroll) return
      didScroll = true
      viewport?.removeEventListener('resize', scheduleScroll)
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      feedbackStartRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    }
    const scheduleScroll = () => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(scrollToFeedback, 250)
    }

    viewport?.addEventListener('resize', scheduleScroll)
    scheduleScroll()
    return () => {
      window.clearTimeout(timeoutId)
      viewport?.removeEventListener('resize', scheduleScroll)
    }
  }, [answered])

  // 回答後は、問題形式にかかわらず Enter で「次へ」（最終問では「結果を見る」）へ進む。
  useEffect(() => {
    if (!answered) return undefined

    const handleKeyDown = (event) => {
      if (event.key !== 'Enter' || event.isComposing || didAdvanceOnEnterRef.current) return
      event.preventDefault()
      didAdvanceOnEnterRef.current = true
      onNext()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [answered, onNext])

  function handleFillBlankKeyDown(event) {
    if (event.nativeEvent?.isComposing || event.isComposing || isComposingRef.current) return
    if (event.key !== 'Enter') return
    event.preventDefault()
    // 回答の状態更新によって window の「次へ」処理が同じEnterイベントを拾わないようにする。
    event.stopPropagation()
    if (fillBlankCanSubmit) onAnswer({ kind: 'typed', value: typedValue })
  }

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip label={`${currentIndex + 1} / ${total}`} size="small" />
            <Typography color="text.secondary">経過時間 {formatDuration(elapsedMs)}</Typography>
          </Stack>
          <Typography color="text.secondary">正解数: {score}</Typography>
        </Stack>

        <Box sx={{ textAlign: 'center', my: 2.5 }}>
          {isFillBlank && (
            <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 0.75 }}>
              意味: {fillBlankMeaning || '（日本語訳未登録）'}
            </Typography>
          )}
          <Typography
            variant="h4"
            fontWeight={700}
            sx={
              question.type === QUESTION_TYPES.MEANING_TO_WORD || isFillBlank
                ? { fontSize: '1.0625rem', lineHeight: 1.7 }
                : undefined
            }
          >
            {isFillBlank ? (
              <FillBlankPrompt
                question={question}
                validation={fillBlankValidation}
              />
            ) : (
              question.prompt ?? word.word
            )}
          </Typography>
          {isFillBlank && fillBlankValidation.isTooLong && (
            <Typography color="error.main" fontWeight={700} sx={{ mt: 0.75 }}>
              文字数は{fillBlankValidation.expectedLength}文字です
            </Typography>
          )}
          {word.phonetic && !isFillBlank && question.type !== QUESTION_TYPES.MEANING_TO_WORD && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {word.phonetic}
            </Typography>
          )}
        </Box>

        {isFillBlank ? (
          <FillBlankAnswer
            answered={answered}
            value={typedValue}
            error={fillBlankValidation.isTooLong}
            inputRef={fillBlankInputRef}
            onChange={(event) => setTypedValue(event.target.value)}
            onKeyDown={handleFillBlankKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
            }}
          />
        ) : (
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
                sx={{
                  ...answerSx(answered, choice.isCorrect, i === selectedAnswer),
                  textTransform: 'none',
                }}
                endIcon={
                  answered && choice.isCorrect ? (
                    <CheckCircleIcon color="success" />
                  ) : answered && i === selectedAnswer ? (
                    <CancelIcon color="error" />
                  ) : null
                }
              >
                {getChoiceText(choice)}
              </Button>
            ))}
          </Box>
        )}

        {/* 特殊回答: 「この中にはない」は英語→日本語問題だけで表示する */}
        <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
          {isFillBlank && (
            <Button
              fullWidth
              variant="contained"
              onClick={() => onAnswer({ kind: 'typed', value: typedValue })}
              disabled={answered || !fillBlankCanSubmit}
            >
              回答する
            </Button>
          )}
          {showNoneChoice && (
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
          )}
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
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              回答時間: {formatDuration(elapsedMs)}
            </Typography>
            <Stack
              ref={feedbackStartRef}
              direction="row"
              spacing={0.75}
              sx={{ alignItems: 'center', mb: 1, scrollMarginTop: 2 }}
            >
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
                isFillBlank ? (
                  <Stack spacing={0.25}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <CancelIcon color="error" fontSize="small" />
                      <Typography color="error.main" fontWeight={700}>
                        不正解…
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr',
                        columnGap: 0.5,
                        pl: 3,
                      }}
                    >
                      <Typography color="error.main" fontWeight={700} sx={{ textAlign: 'right' }}>
                        正解：
                      </Typography>
                      <Typography color="error.main" fontWeight={700}>
                        {question.answer}
                      </Typography>
                      <Typography color="error.main" fontWeight={700} sx={{ textAlign: 'right' }}>
                        入力した答え：
                      </Typography>
                      <Typography color="error.main" fontWeight={700}>
                        {selectedAnswer?.kind === 'typed'
                          ? completeFillBlankAnswer(selectedAnswer.value, question.answer)
                          : '未回答'}
                      </Typography>
                    </Box>
                  </Stack>
                ) : (
                  <>
                    <CancelIcon color="error" fontSize="small" />
                    <Typography color="error.main" fontWeight={700}>
                      不正解…正解は「
                      {question.noneIsCorrect ? 'この中にはない' : getChoiceText(correctChoice)}」
                    </Typography>
                  </>
                )
              )}
            </Stack>

            {question.type === QUESTION_TYPES.MEANING_TO_WORD && (
              <Stack spacing={0.25} sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  正解の英単語:
                </Typography>
                <Typography variant="h6" fontWeight={700}>
                  {word.word}
                </Typography>
                {word.phonetic && (
                  <Typography color="text.secondary">発音: {word.phonetic}</Typography>
                )}
              </Stack>
            )}

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
              <Button
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                onClick={onNext}
                sx={{ textTransform: 'none' }}
              >
                {isLast ? '結果を見る (Enter)' : '次へ (Enter)'}
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

function ResultScreen({ total, score, wrongWords, durationMs, onRestart }) {
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
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          回答時間: {formatDuration(durationMs)}
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
