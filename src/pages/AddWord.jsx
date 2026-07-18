import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Autocomplete from '@mui/material/Autocomplete'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import TranslateIcon from '@mui/icons-material/Translate'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useWords } from '../hooks/useWords.js'
import { createWordEntry } from '../lib/storage.js'
import { createSense } from '../lib/senses.js'
import { fetchDictionaryEntry, fetchJapaneseTranslation } from '../lib/api.js'
import { parseWordsCsv } from '../lib/csv.js'
import { CEFR_LEVELS, collectKnownCategories, normalizeCategories } from '../lib/attributes.js'
import { lookupCefr, lookupCefrMany } from '../lib/cefr.js'
import { DataErrorState, LoadingState } from '../components/LoadingState.jsx'

export default function AddWord() {
  const { words, updateWords, isLoading, error } = useWords()
  const [tab, setTab] = useState('search')

  if (isLoading) return <LoadingState />
  if (error) return <DataErrorState />

  return (
    <Card>
      <CardContent>
        <Typography variant="h5" component="h2" gutterBottom>
          単語追加
        </Typography>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="単語検索で追加" value="search" />
          <Tab label="CSV一括追加" value="csv" />
        </Tabs>
        {tab === 'search' ? (
          <SearchTab words={words} updateWords={updateWords} />
        ) : (
          <CsvTab words={words} updateWords={updateWords} />
        )}
      </CardContent>
    </Card>
  )
}

// ---- タブ1: 単語検索で追加 ----

// プレビュー用の語義行（createSense のフィールド + UI状態）
function createSenseRow(fields = {}, checked = false) {
  return {
    ...createSense(fields),
    checked,
    translating: false, // 「定義を翻訳」実行中フラグ
    translateError: '',
  }
}

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 2,
}

