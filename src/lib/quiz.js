// 出題ロジック。出題モードごとの単語選択を関数として分離してあり、
// 新しいモードは QUESTION_PICKERS にエントリを追加するだけで拡張できる。
import { joinedMeaningJa, hasMeaningJa } from './senses.js'

export const MIN_WORDS_FOR_TEST = 4

// 出題モード定義。available: false のものはUI上で「準備中」として無効表示する。
export const QUIZ_MODES = [
  { id: 'random', label: 'ランダム出題', available: true },
  { id: 'recent', label: '直近追加した語', available: false },
  { id: 'weak', label: '苦手克服（正答率が低い語を優先）', available: false },
]

function shuffle(array) {
  const a = [...array]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// モードID → 出題する単語を選ぶ関数。
// 将来の追加例:
//   recent: (words, count) => [...words].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, count)
//   weak:   (words, count) => 正答率昇順にソートして上位count件
const QUESTION_PICKERS = {
  random: (words, count) => shuffle(words).slice(0, count),
}

// 出題対象の単語リストを選ぶ。count が null/undefined なら全問。
export function pickQuestionWords(words, count, mode = 'random') {
  const picker = QUESTION_PICKERS[mode] ?? QUESTION_PICKERS.random
  const n = count == null ? words.length : Math.min(count, words.length)
  return picker(words, n)
}

// 1問分の4択問題を組み立てる。
// 選択肢のテキストは全語義の日本語訳を結合したもの（例:「銀行；土手」）。
// noneIsCorrect: true を指定すると「正解選択肢が存在しない問題」として
// ダミー4件のみで選択肢を組む。ただしテキストの異なるダミーが4件揃わない場合は
// 通常問題にフォールバックするので、呼び出し側は戻り値の noneIsCorrect フラグだけを信頼すること。
// 戻り値: { word: 出題単語エントリ, choices: [{ meaningJa, isCorrect }], noneIsCorrect }（choicesはシャッフル済み）
export function buildQuestion(word, allWords, { noneIsCorrect = false } = {}) {
  const correctText = joinedMeaningJa(word) || '(訳未登録)'
  const dummies = shuffle(allWords.filter((w) => w.id !== word.id && hasMeaningJa(w)))
  // 結合後のテキストが重複するダミー・正解テキストと同一のダミーは除いて最大4つ集める
  const seen = new Set([correctText])
  const picked = []
  for (const w of dummies) {
    if (picked.length >= 4) break
    const text = joinedMeaningJa(w)
    if (seen.has(text)) continue
    seen.add(text)
    picked.push(text)
  }
  if (noneIsCorrect && picked.length >= 4) {
    // 正解なし問題: 正解選択肢を含めずダミー4件だけで組む
    return {
      word,
      choices: shuffle(picked.map((text) => ({ meaningJa: text, isCorrect: false }))),
      noneIsCorrect: true,
    }
  }
  // 通常問題（正解なし指定でもダミーが4件揃わなければこちらにフォールバック）
  const choices = shuffle([
    { meaningJa: correctText, isCorrect: true },
    ...picked.slice(0, 3).map((text) => ({ meaningJa: text, isCorrect: false })),
  ])
  return { word, choices, noneIsCorrect: false }
}

// 出題単語リスト全体から問題配列を組み立てる（出題順は pickedWords の順を維持）。
// 全体の10〜20%（最低1問）を目標件数としてランダムに選び、その分だけ
// 「正解なし問題」を混ぜる。ダミー不足でフォールバックした問題は通常問題になる。
export function buildQuestions(pickedWords, allWords) {
  const n = pickedWords.length
  const lo = Math.max(1, Math.floor(n * 0.1))
  const hi = Math.max(lo, Math.floor(n * 0.2))
  const target = lo + Math.floor(Math.random() * (hi - lo + 1))
  // 正解なし問題にするインデックスを重複なくランダムに選ぶ
  const noneIndices = new Set(shuffle(pickedWords.map((_, i) => i)).slice(0, target))
  return pickedWords.map((word, i) =>
    buildQuestion(word, allWords, { noneIsCorrect: noneIndices.has(i) })
  )
}

// 単語を「習得済み」（masteryLevel 最大値）にした新しいオブジェクトを返す（イミュータブル）。
export function markAsMastered(word) {
  return { ...word, masteryLevel: 5 }
}

// 回答結果を単語エントリに反映した新しいオブジェクトを返す（イミュータブル）。
// masteryLevel は 0〜5 の範囲でクランプ。
export function applyAnswerResult(word, isCorrect) {
  return {
    ...word,
    masteryLevel: Math.max(0, Math.min(5, word.masteryLevel + (isCorrect ? 1 : -1))),
    correctCount: word.correctCount + (isCorrect ? 1 : 0),
    incorrectCount: word.incorrectCount + (isCorrect ? 0 : 1),
    lastTestedAt: new Date().toISOString(),
  }
}
