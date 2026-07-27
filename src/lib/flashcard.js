// 暗記カード（フラッシュカード）のロジック（React 非依存）。
// 出題順の選択はテストと同じ pickQuestionWords を流用する（このファイルには持たない）。
import { applyReviewOutcome, DEFAULT_REVIEW_INTERVALS } from './srs.js'
import { hasMeaningJa } from './senses.js'

export const FLASHCARD_DIRECTIONS = [
  { id: 'en-ja', label: '英語 → 日本語' },
  { id: 'ja-en', label: '日本語 → 英語' },
]

// 暗記カードは4択のダミーが不要なので1枚から開始できる。
export const MIN_ENTRIES_FOR_FLASHCARD = 1

// 暗記カードの対象は日本語訳のある語（英→日・日→英とも日本語訳が要る。英語側は word で常にある）。
export function isEntryEligibleForFlashcard(entry) {
  return hasMeaningJa(entry)
}

// 自己申告（known: true=覚えた / false=まだ）を反映した新エントリを返す（イミュータブル）。
// - correctCount / incorrectCount / lastTestedAt は触らない（客観テスト専用の指標を汚さないため）。
// - masteryLevel は 0〜5 でクランプ。
// - srs は「覚えた=正解相当 / まだ=不正解相当」でレビューし、今日の復習も消化する
//   （srs.lastReviewedAt・dueAt を更新。トップレベルの lastTestedAt とは別物）。
export function applyFlashcardResult(entry, known, reviewedAt = new Date(), intervals = DEFAULT_REVIEW_INTERVALS) {
  const delta = known ? 1 : -1
  return {
    ...entry,
    masteryLevel: Math.max(0, Math.min(5, (entry.masteryLevel ?? 0) + delta)),
    srs: applyReviewOutcome(entry.srs, known ? 'correct' : 'incorrect', reviewedAt, intervals),
  }
}
