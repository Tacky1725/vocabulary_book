import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { usePublicProfile } from './usePublicProfile.js'
import { recordTestSession as recordToCloud, subscribeTestSessions } from '../lib/cloud.js'
import {
  ensureDailyEntry,
  recordLeaderboardAnswer as recordLeaderboardAnswerToCloud,
} from '../lib/socialCloud.js'
import { calcStreakFromSessions } from '../lib/socialStats.js'
import { saveTestSessionsMirror } from '../lib/storage.js'

// テスト実施履歴（出題数・正答数・任意の回答時間）の state と Firestore を同期させるフック。
// スナップショットは localStorage にもミラーし、クラウド障害時のバックアップとして残す。
// 切磋琢磨機能（ランキング）向けの日次集計連携もここに置く（sessions からstreakを計算できるため）。
export function useTestSessions() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  // ランキングの表示名・アイコンは publicProfiles を優先し、未設定ならGoogleアカウントの値にする
  const { profile, isLoading: profileLoading } = usePublicProfile()
  const displayName = profile?.displayName || user?.displayName || ''
  const photoURL = profile?.photoURL || user?.photoURL || ''

  const [sessions, setSessions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  // 当日エントリのensureはログイン（sessions・プロフィール読み込み完了）につき1回だけ行う
  const ensuredUidRef = useRef(null)

  useEffect(() => {
    setSessions([])
    setError(null)
    ensuredUidRef.current = null

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

  // ランキングの当日エントリ（streak表示用）をログイン成立時に1回作成/更新する。
  // 未学習ユーザーも0件でランキングに表示されるようにするため、回答を待たずここで作る。
  // profileLoadingも待つのは、publicProfilesの読み込みより先に発火してGoogleアカウント名を
  // 書き込んでしまうと（このeffectはuidにつき1回しか動かないため）以後修正されないため。
  useEffect(() => {
    if (!uid || isLoading || profileLoading || ensuredUidRef.current === uid) return
    ensuredUidRef.current = uid
    ensureDailyEntry(uid, {
      displayName,
      photoURL,
      streak: calcStreakFromSessions(sessions),
    })
  }, [uid, isLoading, profileLoading, sessions, displayName, photoURL])

  // fire-and-forget（オフライン時は SDK がキュー保持し再接続時に送信）
  const recordTestSession = useCallback(
    ({ total, correct, durationMs }) => {
      if (uid) recordToCloud(uid, { total, correct, durationMs })
    },
    [uid]
  )

  // クイズの1問回答確定ごとに呼ぶ（fire-and-forget）。ランキングのDaily/Weekly値を+1する。
  const recordLeaderboardAnswer = useCallback(() => {
    if (uid) {
      recordLeaderboardAnswerToCloud(uid, { displayName, photoURL })
    }
  }, [uid, displayName, photoURL])

  return { sessions, recordTestSession, recordLeaderboardAnswer, isLoading, error }
}
