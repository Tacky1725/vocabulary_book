import { useEntries } from './useEntries.js'

// 熟語一覧の state と Firestore（users/{uid}/idioms）を同期させるフック。
// 実体は汎用 useEntries('idioms')。スキーマは単語と同一で、コレクションだけ分離する。
// 更新は必ず updateIdioms(prev => next) 経由（楽観更新と差分書き込みが一体）。
export function useIdioms() {
  const { entries, updateEntries, isLoading, error } = useEntries('idioms')
  return { idioms: entries, updateIdioms: updateEntries, isLoading, error }
}
