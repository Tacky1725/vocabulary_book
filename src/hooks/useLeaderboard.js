import { useEffect, useMemo, useState } from 'react'
import { subscribeDailyLeaderboard } from '../lib/socialCloud.js'
import { calcWeeklyQuestionCount, getWeekDateKeys } from '../lib/socialStats.js'

// 指定日(JST基準の 'YYYY-MM-DD')の日次ランキングエントリ一覧を購読するフック。
export function useDailyLeaderboard(jstDate) {
  const [entries, setEntries] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setEntries([])
    setError(null)
    setIsLoading(true)
    return subscribeDailyLeaderboard(
      jstDate,
      (next) => {
        setEntries(next)
        setIsLoading(false)
      },
      (err) => {
        setIsLoading(false)
        setError(err)
      }
    )
  }, [jstDate])

  return { entries, isLoading, error }
}

// 週開始日(月曜)から7日分を購読し、uidごとにquestionCountを合算するフック。
// displayName/photoURLは週内で最後に出現した(=直近の)日のスナップショットを採用する。
export function useWeeklyLeaderboard(weekStartDateKey) {
  const weekDateKeys = useMemo(() => getWeekDateKeys(weekStartDateKey), [weekStartDateKey])
  const [entriesByDate, setEntriesByDate] = useState({})
  const [loadedDates, setLoadedDates] = useState(() => new Set())
  const [error, setError] = useState(null)

  useEffect(() => {
    setEntriesByDate({})
    setLoadedDates(new Set())
    setError(null)
    const unsubscribes = weekDateKeys.map((dateKey) =>
      subscribeDailyLeaderboard(
        dateKey,
        (next) => {
          setEntriesByDate((prev) => ({ ...prev, [dateKey]: next }))
          setLoadedDates((prev) => new Set(prev).add(dateKey))
        },
        (err) => setError(err)
      )
    )
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
  }, [weekDateKeys])

  const isLoading = loadedDates.size < weekDateKeys.length

  const entries = useMemo(() => {
    // uid → { profile: 直近の日のエントリ, byDate: {dateKey: {questionCount}} }
    const byUid = new Map()
    for (const dateKey of weekDateKeys) {
      for (const entry of entriesByDate[dateKey] ?? []) {
        const bucket = byUid.get(entry.uid) ?? { profile: null, byDate: {} }
        bucket.profile = entry
        bucket.byDate[dateKey] = { questionCount: entry.questionCount ?? 0 }
        byUid.set(entry.uid, bucket)
      }
    }
    return Array.from(byUid.values()).map(({ profile, byDate }) => ({
      uid: profile.uid,
      displayName: profile.displayName,
      photoURL: profile.photoURL,
      questionCount: calcWeeklyQuestionCount(byDate, weekDateKeys),
    }))
  }, [entriesByDate, weekDateKeys])

  return { entries, isLoading, error }
}
