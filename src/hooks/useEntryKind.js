import { useSearchParams } from 'react-router-dom'

// 単語/熟語の切り替えを URL クエリ ?kind=idiom で表す。
// 既定（クエリ無し）は単語。戻り値の kind はコレクション名（'words' | 'idioms'）に一致する。
// URL に持たせることで、一覧→追加→テストへ自然に伝搬し、リロード・リンク共有にも耐える。
export function useEntryKind() {
  const [params, setParams] = useSearchParams()
  const kind = params.get('kind') === 'idiom' ? 'idioms' : 'words'
  const setKind = (next) => {
    const p = new URLSearchParams(params)
    if (next === 'idioms') p.set('kind', 'idiom')
    else p.delete('kind')
    setParams(p)
  }
  return [kind, setKind]
}

// 遷移リンクへ kind を引き継ぐためのクエリ文字列（例: `/add${entryKindSearch(kind)}`）。
// extra を渡すと追加のクエリも載せられる（例: 一覧の検索語を追加画面へ渡す `{ q: '...' }`）。
// 値が空文字・null の項目は落とすので、呼び出し側で分岐しなくてよい。
export function entryKindSearch(kind, extra) {
  const params = new URLSearchParams()
  if (kind === 'idioms') params.set('kind', 'idiom')
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `?${search}` : ''
}

// 表示用の単位ラベル。'mix'（単語・熟語ミックス出題）はテスト・暗記カードのみで使う。
export function entryKindLabel(kind) {
  if (kind === 'idioms') return '熟語'
  if (kind === 'mix') return '単語・熟語'
  return '単語'
}
