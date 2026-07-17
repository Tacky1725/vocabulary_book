// 学習記録の集計ロジック（ストリーク・習熟度分布・正答率など）。

// ISO日時 → ローカルタイムゾーンの 'YYYY-MM-DD'
export function toLocalDateKey(isoString) {
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 連続学習日数。今日または昨日を最終日とする連続日数を返す
// （今日まだテストしていなくても、昨日までの連続は途切れていない扱い）。
export function calcStreak(sessions, now = new Date()) {
  const days = new Set(sessions.map((s) => toLocalDateKey(s.date)))
  if (days.size === 0) return 0

  const cursor = new Date(now)
  const todayKey = toLocalDateKey(cursor.toISOString())
  if (!days.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(toLocalDateKey(cursor.toISOString()))) return 0
  }

  let streak = 0
  while (days.has(toLocalDateKey(cursor.toISOString()))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// 習熟度の3段階バケット。しきい値はここで一元管理する。
// 未学習: masteryLevel 0 / 学習中: 1〜3 / 習得済み: 4〜5
export const MASTERY_BUCKETS = [
  { id: 'unlearned', label: '未学習', match: (level) => level === 0 },
  { id: 'learning', label: '学習中', match: (level) => level >= 1 && level <= 3 },
  { id: 'mastered', label: '習得済み', match: (level) => level >= 4 },
]

export function calcMasteryDistribution(words) {
  return MASTERY_BUCKETS.map((bucket) => ({
    ...bucket,
    count: words.filter((w) => bucket.match(w.masteryLevel)).length,
  }))
}

// ダッシュボード用サマリー
export function calcSummary(words, sessions) {
  const totalAnswers = sessions.reduce((sum, s) => sum + s.total, 0)
  const totalCorrect = sessions.reduce((sum, s) => sum + s.correct, 0)
  return {
    totalWords: words.length,
    totalTests: sessions.length,
    totalAnswers,
    accuracy: totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : null,
  }
}
