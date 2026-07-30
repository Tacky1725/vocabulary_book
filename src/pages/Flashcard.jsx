// 暗記カード（#9）。設定 → カード表示 → 結果 の3画面。
// 出題順はテストと同じ pickQuestionWords を流用。自己申告（覚えた/まだ）で
// masteryLevel と srs を更新する（correctCount には触らない）。仕様は docs/roadmap/09-flashcards.md。
import { useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import StyleIcon from '@mui/icons-material/Style'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ReplayIcon from '@mui/icons-material/Replay'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff'
import { QUIZ_MODES, pickQuestionWords } from '../lib/quiz.js'
import {
  FLASHCARD_DIRECTIONS,
  MIN_ENTRIES_FOR_FLASHCARD,
  isEntryEligibleForFlashcard,
  applyFlashcardResult,
} from '../lib/flashcard.js'
import { joinedMeaningJa } from '../lib/senses.js'
import { CEFR_LEVELS, collectKnownCategories } from '../lib/attributes.js'
import { normalizeReviewIntervals } from '../lib/srs.js'
import { useEntries } from '../hooks/useEntries.js'
import { entryKindLabel, entryKindSearch } from '../hooks/useEntryKind.js'
import { useSettings } from '../hooks/useSettings.js'
import { useFlashcardSessions } from '../hooks/useFlashcardSessions.js'
import { DataErrorState, LoadingState } from '../components/LoadingState.jsx'
import CategoryQuickAdd from '../components/CategoryQuickAdd.jsx'

const COUNT_OPTIONS = [
  { value: '10', label: '10枚' },
  { value: '20', label: '20枚' },
  { value: 'all', label: '全部' },
]

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

// カードの表裏テキスト。en-ja: 表=英語 / 裏=日本語、ja-en: 表=日本語 / 裏=英語。
function cardFaces(entry, direction) {
  const en = entry.word
  const ja = joinedMeaningJa(entry) || '（日本語訳なし）'
  return direction === 'ja-en' ? { front: ja, back: en } : { front: en, back: ja }
}

export default function Flashcard() {
  // kind はこの画面の設定として持つ（ナビの「暗記カード」は /flashcard 固定のためローカル state）。
  const [kind, setKind] = useState('words') // 'words' | 'idioms' | 'mix'（ミックスは単語・熟語を合わせて出題）
  const isWordsOnly = kind === 'words'
  const unit = entryKindLabel(kind)
  const {
    entries: wordEntries,
    updateEntries: updateWordEntries,
    isLoading: wordEntriesLoading,
    error: wordEntriesError,
  } = useEntries('words')
  const {
    entries: idiomEntries,
    updateEntries: updateIdiomEntries,
    isLoading: idiomEntriesLoading,
    error: idiomEntriesError,
  } = useEntries('idioms')
  // ミックスは単語・熟語の両コレクションを合わせて出題する。自己申告の書き戻し先を区別するため、
  // 合成時だけ各エントリに __srcKind を付ける（Firestoreへは書かない一時的なタグ）。
  const entries = useMemo(() => {
    if (kind === 'idioms') return idiomEntries
    if (kind === 'mix') {
      return [
        ...wordEntries.map((e) => ({ ...e, __srcKind: 'words' })),
        ...idiomEntries.map((e) => ({ ...e, __srcKind: 'idioms' })),
      ]
    }
    return wordEntries
  }, [kind, wordEntries, idiomEntries])
  // ミックス以外はもう一方のコレクションの読み込みを待たせない。
  const entriesLoading = isWordsOnly
    ? wordEntriesLoading
    : kind === 'idioms'
      ? idiomEntriesLoading
      : wordEntriesLoading || idiomEntriesLoading
  const entriesError = isWordsOnly
    ? wordEntriesError
    : kind === 'idioms'
      ? idiomEntriesError
      : wordEntriesError || idiomEntriesError
  // 単語・熟語で書き込み先のコレクションを振り分ける（ミックスはエントリの __srcKind で判定）。
  const updateEntrySource = (srcKind, updater) =>
    srcKind === 'idioms' ? updateIdiomEntries(updater) : updateWordEntries(updater)
  const { settings, isLoading: settingsLoading, error: settingsError } = useSettings()
  const {
    recordFlashcardSession,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useFlashcardSessions()

  const [phase, setPhase] = useState('setup') // setup → study → result
  const [direction, setDirection] = useState('en-ja')
  const [mode, setMode] = useState('random')
  const [countOption, setCountOption] = useState('10')
  // 出題範囲フィルタ: 出題モード（pickQuestionWords）とは直交する絞り込み。空配列は「絞り込みなし」
  const [cefrFilter, setCefrFilter] = useState([])
  const [categoryFilter, setCategoryFilter] = useState([])

  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [knownCount, setKnownCount] = useState(0)
  const knownCountRef = useRef(0)
  const [result, setResult] = useState(null)
  // テスト中に別タブで設定が変わっても条件を揃えるため、開始時の復習間隔を固定する
  const [activeReviewIntervals, setActiveReviewIntervals] = useState(null)

  const reviewIntervals = useMemo(
    () => normalizeReviewIntervals(settings.reviewIntervals),
    [settings.reviewIntervals],
  )
  const eligible = useMemo(() => entries.filter(isEntryEligibleForFlashcard), [entries])
  // 出題範囲の絞り込み候補は出題対象のコレクションのタグだけ（選んでも0件になる候補を並べない）。
  const knownCategories = useMemo(() => collectKnownCategories(entries), [entries])
  // 正解画面のタグ付け候補は単語・熟語をまたいだ全タグ（表記ゆれのタグが増えるのを防ぐ）。
  const allKnownCategories = useMemo(
    () => collectKnownCategories([...wordEntries, ...idiomEntries]),
    [wordEntries, idiomEntries],
  )
  // CEFRは単語専用（熟語・ミックスでは未使用のフィールドのため適用しない）。カテゴリは共通。
  const filteredEligible = useMemo(() => {
    let filtered = eligible
    if (isWordsOnly && cefrFilter.length > 0) filtered = filtered.filter((e) => cefrFilter.includes(e.cefr))
    if (categoryFilter.length > 0) {
      const wanted = categoryFilter.map((t) => t.toLowerCase())
      filtered = filtered.filter((e) =>
        (e.categories ?? []).some((tag) => wanted.includes(tag.toLowerCase()))
      )
    }
    return filtered
  }, [eligible, cefrFilter, categoryFilter, isWordsOnly])
  const isFilteringRange = (isWordsOnly && cefrFilter.length > 0) || categoryFilter.length > 0
  const modeWords = useMemo(() => pickQuestionWords(filteredEligible, null, mode), [filteredEligible, mode])
  const currentModeLabel = QUIZ_MODES.find((m) => m.id === mode)?.label ?? ''
  const canStart = modeWords.length >= MIN_ENTRIES_FOR_FLASHCARD
  // 正解画面のカテゴリ登録用。出題時のスナップショット（cards[i]）ではなく購読中の一覧から引くことで、
  // タグを付け外しした結果が即座に反映される。
  const currentCardId = cards[currentIndex]?.id ?? null
  const currentCategories = useMemo(
    () => entries.find((e) => e.id === currentCardId)?.categories ?? [],
    [entries, currentCardId],
  )

  if (entriesLoading || settingsLoading || sessionsLoading) return <LoadingState />
  if (entriesError || settingsError || sessionsError) return <DataErrorState />

  function startStudy() {
    const count = countOption === 'all' ? null : Number(countOption)
    const picked = pickQuestionWords(filteredEligible, count, mode)
    if (picked.length < MIN_ENTRIES_FOR_FLASHCARD) return
    scrollToPageTop()
    setCards(picked)
    setCurrentIndex(0)
    setRevealed(false)
    setKnownCount(0)
    knownCountRef.current = 0
    setActiveReviewIntervals(reviewIntervals)
    setPhase('study')
  }

  // 自己申告（known: true=覚えた / false=まだ）→ 記録して次のカードへ。
  function rate(known) {
    const card = cards[currentIndex]
    const reviewedAt = new Date()
    // ミックスではカードごとに元コレクションが違うため、書き戻し先もカードごとに振り分ける。
    const srcKind = kind === 'mix' ? card.__srcKind : kind
    updateEntrySource(srcKind, (prev) =>
      prev.map((e) =>
        e.id === card.id ? applyFlashcardResult(e, known, reviewedAt, activeReviewIntervals) : e,
      ),
    )
    knownCountRef.current += known ? 1 : 0
    setKnownCount(knownCountRef.current)

    if (currentIndex + 1 < cards.length) {
      scrollToPageTop()
      setCurrentIndex((prev) => prev + 1)
      setRevealed(false)
    } else {
      scrollToPageTop()
      // 結果遷移のハンドラ内で1回だけ記録する（effectに置くとStrictModeで二重記録になる）
      recordFlashcardSession({
        kind,
        direction,
        total: cards.length,
        known: knownCountRef.current,
      })
      setResult({ total: cards.length, known: knownCountRef.current })
      setPhase('result')
    }
  }

  // 正解画面でのカテゴリ付け外し。書き戻しは prev 側のエントリをスプレッドする
  // （card には ミックス用の一時タグ __srcKind が付いており、Firestore へ書いてはいけない）。
  function changeCurrentCategories(nextCategories) {
    const card = cards[currentIndex]
    if (!card) return
    const srcKind = kind === 'mix' ? card.__srcKind : kind
    updateEntrySource(srcKind, (prev) =>
      prev.map((e) => (e.id === card.id ? { ...e, categories: nextCategories } : e)),
    )
  }

  function restart() {
    scrollToPageTop()
    setPhase('setup')
    setCards([])
    setCurrentIndex(0)
    setRevealed(false)
    setKnownCount(0)
    knownCountRef.current = 0
    setResult(null)
  }

  if (phase === 'study') {
    return (
      <StudyScreen
        card={cards[currentIndex]}
        direction={direction}
        currentIndex={currentIndex}
        total={cards.length}
        knownCount={knownCount}
        revealed={revealed}
        categories={currentCategories}
        knownCategories={allKnownCategories}
        onChangeCategories={changeCurrentCategories}
        onReveal={() => setRevealed(true)}
        onRate={rate}
      />
    )
  }

  if (phase === 'result') {
    return <ResultScreen result={result} unit={unit} onRestart={restart} />
  }

  return (
    <Card sx={{ mb: { xs: 2, sm: 0 } }}>
      <CardContent>
        {/* 単語/熟語/ミックスの切り替え（この画面の設定）。ミックスは単語・熟語を合わせて出題する。 */}
        <ToggleButtonGroup
          value={kind}
          exclusive
          size="small"
          onChange={(e, next) => {
            if (!next) return
            setCefrFilter([])
            setCategoryFilter([])
            setKind(next)
          }}
          sx={{ mb: 1.5 }}
        >
          <ToggleButton value="words">単語</ToggleButton>
          <ToggleButton value="idioms">熟語</ToggleButton>
          <ToggleButton value="mix">ミックス</ToggleButton>
        </ToggleButtonGroup>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <StyleIcon color="primary" />
          <Typography variant="h5" component="h2">
            暗記カード
          </Typography>
        </Stack>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          カードをタップすると答えが表示されます。覚えているか自己申告して進めます。
        </Typography>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="fc-direction-label">出題の向き</InputLabel>
          <Select
            labelId="fc-direction-label"
            label="出題の向き"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            {FLASHCARD_DIRECTIONS.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="fc-mode-label">出題モード</InputLabel>
          <Select
            labelId="fc-mode-label"
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
          <InputLabel id="fc-count-label">枚数</InputLabel>
          <Select
            labelId="fc-count-label"
            label="枚数"
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

        {/* 出題範囲フィルタ: CEFRは単語専用、カテゴリは単語・熟語共通 */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 0.5, sm: 0 }}
          sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', mb: 1 }}
        >
          <Typography variant="subtitle2" color="text.secondary">
            出題範囲（{isWordsOnly ? 'CEFR・カテゴリ' : 'カテゴリ'}）
          </Typography>
          <Button
            size="small"
            startIcon={<FilterAltOffIcon />}
            onClick={() => {
              setCefrFilter([])
              setCategoryFilter([])
            }}
            disabled={!isFilteringRange}
            sx={{ alignSelf: { xs: 'flex-end', sm: 'auto' } }}
          >
            絞り込みをリセット
          </Button>
        </Stack>
        {isWordsOnly && (
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
        )}

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
          対象: {modeWords.length} {unit}（{currentModeLabel}・{FLASHCARD_DIRECTIONS.find((d) => d.id === direction)?.label}）
        </Typography>

        {!canStart && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {mode === 'review'
              ? '今日の復習対象がありません。別のモードを選んでください。'
              : (
                <>
                  日本語訳のある{unit}がありません。
                  <Link component={RouterLink} to={`/add${entryKindSearch(kind)}`} sx={{ ml: 0.5 }}>
                    {unit}を追加する
                  </Link>
                </>
              )}
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowIcon />}
          onClick={startStudy}
          disabled={!canStart}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          スタート
        </Button>
      </CardContent>
    </Card>
  )
}

function StudyScreen({
  card,
  direction,
  currentIndex,
  total,
  knownCount,
  revealed,
  categories,
  knownCategories,
  onChangeCategories,
  onReveal,
  onRate,
}) {
  const { front, back } = cardFaces(card, direction)

  return (
    <Card>
      <CardContent>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}
        >
          <Chip label={`${currentIndex + 1} / ${total}`} size="small" />
          <Typography color="text.secondary">覚えた: {knownCount}</Typography>
        </Stack>

        {/* 表示前はカードタップで答えを表示。表示後はタップを受け付けず、下の自己申告ボタンで進む。 */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          {revealed ? (
            <CardContent sx={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', overflowWrap: 'anywhere' }}>
                {front}
              </Typography>
              <Box sx={{ borderTop: 1, borderColor: 'divider', mt: 2, pt: 2 }}>
                <Typography
                  variant="h5"
                  fontWeight={700}
                  sx={{ textAlign: 'center', color: 'error.main', overflowWrap: 'anywhere' }}
                >
                  {back}
                </Typography>
              </Box>
            </CardContent>
          ) : (
            <CardActionArea onClick={onReveal} sx={{ minHeight: 180 }}>
              <CardContent sx={{ minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight={700} sx={{ textAlign: 'center', overflowWrap: 'anywhere' }}>
                  {front}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 2, color: 'text.secondary' }}>
                  <TouchAppIcon fontSize="small" />
                  <Typography variant="body2">タップして答えを表示</Typography>
                </Stack>
              </CardContent>
            </CardActionArea>
          )}
        </Card>

        {/* 答えを見た流れでそのままタグ付けできるようにする（変更は即保存される）。
            カードの外に置くのは、開閉でカード自体の高さが跳ねないようにするため。
            key でカードごとに state を捨て、入力途中のタグが次のカードへ持ち越されないようにする。 */}
        {revealed && (
          <CategoryQuickAdd
            key={card.id}
            categories={categories}
            knownCategories={knownCategories}
            onChange={onChangeCategories}
            sx={{ mb: 2 }}
          />
        )}

        {revealed ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button
              fullWidth
              variant="outlined"
              color="inherit"
              size="large"
              onClick={() => onRate(false)}
            >
              まだ
            </Button>
            <Button
              fullWidth
              variant="contained"
              color="success"
              size="large"
              onClick={() => onRate(true)}
            >
              覚えた
            </Button>
          </Stack>
        ) : (
          <Button fullWidth variant="contained" size="large" onClick={onReveal}>
            答えを表示
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ResultScreen({ result, unit, onRestart }) {
  const { total, known } = result
  const rate = total > 0 ? Math.round((known / total) * 100) : 0

  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <StyleIcon color="primary" />
          <Typography variant="h5" component="h2">
            暗記カード 完了
          </Typography>
        </Stack>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
          {total}枚中 {known}枚「覚えた」（{rate}%）
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          「覚えた／まだ」の自己申告は{unit}の習熟度と復習予定に反映されました。
        </Typography>
        <Button variant="contained" startIcon={<ReplayIcon />} onClick={onRestart}>
          もう一度
        </Button>
      </CardContent>
    </Card>
  )
}
