// data/cefr.json（単語→CEFRレベルの対応表）をロードして引く。出典・ライセンスは
// data/CEFR_LICENSE.md 参照。外部APIは使わずバンドルした静的データのみで判定する。
// 見出し語の原形のみ収録（語形変化は未対応）。見つからなければ ''（未判定）を返す。
//
// 初期バンドルに含めないよう動的importで遅延ロードする（判定は追加/インポート時にしか走らない）。
let tablePromise = null
function loadTable() {
  if (!tablePromise) tablePromise = import('../data/cefr.json').then((m) => m.default)
  return tablePromise
}

export async function lookupCefr(word) {
  const table = await loadTable()
  return table[String(word).trim().toLowerCase()] ?? ''
}

// 複数語を一括判定する（テーブルのロードは1回だけ）。CSV/DiQtインポート時用。
export async function lookupCefrMany(words) {
  const table = await loadTable()
  return words.map((w) => table[String(w).trim().toLowerCase()] ?? '')
}
