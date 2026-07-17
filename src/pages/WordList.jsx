import { useDeferredValue, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Link from '@mui/material/Link'
import Rating from '@mui/material/Rating'
import Chip from '@mui/material/Chip'
import Pagination from '@mui/material/Pagination'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SaveAltIcon from '@mui/icons-material/SaveAlt'
import SearchIcon from '@mui/icons-material/Search'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import SaveIcon from '@mui/icons-material/Save'
import CloseIcon from '@mui/icons-material/Close'
import { useWords } from '../hooks/useWords.js'
import { wordsToCsv, wordsToDiqtCsv, downloadCsv } from '../lib/csv.js'
import { createSense, hasSenseContent } from '../lib/senses.js'

// 並び替えの選択肢
const SORT_OPTIONS = [
  { value: 'addedAt-desc', label: '追加日（新しい順）' },
  { value: 'addedAt-asc', label: '追加日（古い順）' },
  { value: 'alpha', label: 'アルファベット順' },
  { value: 'mastery-asc', label: '習熟度（低い順）' },
  { value: 'mastery-desc', label: '習熟度（高い順）' },
]

// 1ページあたりの表示件数。数千語登録時にテーブル全件をDOM描画すると
// 検索・並び替えのたびに重くなるため、表示件数を区切って再調停コストを抑える。
const PAGE_SIZE = 50

const editGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 1.5,
}

function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// 習熟度 0〜5 を星で表示
function MasteryStars({ level }) {
  const n = Math.max(0, Math.min(5, Number(level) || 0))
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', whiteSpace: 'nowrap' }}>
      <Rating value={n} max={5} readOnly size="small" sx={{ color: '#e8a13c' }} />
      <Chip label={`${n}/5`} size="small" />
    </Stack>
  )
}

// 正答/誤答の表示（テーブル・カード共用）
function CorrectIncorrect({ word }) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <Typography component="span" color="success.main">
        {word.correctCount ?? 0}
      </Typography>
      {' / '}
      <Typography component="span" color="error.main">
        {word.incorrectCount ?? 0}
      </Typography>
    </Box>
  )
}

// 語義の一覧表示（品詞チップ＋和訳＋英語定義）。テーブル・カード共用。
function SenseLines({ senses }) {
  if (!senses?.length) return '-'
  return (
    <Stack spacing={0.5}>
      {senses.map((s, i) => (
        <Stack key={i} direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', alignItems: 'baseline' }}>
          {s.partOfSpeech && <Chip label={s.partOfSpeech} size="small" />}
          {s.meaningJa && <Typography variant="body2">{s.meaningJa}</Typography>}
          {s.meaningEn && (
            <Typography variant="body2" color="text.secondary">
              {s.meaningEn}
            </Typography>
          )}
        </Stack>
      ))}
    </Stack>
  )
}

