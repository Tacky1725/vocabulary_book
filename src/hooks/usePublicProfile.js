import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { savePublicProfile, subscribePublicProfile } from '../lib/socialCloud.js'

// 自分の公開プロフィール（ランキング表示用の表示名・アイコン）の state と Firestore を同期させるフック。
// profile は未設定なら null（初回設定モーダルの表示要否の判定に使う）。
export function usePublicProfile() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setProfile(null)

    if (!uid) {
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    return subscribePublicProfile(
      uid,
      (next) => {
        setProfile(next)
        setIsLoading(false)
      },
      () => setIsLoading(false)
    )
  }, [uid])

  const saveProfile = useCallback(
    (patch) => {
      if (!uid) return Promise.resolve({ ok: false, error: 'ログインしていません' })
      return savePublicProfile(uid, patch)
    },
    [uid]
  )

  return { profile, isLoading, saveProfile }
}
