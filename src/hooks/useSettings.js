import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { saveSettings, subscribeSettings } from '../lib/cloud.js'
import { saveSettingsMirror } from '../lib/storage.js'

// ユーザー設定（meta/settings）の state と Firestore を同期させるフック。
// useTestSessions と同じ構造: 購読 + 部分更新。スナップショットは localStorage にもミラーして
// クラウド障害時のバックアップとして残す。
// settings の形は各機能が必要なキーを merge で足していく（初期は #1 の dailyGoal）。
export function useSettings() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [settings, setSettings] = useState({})

  useEffect(() => {
    if (!uid) return undefined
    return subscribeSettings(uid, (next) => {
      setSettings(next)
      saveSettingsMirror(uid, next) // ローカルバックアップ（ユーザーごとに分離）
    })
  }, [uid])

  // 部分更新（merge）。ドキュメント全体を上書きしないよう、変更するキーだけを patch すること。
  // fire-and-forget（オフライン時は SDK がキュー保持し再接続時に送信）。
  const updateSettings = useCallback(
    (patch) => {
      if (uid) saveSettings(uid, patch)
    },
    [uid]
  )

  return { settings, updateSettings }
}
