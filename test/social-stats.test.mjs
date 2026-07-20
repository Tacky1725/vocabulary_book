import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRanking,
  calcStreakFromDateKeys,
  calcStreakFromSessions,
  calcWeeklyQuestionCount,
  getWeekDateKeys,
  getWeekStartDateKey,
  isWeeklyChallengeCompleted,
  shiftDateKey,
  toJstDateKey,
} from '../src/lib/socialStats.js'

test('toJstDateKey はブラウザ/サーバーのTZに関係なくJST基準の日付境界で判定する', () => {
  // UTC 2026-07-19 15:30 = JST 2026-07-20 00:30 → JSTでは20日
  assert.equal(toJstDateKey('2026-07-19T15:30:00.000Z'), '2026-07-20')
  // UTC 2026-07-19 14:59 = JST 2026-07-19 23:59 → まだ19日
  assert.equal(toJstDateKey('2026-07-19T14:59:00.000Z'), '2026-07-19')
})

test('shiftDateKey は月またぎでも正しく加減算する', () => {
  assert.equal(shiftDateKey('2026-07-20', -1), '2026-07-19')
  assert.equal(shiftDateKey('2026-08-01', -1), '2026-07-31')
})

test('週開始日(月曜)は曜日に関わらず同じ月曜に丸める', () => {
  assert.equal(getWeekStartDateKey('2026-07-20'), '2026-07-20') // 月曜そのもの
  assert.equal(getWeekStartDateKey('2026-07-22'), '2026-07-20') // 水曜
  assert.equal(getWeekStartDateKey('2026-07-26'), '2026-07-20') // 日曜は前の週に属する
})

test('getWeekDateKeys は月→日の7日分を返す', () => {
  assert.deepEqual(getWeekDateKeys('2026-07-20'), [
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
  ])
})

test('calcStreakFromDateKeys は今日未学習でも昨日までの連続日数を維持する', () => {
  const now = new Date('2026-07-20T03:00:00.000Z') // JST 12:00 on 2026-07-20
  assert.equal(
    calcStreakFromDateKeys(new Set(['2026-07-17', '2026-07-18', '2026-07-19']), now),
    3
  )
})

test('calcStreakFromDateKeys は空白日で連続をリセットする', () => {
  const now = new Date('2026-07-20T03:00:00.000Z')
  assert.equal(calcStreakFromDateKeys(new Set(['2026-07-16', '2026-07-18', '2026-07-19']), now), 2)
  assert.equal(calcStreakFromDateKeys(new Set(), now), 0)
  assert.equal(calcStreakFromDateKeys(new Set(['2026-07-10']), now), 0)
})

test('calcStreakFromSessions は testSessions の date から直接ストリークを計算する', () => {
  const now = new Date('2026-07-20T03:00:00.000Z')
  const sessions = [
    { date: '2026-07-18T10:00:00.000Z', total: 10, correct: 8 },
    { date: '2026-07-19T10:00:00.000Z', total: 5, correct: 5 },
  ]
  assert.equal(calcStreakFromSessions(sessions, now), 2)
})

test('calcWeeklyQuestionCount は対象週の日次集計だけを合算する', () => {
  const dailyEntriesByDate = {
    '2026-07-20': { questionCount: 20 },
    '2026-07-22': { questionCount: 30 },
    '2026-07-27': { questionCount: 999 }, // 翌週分は含めない
  }
  const weekKeys = getWeekDateKeys('2026-07-20')
  assert.equal(calcWeeklyQuestionCount(dailyEntriesByDate, weekKeys), 50)
})

test('isWeeklyChallengeCompleted は100問でちょうど達成になる', () => {
  assert.equal(isWeeklyChallengeCompleted(50), false)
  assert.equal(isWeeklyChallengeCompleted(100), true)
  assert.equal(isWeeklyChallengeCompleted(150), true)
})

test('buildRanking は同値を同順位にし、同順位内はuid昇順で安定させる', () => {
  const entries = [
    { uid: 'b', value: 10 },
    { uid: 'a', value: 10 },
    { uid: 'c', value: 20 },
    { uid: 'd', value: 5 },
  ]
  assert.deepEqual(buildRanking(entries), [
    { uid: 'c', value: 20, rank: 1 },
    { uid: 'a', value: 10, rank: 2 },
    { uid: 'b', value: 10, rank: 2 },
    { uid: 'd', value: 5, rank: 4 },
  ])
  assert.deepEqual(buildRanking([]), [])
})
