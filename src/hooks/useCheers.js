import { useEffect, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { subscribeCheers } from '../lib/socialCloud.js'

// 自分宛ての応援（新しい順）の state と Firestore を同期させるフック。
export function useCheers() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [cheers, setCheers] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setCheers([])

    if (!uid) {
      setIsLoading(false)
      return undefined
    }

    setIsLoading(true)
    return subscribeCheers(
      uid,
      (next) => {
        setCheers(next)
        setIsLoading(false)
      },
      () => setIsLoading(false)
    )
  }, [uid])

  return { cheers, isLoading }
}
