// 単語の難易度（CEFR）・カテゴリタグ関連の純ロジック。
// CEFR は #6 で自動判定するための受け皿（#5 時点では手動選択のみ）。
// カテゴリは固定リストを持たず、words から動的に収集する（README「ユーザー固有タグの管理」参照）。

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export function isValidCefr(v) {
  return v === '' || CEFR_LEVELS.includes(v)
}

// 新規ユーザーでも候補が0件にならないよう常に含めるデフォルトタグ
export const DEFAULT_CATEGORIES = ['大学受験', 'TOEIC']

// カテゴリタグ配列を整形する（trim・空除去・大文字小文字を保持したまま重複除去）。
// 追加・CSV・編集のいずれでもこれを通し、判定ロジックを分散させない
// （senses.js の hasSenseContent を一本化しているのと同じ方針）。
// ';' は自前形式CSVのタグ区切り文字（csv.js）と衝突するため、タグ自体には含めさせない。
export function normalizeCategories(list) {
  const seen = new Set()
  const out = []
  for (const raw of list ?? []) {
    const s = String(raw).replace(/;/g, '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

// 全単語の categories + デフォルトタグから、候補として提示する既知タグ一覧を作る純関数。
// タグを永続化する専用ストアは持たず、words が唯一の情報源（README「ユーザー固有タグの管理」）。
// そのためタイポ等で誤って付けたタグも、そのタグを使う単語がなくなれば次の計算で自然に候補から消える。
export function collectKnownCategories(words) {
  const seen = new Map() // key: 小文字化したタグ -> 表示に使う元の表記（先に出現した表記を採用）
  const add = (tag) => {
    const s = String(tag ?? '').trim()
    if (!s) return
    const key = s.toLowerCase()
    if (!seen.has(key)) seen.set(key, s)
  }
  DEFAULT_CATEGORIES.forEach(add)
  for (const w of words ?? []) {
    for (const tag of w.categories ?? []) add(tag)
  }

  const isDefault = (t) => DEFAULT_CATEGORIES.some((d) => d.toLowerCase() === t.toLowerCase())
  const rest = [...seen.values()].filter((t) => !isDefault(t)).sort((a, b) => a.localeCompare(b, 'ja'))
  return [...DEFAULT_CATEGORIES, ...rest]
}
