import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { recordTestSession as recordToCloud, subscribeTestSessions } from '../lib/cloud.js'
import { saveTestSessionsMirror } from '../lib/storage.js'

// テスト実施履歴の state と Firestore を同期させるフック。
// スナップショットは localStorage にもミラーし、クラウド障害時のバックアップとして残す。
export function useTestSessions() {
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
    return subscribeTestSessions(
      uid,
      (next) => {
        setSessions(next)
        setIsLoading(false)
        saveTestSessionsMirror(uid, next) // ローカルバックアップ（ユーザーごとに分離）
      },
      (err) => {
        setIsLoading(false)
        setError(err)
      },
    )
  }, [uid])

  // fire-and-forget（オフライン時は SDK がキュー保持し再接続時に送信）
  const recordTestSession = useCallback(
    ({ total, correct }) => {
      if (uid) recordToCloud(uid, { total, correct })
    },
    [uid]
  )

  return { sessions, recordTestSession, isLoading, error }
}
