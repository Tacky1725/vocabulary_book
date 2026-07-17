import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { subscribeWords, syncWordsDiff } from '../lib/cloud.js'
import { saveWordsMirror } from '../lib/storage.js'

// 単語一覧の state と Firestore（users/{uid}/words）を同期させるフック。
// 更新は必ず updateWords(prev => next) 経由で行うこと（楽観更新と差分書き込みが一体）。
// スナップショットは localStorage にもミラーし、クラウド障害時のバックアップとして残す。
export function useWords() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [words, setWords] = useState([])
  // updateWords の連続呼び出しでも直前の状態から差分を取れるよう ref にも持つ
  const wordsRef = useRef([])

  useEffect(() => {
    if (!uid) return undefined
    return subscribeWords(uid, (next) => {
      wordsRef.current = next
      setWords(next)
      saveWordsMirror(uid, next) // ローカルバックアップ（ユーザーごとに分離）
    })
  }, [uid])

  const updateWords = useCallback(
    (updater) => {
      if (!uid) return
      const prev = wordsRef.current
      const next = typeof updater === 'function' ? updater(prev) : updater
      wordsRef.current = next
      setWords(next) // 楽観更新（Firestore の snapshot からも同じ状態が届く）
      syncWordsDiff(uid, prev, next) // fire-and-forget（オフライン時は SDK がキュー保持）
    },
    [uid]
  )

  return { words, updateWords }
}
