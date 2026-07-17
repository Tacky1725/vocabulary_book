import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { subscribeAuth } from '../lib/firebase.js'
import { migrateLocalDataIfNeeded } from '../lib/cloud.js'

// 認証状態を全ページで共有するコンテキスト。
// status: 'loading'（認証状態の復元中） | 'signedOut' | 'preparing'（初回移行中）
//       | 'migrationError'（初回移行失敗。再試行が必要） | 'ready'
// ready になるまでアプリ本体（Routes）は描画しない。移行完了前に各フックの購読・
// localStorage ミラーが動くと移行元データを壊しうるため、このゲートは外さないこと。

const AuthContext = createContext({ user: null, status: 'loading', retryMigration: () => {} })

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: 'loading' })
  // ログアウト直後に古い移行処理の完了が state を上書きしないよう、現在の uid を控える
  const currentUidRef = useRef(null)

  const prepare = useCallback(async (user) => {
    setState({ user, status: 'preparing' })
    const result = await migrateLocalDataIfNeeded(user.uid)
    if (currentUidRef.current !== user.uid) return
    if (result.ok) {
      setState({ user, status: 'ready' })
    } else {
      setState({ user, status: 'migrationError', error: result.error })
    }
  }, [])

  useEffect(() => {
    return subscribeAuth((user) => {
      currentUidRef.current = user?.uid ?? null
      if (user) {
        prepare(user)
      } else {
        setState({ user: null, status: 'signedOut' })
      }
    })
  }, [prepare])

  const retryMigration = useCallback(() => {
    if (state.user) prepare(state.user)
  }, [state.user, prepare])

  return (
    <AuthContext.Provider value={{ ...state, retryMigration }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
