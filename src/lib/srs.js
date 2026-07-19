// 復習間隔の自動調整ロジック。
// 画面では専門用語を避け、「今日の復習」「復習間隔」「次回の復習日」と表示する。

import { toLocalDateKey } from './stats.js'

export const DEFAULT_SRS = {
  repetitions: 0,
  easeFactor: 2.5,
  intervalDays: 0,
  dueAt: null,
  lastReviewedAt: null,
}

export const MAX_REVIEW_INTERVAL_DAYS = 3650

export const DEFAULT_REVIEW_INTERVALS = {
  correctFirstDays: 2,
  correctSecondDays: 6,
  correctLaterMinDays: 3,
  incorrectDays: 1,
  unknownDays: 1,
  masteredDays: 30,
}

function addLocalDays(date, days) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + days)
  return next.toISOString()
}

function normalizedSrs(srs) {
  return {
    ...DEFAULT_SRS,
    ...(srs ?? {}),
    repetitions: Math.max(0, Number(srs?.repetitions) || 0),
    easeFactor: Math.max(1.3, Number(srs?.easeFactor) || DEFAULT_SRS.easeFactor),
    intervalDays: Math.max(0, Number(srs?.intervalDays) || 0),
  }
}

function normalizeDays(value, fallback) {
  if (value == null || value === '' || (typeof value === 'string' && value.trim() === '')) {
    return fallback
  }
  const days = Number(value)
  return Number.isInteger(days) && days >= 0 && days <= MAX_REVIEW_INTERVAL_DAYS
    ? days
    : fallback
}

// 欠落・不正な設定項目だけをデフォルト値で補完する純関数。
export function normalizeReviewIntervals(values) {
  const source = values ?? {}
  return Object.fromEntries(
    Object.entries(DEFAULT_REVIEW_INTERVALS).map(([key, fallback]) => [
      key,
      normalizeDays(source[key], fallback),
    ]),
  )
}

export function validateReviewIntervals(values) {
  const errors = {}
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < 0) {
      errors[key] = '0以上の整数を入力してください'
    } else if (Number(value) > MAX_REVIEW_INTERVAL_DAYS) {
      errors[key] = `${MAX_REVIEW_INTERVAL_DAYS}日以下で入力してください`
    }
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

function nextEaseFactor(current, quality) {
  return Math.max(
    1.3,
    current.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  )
}

// 回答結果を復習間隔へ反映する純関数。入力オブジェクトは変更しない。
export function applyReviewOutcome(
  srs,
  outcome,
  now = new Date(),
  intervals = DEFAULT_REVIEW_INTERVALS,
) {
  const current = normalizedSrs(srs)
  const settings = normalizeReviewIntervals(intervals)
  const q = outcome === 'correct' ? 4 : 2
  const easeFactor = nextEaseFactor(current, q)

  let repetitions
  let intervalDays
  if (outcome === 'correct') {
    repetitions = current.repetitions + 1
    if (current.repetitions === 0) intervalDays = settings.correctFirstDays
    else if (current.repetitions === 1) intervalDays = settings.correctSecondDays
    else {
      intervalDays = Math.max(
        settings.correctLaterMinDays,
        Math.round(current.intervalDays * current.easeFactor),
      )
    }
  } else {
    repetitions = 0
    intervalDays = outcome === 'unknown' ? settings.unknownDays : settings.incorrectDays
  }

  return {
    repetitions,
    easeFactor,
    intervalDays,
    dueAt: addLocalDays(now, intervalDays),
    lastReviewedAt: new Date(now).toISOString(),
  }
}

// 既存のqualityベース呼び出しとの互換用。新しいコードはapplyReviewOutcomeを使う。
export function applySrs(srs, quality, now = new Date(), intervals = DEFAULT_REVIEW_INTERVALS) {
  return applyReviewOutcome(srs, Number(quality) >= 3 ? 'correct' : 'incorrect', now, intervals)
}

// 「習得済みにする」は通常の回答とは別に、当面の復習対象から外す操作として扱う。
export function markAsMasteredWithSrs(
  srs,
  now = new Date(),
  intervals = DEFAULT_REVIEW_INTERVALS,
) {
  const current = normalizedSrs(srs)
  const intervalDays = normalizeReviewIntervals(intervals).masteredDays
  return {
    ...current,
    repetitions: Math.max(2, current.repetitions),
    intervalDays,
    dueAt: addLocalDays(now, intervalDays),
    lastReviewedAt: new Date(now).toISOString(),
  }
}

export function reviewOutcomeFromAnswer(answer, isCorrect) {
  if (answer === 'unknown' || answer?.kind === 'unknown') return 'unknown'
  return isCorrect ? 'correct' : 'incorrect'
}

// 未学習語は「今日の復習」には含めず、未出題モードで扱う。
export function isDue(word, now = new Date()) {
  const dueAt = word?.srs?.dueAt
  if (!dueAt) return false
  const dueKey = toLocalDateKey(dueAt)
  const todayKey = toLocalDateKey(new Date(now).toISOString())
  return dueKey <= todayKey
}

function accuracy(word) {
  const correct = word?.correctCount ?? 0
  const incorrect = word?.incorrectCount ?? 0
  const total = correct + incorrect
  return total === 0 ? Infinity : correct / total
}

// 復習期限の早い順。同じ期限なら正答率が低い語、追加日時が古い語を優先する。
export function compareDueWords(a, b) {
  const dueCompare = String(a?.srs?.dueAt ?? '').localeCompare(String(b?.srs?.dueAt ?? ''))
  if (dueCompare !== 0) return dueCompare
  return (
    accuracy(a) - accuracy(b) ||
    String(a?.addedAt ?? '').localeCompare(String(b?.addedAt ?? '')) ||
    String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  )
}
