import { useEntries } from './useEntries.js'

// 単語一覧の state と Firestore（users/{uid}/words）を同期させるフック。
// 実体は汎用 useEntries('words')。戻り値の名前だけ従来どおり words/updateWords に合わせる。
// 更新は必ず updateWords(prev => next) 経由で行うこと（楽観更新と差分書き込みが一体）。
export function useWords() {
  const { entries, updateEntries, isLoading, error } = useEntries('words')
  return { words: entries, updateWords: updateEntries, isLoading, error }
}
