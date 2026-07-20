import { useEffect, useRef, useState } from 'react'
import { getPublicProfile } from '../lib/socialCloud.js'

// senderUidの配列から公開プロフィールの表示名を解決してキャッシュするフック。
// リアルタイム反映は不要なので単発取得(getPublicProfile)を使い、一度解決したuidは再取得しない。
// senderUidsは呼び出し側でuseMemoして参照を安定させること（不安定だと毎回再取得してしまう）。
export function useSenderDisplayNames(senderUids) {
  const [namesByUid, setNamesByUid] = useState({})
  const fetchedRef = useRef(new Set())

  useEffect(() => {
    const missing = senderUids.filter((uid) => !fetchedRef.current.has(uid))
    if (missing.length === 0) return undefined
    missing.forEach((uid) => fetchedRef.current.add(uid))

    let cancelled = false
    Promise.all(
      missing.map(async (uid) => {
        const result = await getPublicProfile(uid)
        return [uid, result.ok ? (result.data?.displayName ?? null) : null]
      })
    ).then((pairs) => {
      if (!cancelled) setNamesByUid((prev) => ({ ...prev, ...Object.fromEntries(pairs) }))
    })

    return () => {
      cancelled = true
    }
  }, [senderUids])

  return namesByUid
}
