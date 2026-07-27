import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { subscribeEntries, syncEntriesDiff } from '../lib/cloud.js'
import { saveEntriesMirror } from '../lib/storage.js'

// エントリ一覧（単語 kind='words' / 熟語 kind='idioms'）の state と Firestore
// （users/{uid}/{kind}）を同期させる汎用フック。単語・熟語はスキーマが同一なので購読・
// 楽観更新・差分書き込み・ミラー保存を共有し、kind でコレクションだけ切り替える。
//
// 更新は必ず updateEntries(prev => next) 経由で行うこと（楽観更新と差分書き込みが一体。
// 差分書き込みが参照比較で変更を検出するため、変更しないエントリの参照を保つこと）。
// スナップショットは localStorage にも kind ごとにミラーし、クラウド障害時の保険にする。
export function useEntries(kind) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  // updateEntries の連続呼び出しでも直前の状態から差分を取れるよう ref にも持つ
  const entriesRef = useRef([])

  useEffect(() => {
    entriesRef.current = []
    setEntries([])
    setError(null)

    if (!uid) {
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    return subscribeEntries(
      uid,
      kind,
      (next) => {
        entriesRef.current = next
        setEntries(next)
        setIsLoading(false)
        saveEntriesMirror(uid, kind, next) // ローカルバックアップ（ユーザー×kind ごとに分離）
      },
      (err) => {
        setIsLoading(false)
        setError(err)
      },
    )
  }, [uid, kind])

  const updateEntries = useCallback(
    (updater) => {
      if (!uid) return
      const prev = entriesRef.current
      const next = typeof updater === 'function' ? updater(prev) : updater
      entriesRef.current = next
      setEntries(next) // 楽観更新（Firestore の snapshot からも同じ状態が届く）
      syncEntriesDiff(uid, kind, prev, next) // fire-and-forget（オフライン時は SDK がキュー保持）
    },
    [uid, kind]
  )

  return { entries, updateEntries, isLoading, error }
}
