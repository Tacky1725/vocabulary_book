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

  useEffect(() => {
    if (!uid) return undefined
    return subscribeTestSessions(uid, (next) => {
      setSessions(next)
      saveTestSessionsMirror(uid, next) // ローカルバックアップ（ユーザーごとに分離）
    })
  }, [uid])

  // fire-and-forget（オフライン時は SDK がキュー保持し再接続時に送信）
  const recordTestSession = useCallback(
    ({ total, correct }) => {
      if (uid) recordToCloud(uid, { total, correct })
    },
    [uid]
  )

  return { sessions, recordTestSession }
}
