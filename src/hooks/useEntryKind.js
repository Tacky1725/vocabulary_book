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
export function entryKindSearch(kind) {
  return kind === 'idioms' ? '?kind=idiom' : ''
}

// 表示用の単位ラベル。
export function entryKindLabel(kind) {
  return kind === 'idioms' ? '熟語' : '単語'
}
