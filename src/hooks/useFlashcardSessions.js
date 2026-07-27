import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import {
  recordFlashcardSession as recordToCloud,
  subscribeFlashcardSessions,
} from '../lib/cloud.js'
import { saveFlashcardSessionsMirror } from '../lib/storage.js'

// 暗記カード実施履歴（{date, kind, direction, total, known}）の state と Firestore を同期させるフック。
// テスト履歴（useTestSessions）とは別ドキュメント。自己申告なのでランキング（有効回答数）には渡さない。
// スナップショットは localStorage にもミラーする（クラウド障害時の保険）。
export function useFlashcardSessions() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [sessions, setSessions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setSessions([])
    setError(null)

    if (!uid) {
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    return subscribeFlashcardSessions(
      uid,
      (next) => {
        setSessions(next)
        setIsLoading(false)
        saveFlashcardSessionsMirror(uid, next)
      },
      (err) => {
        setIsLoading(false)
        setError(err)
      },
    )
  }, [uid])

  // 1セッション完了ごとに1回だけ呼ぶ（fire-and-forget。オフライン時は SDK がキュー保持）。
  const recordFlashcardSession = useCallback(
    ({ kind, direction, total, known }) => {
      if (uid) recordToCloud(uid, { kind, direction, total, known })
    },
    [uid],
  )

  return { sessions, recordFlashcardSession, isLoading, error }
}