// 単語の編集フォーム（テーブルのインライン展開・スマホのカード内で共用）
function WordEditForm({
  draft,
  setDraft,
  editError,
  onSave,
  onCancel,
  setDraftSense,
  addDraftSense,
  removeDraftSense,
}) {
  return (
    <>
      <Box sx={{ ...editGridSx, mb: 1.5 }}>
        <TextField
          label="単語（必須）"
          size="small"
          value={draft.word}
          onChange={(e) => setDraft({ ...draft, word: e.target.value })}
        />
        <TextField
          label="発音記号"
          size="small"
          value={draft.phonetic}
          onChange={(e) => setDraft({ ...draft, phonetic: e.target.value })}
        />
      </Box>
      <Stack spacing={1.5} sx={{ mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          語義
        </Typography>
        {draft.senses.map((sense, i) => (
          <Box
            key={i}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1.5,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                語義 {i + 1}
              </Typography>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => removeDraftSense(i)}
              >
                この語義を削除
              </Button>
            </Stack>
            <Box sx={editGridSx}>
              <TextField
                label="品詞"
                size="small"
                value={sense.partOfSpeech}
                onChange={(e) => setDraftSense(i, 'partOfSpeech', e.target.value)}
              />
              <TextField
                label="日本語訳"
                size="small"
                value={sense.meaningJa}
                onChange={(e) => setDraftSense(i, 'meaningJa', e.target.value)}
              />
              <TextField
                label="英語定義"
                size="small"
                value={sense.meaningEn}
                onChange={(e) => setDraftSense(i, 'meaningEn', e.target.value)}
                sx={{ gridColumn: '1 / -1' }}
              />
              <TextField
                label="例文"
                size="small"
                multiline
                minRows={2}
                value={sense.example}
                onChange={(e) => setDraftSense(i, 'example', e.target.value)}
                sx={{ gridColumn: '1 / -1' }}
              />
              <TextField
                label="例文の日本語訳"
                size="small"
                multiline
                minRows={2}
                value={sense.exampleJa}
                onChange={(e) => setDraftSense(i, 'exampleJa', e.target.value)}
                sx={{ gridColumn: '1 / -1' }}
              />
            </Box>
          </Box>
        ))}
        <Box>
          <Button size="small" startIcon={<AddIcon />} onClick={addDraftSense}>
            語義を追加
          </Button>
        </Box>
      </Stack>
      {editError && (
        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
          {editError}
        </Typography>
      )}
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="contained" startIcon={<SaveIcon />} onClick={onSave}>
          保存
        </Button>
        <Button size="small" startIcon={<CloseIcon />} onClick={onCancel}>
          キャンセル
        </Button>
      </Stack>
    </>
  )
}

// スマホ用: 1単語=1カード
function WordCard({ word, onEdit, onDelete }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={600} sx={{ wordBreak: 'break-word' }}>
              {word.word}
            </Typography>
            {/* phonetic は辞書API由来で既にスラッシュ付き（例: /rɪˈzɪliənt/） */}
            {word.phonetic && (
              <Typography variant="caption" color="text.secondary" display="block">
                {word.phonetic}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Tooltip title="編集">
              <IconButton size="small" onClick={() => onEdit(word)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="削除">
              <IconButton size="small" color="error" onClick={() => onDelete(word)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
        <Box sx={{ mt: 1 }}>
          <SenseLines senses={word.senses} />
        </Box>
        <Stack
          direction="row"
          gap={1}
          sx={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mt: 1.25 }}
        >
          <MasteryStars level={word.masteryLevel} />
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <CorrectIncorrect word={word} />
            <Typography variant="caption" color="text.secondary">
              {formatDate(word.addedAt)}
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function WordList() {
  const { words, updateWords } = useWords()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [query, setQuery] = useState('')
  // 入力欄の表示は query で即座に更新しつつ、重いフィルタ+ソート計算は
  // deferredQuery（低優先度で追従）を使うことで、連続入力時のカクつきを避ける。
  const deferredQuery = useDeferredValue(query)
  const [sortKey, setSortKey] = useState('addedAt-desc')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editError, setEditError] = useState('')

  const visibleWords = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const filtered = q
      ? words.filter((w) => {
          const targets = [
            w.word,
            w.phonetic,
            ...(w.senses ?? []).flatMap((s) => [s.meaningJa, s.meaningEn]),
          ]
          return targets.some((v) => (v ?? '').toLowerCase().includes(q))
        })
      : words.slice()

    const byAddedAt = (w) => new Date(w.addedAt ?? 0).getTime() || 0
    switch (sortKey) {
      case 'addedAt-asc':
        filtered.sort((a, b) => byAddedAt(a) - byAddedAt(b))
        break
      case 'alpha':
        filtered.sort((a, b) => (a.word ?? '').localeCompare(b.word ?? '', 'en', { sensitivity: 'base' }))
        break
      case 'mastery-asc':
        filtered.sort((a, b) => (a.masteryLevel ?? 0) - (b.masteryLevel ?? 0))
        break
      case 'mastery-desc':
        filtered.sort((a, b) => (b.masteryLevel ?? 0) - (a.masteryLevel ?? 0))
        break
      case 'addedAt-desc':
      default:
        filtered.sort((a, b) => byAddedAt(b) - byAddedAt(a))
        break
    }
    return filtered
  }, [words, deferredQuery, sortKey])

  const totalPages = Math.max(1, Math.ceil(visibleWords.length / PAGE_SIZE))
  // 削除等でtotalPagesが縮んでも古いpage番号のまま空表示にならないよう、描画のたびにclampする
  const safePage = Math.min(page, totalPages)
  const pagedWords = useMemo(
    () => visibleWords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleWords, safePage],
  )

  const startEdit = (word) => {
    const senses = (word.senses ?? []).map((s) => createSense(s))
    setDraft({
      word: word.word ?? '',
      phonetic: word.phonetic ?? '',
      // 語義が1つも無い場合も編集しやすいよう空の語義行を1つ出す
      senses: senses.length > 0 ? senses : [createSense()],
    })
    setEditingId(word.id)
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft(null)
    setEditError('')
  }

  const setDraftSense = (index, field, value) => {
    setDraft((d) => ({
      ...d,
      senses: d.senses.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    }))
  }

  const addDraftSense = () => {
    setDraft((d) => ({ ...d, senses: [...d.senses, createSense()] }))
  }

  const removeDraftSense = (index) => {
    setDraft((d) => ({ ...d, senses: d.senses.filter((_, i) => i !== index) }))
  }

  const saveEdit = () => {
    if (!draft.word.trim()) {
      setEditError('単語は必須です')
      return
    }
    // 各語義を createSense で整形し、全フィールドが空の語義は保存しない
    const senses = draft.senses
      .map((s) =>
        createSense({
          partOfSpeech: s.partOfSpeech.trim(),
          meaningEn: s.meaningEn.trim(),
          meaningJa: s.meaningJa.trim(),
          example: s.example.trim(),
          exampleJa: s.exampleJa.trim(),
        }),
      )
      .filter(hasSenseContent)
    const cleaned = { word: draft.word.trim(), phonetic: draft.phonetic.trim(), senses }
    updateWords((prev) => prev.map((w) => (w.id === editingId ? { ...w, ...cleaned } : w)))
    cancelEdit()
  }

  const handleDelete = (word) => {
    if (!window.confirm(`「${word.word}」を削除しますか？この操作は元に戻せません。`)) return
    if (word.id === editingId) cancelEdit()
    updateWords((prev) => prev.filter((w) => w.id !== word.id))
  }

  const handleExport = () => {
    downloadCsv(wordsToCsv(words), 'vocab-book.csv')
  }

  const handleExportDiqt = () => {
    downloadCsv(wordsToDiqtCsv(words), 'vocab-book-diqt.csv')
  }

  const isFiltering = query.trim() !== ''

  // 編集フォームに渡す共通 props（テーブル・カードで同じフォームを使う）
  const editFormProps = {
    draft,
    setDraft,
    editError,
    onSave: saveEdit,
    onCancel: cancelEdit,
    setDraftSense,
    addDraftSense,
    removeDraftSense,
  }

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={1}
          sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, mb: 1 }}
        >
          <Typography variant="h5" component="h2">
            単語一覧
          </Typography>
          <Stack direction="row" spacing={1} gap={1} sx={{ flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<FileDownloadIcon />}
              onClick={handleExport}
              disabled={words.length === 0}
              sx={{ flex: { xs: 1, sm: 'initial' } }}
            >
              CSVエクスポート
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SaveAltIcon />}
              onClick={handleExportDiqt}
              disabled={words.length === 0}
              sx={{ flex: { xs: 1, sm: 'initial' } }}
            >
              DiQt形式でエクスポート
            </Button>
          </Stack>
        </Stack>

        {words.length === 0 ? (
          <Typography color="text.secondary">
            単語がまだ登録されていません。
            <Link component={RouterLink} to="/add" sx={{ ml: 0.5 }}>
              単語追加ページ
            </Link>
            から登録してください。
          </Typography>
        ) : (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ flexWrap: 'wrap', alignItems: { xs: 'stretch', sm: 'center' }, mb: 1.5 }}
            >
              <TextField
                type="search"
                size="small"
                placeholder="単語・意味で検索"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                aria-label="単語・意味で検索"
                sx={{ flex: { xs: '1 1 auto', sm: '1 1 220px' }, maxWidth: { sm: 320 } }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                    ),
                  },
                }}
              />
              <Select
                value={sortKey}
                size="small"
                onChange={(e) => {
                  setSortKey(e.target.value)
                  setPage(1)
                }}
                inputProps={{ 'aria-label': '並び替え' }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
              <Typography
                color="text.secondary"
                sx={{ ml: { sm: 'auto' }, whiteSpace: 'nowrap' }}
              >
                {isFiltering
                  ? `${words.length}件中${visibleWords.length}件を表示`
                  : `全${words.length}件`}
                {visibleWords.length > 0 &&
                  ` (${(safePage - 1) * PAGE_SIZE + 1}〜${Math.min(safePage * PAGE_SIZE, visibleWords.length)}件目 / ${safePage} / ${totalPages}ページ)`}
              </Typography>
            </Stack>

            {visibleWords.length === 0 ? (
              <Typography color="text.secondary">検索条件に一致する単語がありません。</Typography>
            ) : isMobile ? (
              // スマホ: カード型リスト（6列テーブルの横スクロールを避ける）
              <Stack spacing={1.25}>
                {pagedWords.map((w) =>
                  w.id === editingId ? (
                    <Card key={w.id} variant="outlined" sx={{ bgcolor: 'action.hover' }}>
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <WordEditForm {...editFormProps} />
                      </CardContent>
                    </Card>
                  ) : (
                    <WordCard key={w.id} word={w} onEdit={startEdit} onDelete={handleDelete} />
                  ),
                )}
              </Stack>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>単語</TableCell>
                      <TableCell>意味</TableCell>
                      <TableCell>習熟度</TableCell>
                      <TableCell>正答/誤答</TableCell>
                      <TableCell>追加日</TableCell>
                      <TableCell>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedWords.map((w) =>
                      w.id === editingId ? (
                        <TableRow key={w.id}>
                          <TableCell colSpan={6} sx={{ bgcolor: 'action.hover' }}>
                            <WordEditForm {...editFormProps} />
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow key={w.id} hover>
                          <TableCell>
                            <Typography fontWeight={600}>{w.word}</Typography>
                            {/* phonetic は辞書API由来で既にスラッシュ付き（例: /rɪˈzɪliənt/） */}
                            {w.phonetic && (
                              <Typography variant="caption" color="text.secondary" display="block">
                                {w.phonetic}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <SenseLines senses={w.senses} />
                          </TableCell>
                          <TableCell>
                            <MasteryStars level={w.masteryLevel} />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            <CorrectIncorrect word={w} />
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(w.addedAt)}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="編集">
                                <IconButton size="small" onClick={() => startEdit(w)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="削除">
                                <IconButton size="small" color="error" onClick={() => handleDelete(w)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {visibleWords.length > PAGE_SIZE && (
              <Stack direction="row" sx={{ justifyContent: 'center', mt: 1.5 }}>
                <Pagination
                  count={totalPages}
                  page={safePage}
                  onChange={(e, value) => setPage(value)}
                  size="small"
                />
              </Stack>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
