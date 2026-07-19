import { useCallback, useEffect, useRef, useState } from 'react'

function readClock() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

// 問題を実際に見て考えている時間だけを計測するタイマー。
// visibilitychangeで非表示中を一時停止し、再表示時に同じ問題を再開する。
export function useQuestionTimer() {
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const startedAtRef = useRef(null)
  const elapsedRef = useRef(0)
  const activeRef = useRef(false)
  const pausedByVisibilityRef = useRef(false)

  const updateElapsed = useCallback(() => {
    if (startedAtRef.current === null) return elapsedRef.current
    const next = Math.max(0, readClock() - startedAtRef.current)
    elapsedRef.current = next
    setElapsedMs(next)
    return next
  }, [])

  const pauseForVisibility = useCallback(() => {
    if (!activeRef.current || startedAtRef.current === null) return
    updateElapsed()
    startedAtRef.current = null
    pausedByVisibilityRef.current = true
    setIsRunning(false)
  }, [updateElapsed])

  const resumeFromVisibility = useCallback(() => {
    if (!activeRef.current || !pausedByVisibilityRef.current) return
    startedAtRef.current = readClock()
    pausedByVisibilityRef.current = false
    setIsRunning(true)
  }, [])

  const start = useCallback(() => {
    activeRef.current = true
    elapsedRef.current = 0
    setElapsedMs(0)
    pausedByVisibilityRef.current = document.visibilityState === 'hidden'
    if (pausedByVisibilityRef.current) {
      startedAtRef.current = null
      setIsRunning(false)
    } else {
      startedAtRef.current = readClock()
      setIsRunning(true)
    }
  }, [])

  const stop = useCallback(() => {
    const stoppedAt = startedAtRef.current === null ? elapsedRef.current : updateElapsed()
    activeRef.current = false
    startedAtRef.current = null
    pausedByVisibilityRef.current = false
    setIsRunning(false)
    return stoppedAt
  }, [updateElapsed])

  const reset = useCallback(() => {
    activeRef.current = false
    startedAtRef.current = null
    pausedByVisibilityRef.current = false
    elapsedRef.current = 0
    setElapsedMs(0)
    setIsRunning(false)
  }, [])

  useEffect(() => {
    if (!isRunning) return undefined
    const timerId = setInterval(updateElapsed, 100)
    return () => clearInterval(timerId)
  }, [isRunning, updateElapsed])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pauseForVisibility()
      else resumeFromVisibility()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [pauseForVisibility, resumeFromVisibility])

  useEffect(() => () => {
    activeRef.current = false
    startedAtRef.current = null
  }, [])

  return { elapsedMs, isRunning, start, stop, reset }
}
