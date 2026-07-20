// 切磋琢磨機能（ランキング・週間チャレンジ）の集計ロジック。
// ブラウザ／サーバーのローカルタイムゾーンに関係なく常にJST（UTC+9、DSTなし）で日付境界を判定する。
// stats.js の toLocalDateKey / calcStreak はローカルTZ依存のため、ここでは流用せず独立して定義する。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const WEEKLY_CHALLENGE_TARGET = 100

// 応援リアクションの定型選択肢（自由入力は不可。firestore.rules の type 許可リストと対応させる）
export const CHEER_REACTIONS = [
  { id: 'keepGoing', label: '🔥 いい継続！' },
  { id: 'almostThere', label: '💪 あと少し！' },
  { id: 'greatJob', label: '👏 ナイス学習！' },
  { id: 'congrats', label: '🎉 達成おめでとう！' },
]

// 実時刻（ISO文字列 or Date） → JSTの 'YYYY-MM-DD'
export function toJstDateKey(input) {
  const instant = input instanceof Date ? input : new Date(input)
  const jst = new Date(instant.getTime() + JST_OFFSET_MS)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 'YYYY-MM-DD' はJSTの暦日そのものなので、以降はカレンダー演算のみ（TZ変換は再度行わない）。
function dateKeyToEpochDay(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function epochDayToDateKey(epochMs) {
  const d = new Date(epochMs)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shiftDateKey(dateKey, days) {
  return epochDayToDateKey(dateKeyToEpochDay(dateKey) + days * DAY_MS)
}

// 0=日, 1=月, ... 6=土
function weekdayOfDateKey(dateKey) {
  return new Date(dateKeyToEpochDay(dateKey)).getUTCDay()
}

// 指定日付キーが属する週（月曜開始）の月曜日の日付キーを返す
export function getWeekStartDateKey(dateKey) {
  const weekday = weekdayOfDateKey(dateKey)
  const diffFromMonday = weekday === 0 ? 6 : weekday - 1
  return shiftDateKey(dateKey, -diffFromMonday)
}

// 週開始日（月曜）から7日分の日付キー配列（月→日の順）を返す
export function getWeekDateKeys(weekStartDateKey) {
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStartDateKey, i))
}

// calcStreak（stats.js）と同じ境界ルール（今日 or 昨日を起点に連続日数を数える）をJSTで計算する。
// learnedDateKeys: 有効回答数が1以上あった日（JST）の集合。
export function calcStreakFromDateKeys(learnedDateKeys, now = new Date()) {
  const days = learnedDateKeys instanceof Set ? learnedDateKeys : new Set(learnedDateKeys)
  if (days.size === 0) return 0

  let cursorKey = toJstDateKey(now)
  if (!days.has(cursorKey)) {
    cursorKey = shiftDateKey(cursorKey, -1)
    if (!days.has(cursorKey)) return 0
  }

  let streak = 0
  while (days.has(cursorKey)) {
    streak++
    cursorKey = shiftDateKey(cursorKey, -1)
  }
  return streak
}

// testSessions（{ date, total, correct }[]）から直接JSTストリークを計算する便宜関数
export function calcStreakFromSessions(sessions, now = new Date()) {
  return calcStreakFromDateKeys(
    sessions.map((s) => toJstDateKey(s.date)),
    now
  )
}

// dailyEntriesByDate: { [dateKey]: { questionCount } } 形式の日次集計から週合計を算出
export function calcWeeklyQuestionCount(dailyEntriesByDate, weekDateKeys) {
  return weekDateKeys.reduce((sum, key) => sum + (dailyEntriesByDate[key]?.questionCount ?? 0), 0)
}

export function isWeeklyChallengeCompleted(weeklyQuestionCount) {
  return weeklyQuestionCount >= WEEKLY_CHALLENGE_TARGET
}

// entries: [{ uid, value }, ...] → valueの降順、同値はuid昇順で安定させたランキングを返す。
// 同値は同順位（競技式: 1位, 1位, 3位）とする。
// 戻り値: [{ uid, value, rank }, ...]
export function buildRanking(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value
    if (a.uid < b.uid) return -1
    if (a.uid > b.uid) return 1
    return 0
  })

  let rank = 0
  let prevValue = null
  return sorted.map((entry, index) => {
    if (prevValue === null || entry.value !== prevValue) {
      rank = index + 1
      prevValue = entry.value
    }
    return { ...entry, rank }
  })
}
