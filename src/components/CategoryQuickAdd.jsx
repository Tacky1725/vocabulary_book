import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import LocalOfferIcon from '@mui/icons-material/LocalOffer'
import { normalizeCategories } from '../lib/attributes.js'

// 学習中（テストの解説画面・暗記カードの正解画面）に、表示中の1語へカテゴリタグを付け外しするUI。
// 学習の流れを止めないことを優先し、既知タグのトグルChip中心で構成する（キーボードを出さずに1タップで済む）。
// 永続化は呼び出し側の責務。onChange は整形済みのタグ配列を返すので、そのまま entry.categories に入れられる。
export default function CategoryQuickAdd({ categories, knownCategories, onChange, sx }) {
  const [newTag, setNewTag] = useState('')
  const [showInput, setShowInput] = useState(false)

  const assigned = categories ?? []
  const has = (tag) => assigned.some((c) => c.toLowerCase() === tag.toLowerCase())
  // 並び順は knownCategories（デフォルトタグ→五十音順）のまま固定する。トグルで位置が動くと
  // 連続でタグを付けるときに押し間違えるため。knownCategories に無い付与済みタグだけ末尾に足す。
  const known = knownCategories ?? []
  const options = [
    ...known,
    ...assigned.filter((tag) => !known.some((k) => k.toLowerCase() === tag.toLowerCase())),
  ]

  const toggle = (tag) => {
    const next = has(tag)
      ? assigned.filter((c) => c.toLowerCase() !== tag.toLowerCase())
      : [...assigned, tag]
    onChange(normalizeCategories(next))
  }

  const commitNewTag = () => {
    const value = newTag.trim()
    setNewTag('')
    if (!value || has(value)) return
    onChange(normalizeCategories([...assigned, value]))
  }

  // Enter でタグを確定する。日本語入力の変換確定 Enter は拾わない。
  function handleInputKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (event.nativeEvent?.isComposing || event.isComposing) return
    commitNewTag()
  }

  // テスト画面は window に「回答後の Enter で次へ」を張っている。このUI内の Enter は
  // タグ操作（フォーカス中Chipの活性化・入力の確定）に使うので、window まで伝播させない
  // （穴埋め入力欄と同じ対処。stopPropagation しないとタグ操作と同時に次の問題へ進んでしまう）。
  function stopEnterPropagation(event) {
    if (event.key === 'Enter') event.stopPropagation()
  }

  return (
    <Box sx={sx} onKeyDown={stopEnterPropagation}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.75 }}>
        <LocalOfferIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" color="text.secondary">
          カテゴリ（タップで付け外し）
        </Typography>
      </Stack>
      <Stack direction="row" gap={0.75} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {options.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            size="small"
            color={has(tag) ? 'primary' : 'default'}
            variant={has(tag) ? 'filled' : 'outlined'}
            onClick={() => toggle(tag)}
          />
        ))}
        <Chip
          icon={<AddIcon />}
          label="新規タグ"
          size="small"
          variant="outlined"
          color="primary"
          onClick={() => setShowInput((prev) => !prev)}
        />
      </Stack>
      {/* unmountOnExit は必須: 常時マウントだと autoFocus が非表示のまま発火し、
          テスト画面の入力欄からフォーカスを奪ってしまう。 */}
      <Collapse in={showInput} unmountOnExit>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
          <TextField
            size="small"
            autoFocus
            placeholder="タグ名"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleInputKeyDown}
            sx={{ maxWidth: 240 }}
          />
          <Button size="small" onClick={commitNewTag} disabled={newTag.trim() === ''}>
            追加
          </Button>
        </Stack>
      </Collapse>
    </Box>
  )
}