function SearchTab({ words, updateWords }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  // form: null = プレビュー非表示 / { word, phonetic, cefr, categories, senses: [語義行] }
  const [form, setForm] = useState(null)
  const [apiErrors, setApiErrors] = useState([])
  const [successMessage, setSuccessMessage] = useState('')
  // 重複が見つかったとき: { id, word } を保持して確認UIを出す
  const [duplicate, setDuplicate] = useState(null)
  const knownCategories = useMemo(() => collectKnownCategories(words), [words])

  async function handleSearch(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q || loading) return

    setLoading(true)
    setSuccessMessage('')
    setDuplicate(null)
    setApiErrors([])

    // CEFR判定はバンドル済み静的データのローカル参照なのでAPI負荷はかからない
    const [dictResult, transResult, cefr] = await Promise.all([
      fetchDictionaryEntry(q),
      fetchJapaneseTranslation(q),
      lookupCefr(q),
    ])

    const errors = []
    if (!dictResult.ok) errors.push(dictResult.error)
    if (!transResult.ok) errors.push(transResult.error)

    // 辞書APIの語義候補を行に変換。デフォルトは先頭の1件だけチェックし、
    // 単語全体の日本語訳はその行の meaningJa の初期値にする。
    const candidates = dictResult.ok ? dictResult.data.senses : []
    let senseRows = candidates.map((s, i) => createSenseRow(s, i === 0))
    if (senseRows.length > 0 && transResult.ok) {
      senseRows[0] = { ...senseRows[0], meaningJa: transResult.data }
    }
    // 候補が0件でも翻訳が取れていれば、手動編集用の語義行を1つ用意して訳を活かす
    if (senseRows.length === 0 && transResult.ok) {
      senseRows = [createSenseRow({ meaningJa: transResult.data }, true)]
    }

    setForm({
      word: dictResult.ok ? dictResult.data.word : q,
      phonetic: dictResult.ok ? dictResult.data.phonetic : '',
      cefr,
      categories: [],
      senses: senseRows,
    })
    setApiErrors(errors)
    setLoading(false)
  }

  // エントリ共通フィールド（word / phonetic）の編集
  function handleFieldChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSuccessMessage('')
    setDuplicate(null)
  }

  // ユーザー操作による語義行の更新（成功表示・重複確認をリセットする）
  function handleSenseChange(index, patch) {
    setForm((prev) => {
      if (!prev) return prev
      const senses = prev.senses.slice()
      senses[index] = { ...senses[index], ...patch }
      return { ...prev, senses }
    })
    setSuccessMessage('')
    setDuplicate(null)
  }

  function handleAddSense() {
    setForm((prev) => {
      if (!prev) return prev
      return { ...prev, senses: [...prev.senses, createSenseRow({}, true)] }
    })
    setSuccessMessage('')
    setDuplicate(null)
  }

  // 「定義を翻訳」: その語義の meaningEn を個別に翻訳して meaningJa に入れる。
  // MyMemory の利用量制限対策のため、自動で全語義を翻訳せずオンデマンドにしている。
  async function handleTranslateSense(index) {
    const sense = form?.senses[index]
    if (!sense || sense.translating) return
    const text = sense.meaningEn.trim()
    if (!text) return

    handleSenseChange(index, { translating: true, translateError: '' })
    const result = await fetchJapaneseTranslation(text)
    // 翻訳完了は非同期なので、フォームがまだ表示されている場合のみ反映する
    setForm((prev) => {
      if (!prev || !prev.senses[index]) return prev
      const senses = prev.senses.slice()
      senses[index] = {
        ...senses[index],
        translating: false,
        ...(result.ok
          ? { meaningJa: result.data, translateError: '' }
          : { translateError: result.error }),
      }
      return { ...prev, senses }
    })
  }

  // チェックされた語義だけを保存用の形に整形する
  function checkedSenses() {
    return form.senses.filter((s) => s.checked).map((s) => createSense(s))
  }

  function finishAdd(word, message) {
    setSuccessMessage(message ?? `「${word}」を単語帳に追加しました`)
    setForm(null)
    setQuery('')
    setApiErrors([])
    setDuplicate(null)
  }

  function handleAdd() {
    if (!form) return
    const trimmedWord = form.word.trim()
    if (!trimmedWord) return

    const existing = words.find(
      (w) => w.word.trim().toLowerCase() === trimmedWord.toLowerCase(),
    )
    if (existing) {
      setDuplicate({ id: existing.id, word: existing.word })
      return
    }

    updateWords((prev) => [
      ...prev,
      createWordEntry({
        word: trimmedWord,
        phonetic: form.phonetic,
        cefr: form.cefr,
        categories: normalizeCategories(form.categories),
        senses: checkedSenses(),
      }),
    ])
    finishAdd(trimmedWord)
  }

  // 重複時の上書き: 学習履歴（id/addedAt/masteryLevel/正誤数/lastTestedAt）は保持し
  // word・phonetic・cefr・categories・senses だけ差し替える
  function handleOverwrite() {
    if (!form || !duplicate) return
    const trimmedWord = form.word.trim()
    const senses = checkedSenses()
    updateWords((prev) =>
      prev.map((w) =>
        w.id === duplicate.id
          ? {
              ...w,
              word: trimmedWord,
              phonetic: form.phonetic,
              cefr: form.cefr,
              categories: normalizeCategories(form.categories),
              senses,
            }
          : w,
      ),
    )
    finishAdd(trimmedWord, `「${trimmedWord}」を上書きしました`)
  }

  const checkedCount = form ? form.senses.filter((s) => s.checked).length : 0

  return (
    <Box>
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        onSubmit={handleSearch}
        sx={{ mb: 2 }}
      >
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="追加したい英単語を入力（例: resilient）"
          aria-label="検索する英単語"
        />
        <Button
          type="submit"
          variant="contained"
          startIcon={<SearchIcon />}
          disabled={loading || !query.trim()}
          sx={{ flexShrink: 0 }}
        >
          {loading ? '検索中…' : '検索'}
        </Button>
      </Stack>

      {loading && (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          辞書と翻訳を取得しています…
        </Typography>
      )}

      {apiErrors.map((err) => (
        <Alert key={err} severity="error" sx={{ mb: 1 }}>
          {err}
        </Alert>
      ))}
      {apiErrors.length > 0 && form && (
        <Typography color="text.secondary" sx={{ mb: 1 }}>
          取得できなかった項目は下のフォームで手動入力して追加できます。
        </Typography>
      )}

      {form && (
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" gutterBottom>
            プレビュー（編集できます）
          </Typography>
          <Box sx={{ ...gridSx, mb: 2 }}>
            <TextField
              label="単語 *"
              value={form.word}
              onChange={(e) => handleFieldChange('word', e.target.value)}
            />
            <TextField
              label="発音記号"
              value={form.phonetic}
              onChange={(e) => handleFieldChange('phonetic', e.target.value)}
            />
            <FormControl size="small">
              <InputLabel id="cefr-select-label">CEFR</InputLabel>
              <Select
                labelId="cefr-select-label"
                label="CEFR"
                value={form.cefr}
                onChange={(e) => handleFieldChange('cefr', e.target.value)}
              >
                <MenuItem value="">未設定</MenuItem>
                {CEFR_LEVELS.map((level) => (
                  <MenuItem key={level} value={level}>
                    {level}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              multiple
              freeSolo
              size="small"
              options={knownCategories}
              value={form.categories}
              onChange={(e, newValue) => handleFieldChange('categories', normalizeCategories(newValue))}
              renderInput={(params) => (
                <TextField {...params} label="カテゴリ" placeholder="タグを追加" />
              )}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                意味候補（チェックした日本語の意味だけが登録されます）
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={handleAddSense}>
                意味を手動で追加
              </Button>
            </Stack>

            {form.senses.length === 0 && (
              <Typography color="text.secondary">
                意味候補がありません。「意味を手動で追加」から入力して登録できます。
              </Typography>
            )}

            {form.senses.map((sense, i) => (
              <Box
                key={i}
                sx={{
                  border: 1,
                  borderColor: sense.checked ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  bgcolor: sense.checked ? 'background.paper' : 'background.default',
                  p: 1.5,
                  mb: 1,
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <FormControlLabel
                    sx={{ minWidth: 0, flex: 1, mr: 1 }}
                    control={
                      <Checkbox
                        checked={sense.checked}
                        onChange={(e) => handleSenseChange(i, { checked: e.target.checked })}
                      />
                    }
                    label={
                      <Typography sx={{ fontWeight: 600 }}>
                        {sense.meaningJa.trim() || '（未翻訳）'}
                      </Typography>
                    }
                  />
                  <Button
                    size="small"
                    startIcon={<TranslateIcon />}
                    onClick={() => handleTranslateSense(i)}
                    disabled={sense.translating || !sense.meaningEn.trim()}
                    sx={{ flexShrink: 0 }}
                  >
                    {sense.translating ? '翻訳中…' : sense.meaningJa.trim() ? '再翻訳' : '訳す'}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'baseline', mt: 0.5 }}>
                  {sense.partOfSpeech && <Chip label={sense.partOfSpeech} size="small" />}
                  <Typography variant="body2" color="text.secondary">
                    {sense.meaningEn.trim() || '（未入力の定義）'}
                  </Typography>
                  {sense.example && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      fontStyle="italic"
                      sx={{ width: '100%' }}
                    >
                      例: {sense.example}
                    </Typography>
                  )}
                  {sense.exampleJa && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      fontStyle="italic"
                      sx={{ width: '100%' }}
                    >
                      訳: {sense.exampleJa}
                    </Typography>
                  )}
                </Stack>
                {sense.translateError && (
                  <Typography color="error" variant="body2" sx={{ mt: 0.5 }}>
                    {sense.translateError}
                  </Typography>
                )}

                {sense.checked && (
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                    <Box sx={{ ...gridSx, mb: 1 }}>
                      <TextField
                        label="意味（日本語）"
                        value={sense.meaningJa}
                        onChange={(e) => handleSenseChange(i, { meaningJa: e.target.value })}
                      />
                      <TextField
                        label="品詞"
                        value={sense.partOfSpeech}
                        onChange={(e) => handleSenseChange(i, { partOfSpeech: e.target.value })}
                      />
                    </Box>
                    <TextField
                      fullWidth
                      label="意味（英語の定義）"
                      multiline
                      minRows={2}
                      value={sense.meaningEn}
                      onChange={(e) => handleSenseChange(i, { meaningEn: e.target.value })}
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      fullWidth
                      label="例文"
                      multiline
                      minRows={2}
                      value={sense.example}
                      onChange={(e) => handleSenseChange(i, { example: e.target.value })}
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      fullWidth
                      label="例文の日本語訳"
                      multiline
                      minRows={2}
                      value={sense.exampleJa}
                      onChange={(e) => handleSenseChange(i, { exampleJa: e.target.value })}
                    />
                  </Box>
                )}
              </Box>
            ))}
          </Box>

          {duplicate ? (
            <Alert
              severity="error"
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={handleOverwrite}>
                    上書きする
                  </Button>
                  <Button color="inherit" size="small" onClick={() => setDuplicate(null)}>
                    キャンセル
                  </Button>
                </Stack>
              }
            >
              「{duplicate.word}」はすでに単語帳に登録されています。内容を上書きしますか？
              （学習記録は保持されます）
            </Alert>
          ) : (
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Button variant="contained" onClick={handleAdd} disabled={!form.word.trim()}>
                単語帳に追加
              </Button>
              <Typography color="text.secondary">選択中の語義: {checkedCount}件</Typography>
            </Stack>
          )}
        </Box>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {successMessage}
        </Alert>
      )}
    </Box>
  )
}

