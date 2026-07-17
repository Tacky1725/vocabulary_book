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

// ヒートマップの色分けしきい値（1日の出題数 → level 1〜4）。しきい値はここで一元管理する
// （MASTERY_BUCKETS と同じ方針）。現行の10・20問テストに合わせたテスト回数基準。
// count が 0 のときは level 0（学習なし）。
export const ACTIVITY_LEVEL_THRESHOLDS = [
  { level: 1, min: 1 },
  { level: 2, min: 10 },
  { level: 3, min: 20 },
  { level: 4, min: 40 },
]

function activityLevel(count) {
  let level = 0
  for (const t of ACTIVITY_LEVEL_THRESHOLDS) {
    if (count >= t.min) level = t.level
  }
  return level
}

// 月ラベル（0=1月 … 11=12月）。英語の3文字略記。
const MONTH_LABELS = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.',
  'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
]

// GitHub の草グラフ風、直近 weeks 週間分の日別学習量グリッドを組み立てる純関数。
// 集計元は sessions のみ（total を日ごとに合算。同日複数セッションは合計する）。
// 戻り値: {
//   weeks:  [ [ {dateKey, count, level, future}, ...7日(日→土) ], ... ],  // 列=週(古→新)
//   months: [ {label:'7月', colIndex}, ... ],   // 月が変わる列だけラベルを持つ
//   maxCount, totalDays（学習した日数）, totalCount（総出題数）
// }
// 日付境界はローカルTZ（toLocalDateKey / setDate。calcStreak と同じ流儀。UTC で計算しない）。
export function buildActivityCalendar(sessions, { weeks = 26, now = new Date() } = {}) {
  // 日付キー → 出題数合計
  const counts = new Map()
  for (const s of sessions.slice()) {
    const key = toLocalDateKey(s.date)
    counts.set(key, (counts.get(key) ?? 0) + (s.total ?? 0))
  }

  const todayKey = toLocalDateKey(now.toISOString())

  // 右端 = 今日を含む週の土曜（0=日〜6=土）。左端 = そこから weeks*7-1 日前の日曜。
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const cursor = new Date(end)
  cursor.setDate(cursor.getDate() - (weeks * 7 - 1))

  const weekCols = []
  const months = []
  let lastMonth = null
  let totalDays = 0
  let totalCount = 0
  let maxCount = 0

  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const dateKey = toLocalDateKey(cursor.toISOString())
      const future = dateKey > todayKey // YYYY-MM-DD は辞書順比較で時系列順
      const count = future ? 0 : counts.get(dateKey) ?? 0
      if (count > 0) {
        totalDays++
        totalCount += count
        if (count > maxCount) maxCount = count
      }
      col.push({ dateKey, count, level: activityLevel(count), future })
      // 月ラベルは各列の日曜(d===0)の月を見て、前列から変わったときだけ置く
      if (d === 0) {
        const month = cursor.getMonth()
        if (month !== lastMonth) {
          months.push({ label: MONTH_LABELS[month], colIndex: w })
          lastMonth = month
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    weekCols.push(col)
  }

  return { weeks: weekCols, months, maxCount, totalDays, totalCount }
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