// ---- タブ2: CSV一括追加 ----

function CsvTab({ words, updateWords }) {
  const [result, setResult] = useState(null) // { added, skipped } | null
  const [error, setError] = useState('')

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    // 同じファイルを再選択しても change が発火するようにリセット
    e.target.value = ''
    if (!file) return

    setResult(null)
    setError('')

    let text
    try {
      text = await file.text()
    } catch {
      setError('ファイルの読み込みに失敗しました')
      return
    }

    const { entries, error: parseError } = parseWordsCsv(text)
    if (parseError) {
      setError(parseError)
      return
    }
    if (entries.length === 0) {
      setError('追加できる行がありません（word 列が空の行は無視されます）')
      return
    }

    // CSV内部の重複は parseWordsCsv が1エントリにグループ化済みなので、
    // 既存単語帳との重複（大文字小文字無視）だけスキップする
    const existing = new Set(words.map((w) => w.word.trim().toLowerCase()))
    const toImport = entries.filter((entry) => !existing.has(entry.word.trim().toLowerCase()))
    const skipped = entries.length - toImport.length

    // CSV に cefr が明示されている行はそれを尊重し、空欄の行だけ自動判定で補う
    const guessedCefr = await lookupCefrMany(toImport.map((entry) => entry.word))
    const newEntries = toImport.map((entry, i) =>
      createWordEntry({
        word: entry.word,
        phonetic: entry.phonetic,
        cefr: entry.cefr || guessedCefr[i],
        categories: entry.categories,
        senses: entry.senses,
      }),
    )

    if (newEntries.length > 0) {
      updateWords((prev) => [...prev, ...newEntries])
    }
    setResult({ added: newEntries.length, skipped })
  }

  return (
    <Box>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        ヘッダー付きCSVファイルをアップロードすると、まとめて単語帳に追加できます。
        辞書APIへの照会は行わず、CSVの内容がそのまま登録されます。
        単語帳アプリ「DiQt」が配布するCSV（headword/pos/entry/ipa等の列を持つ形式）もそのまま読み込めます。
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography color="text.secondary" sx={{ mb: 0.5 }}>
          フォーマット（1行目はヘッダー。列の順序は自由、存在しない列は空欄扱い）:
        </Typography>
        <Box
          component="pre"
          sx={{
            bgcolor: 'background.default',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            p: '10px 14px',
            fontSize: '0.85rem',
            overflowX: 'auto',
            mt: 0.5,
            mb: 1.5,
          }}
        >
{`word,meaningEn,meaningJa,phonetic,partOfSpeech,example
bank,a financial institution,銀行,/bæŋk/,noun,I went to the bank.
bank,the land alongside a river,土手,/bæŋk/,noun,We walked along the bank.`}
        </Box>
        <Typography color="text.secondary">
          1行=1語義。同じ word の行は1つの単語にまとめて登録されます（上の例は「bank」1語に語義2件）。
          任意で cefr（A1〜C2）・categories（タグを「;」区切りで複数指定）の列も追加できます。
          cefr が空欄の行は登録時に自動判定を試みます（収録外の単語は未設定のままになります）。
        </Typography>
      </Box>

      <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ mb: 2 }}>
        CSVファイルを選択
        <input type="file" accept=".csv,text/csv" hidden onChange={handleFileChange} />
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {result && (
        <Alert severity="success">
          {result.added}件追加、{result.skipped}件スキップ（重複）
        </Alert>
      )}
    </Box>
  )
}
