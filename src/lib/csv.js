// CSV のパース／シリアライズ（RFC 4180 準拠のクォート処理付き）。
// フォーマット: word,meaningEn,meaningJa,phonetic,partOfSpeech,example,exampleJa（ヘッダー付き）
// 1行 = 1語義。同じ word の行はインポート時に1エントリの senses 配列にまとめられ、
// エクスポート時は語義ごとに行を展開する。1単語1行の旧CSVもそのまま読める。
//
// 上記の自前形式に加えて、市販の単語帳アプリ「DiQt」が配布するCSV（headword/pos/meaning_ja/ipa/
// example_sentence/translated_sentence 等の列を持つ、1見出し語=1行の16列形式）も読み込める。
// ヘッダーの列名で自動判別し、DiQt形式は parseDiqtRow() でsense配列に変換する。
// エクスポートは自前形式（wordsToCsv）と DiQt形式（wordsToDiqtCsv）を別関数として用意し、
// 既存の自前形式の完全な往復性は変えない。
import { createSense, hasSenseContent } from './senses.js'

export const CSV_COLUMNS = [
  'word',
  'meaningEn',
  'meaningJa',
  'phonetic',
  'partOfSpeech',
  'example',
  'exampleJa',
]

// DiQt配布CSVの列（順序は配布ファイルの実例に合わせてあるが、パース側は列名で対応付けるので順不同でよい）
export const DIQT_COLUMNS = [
  'headword',
  'headword_variant',
  'headword_variant_2',
  'reading_ja',
  'pos',
  'supplement',
  'topic_tag',
  'entry',
  'meaning',
  'meaning_en',
  'meaning_ja',
  'ipa',
  'word_id',
  'example_sentence',
  'translated_sentence',
  'sentence_id',
]

// DiQt形式と判定するための目印列（自前形式は 'word' 列を持つので、それが無くこれらを持てばDiQt形式とみなす）
const DIQT_MARKER_COLUMNS = ['headword', 'topic_tag', 'entry', 'ipa', 'word_id']

// CSV文字列を行×列の二次元配列にパースする（ダブルクォート・改行入りセル対応）
function parseRows(text) {
  // エクスポート時に付けたBOM（Excel文字化け対策）が残っていたら除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// DiQt形式の1行を { word, phonetic, senses } に変換する（該当行に単語が無ければ null）。
// DiQtは1行=1見出し語で、複数の語義を meaning/meaning_ja セル内に " / "（半角スペース+スラッシュ+半角スペース）
// 区切りで詰め込んでいる（例: 「(継続する)期間 / (歴史的な)時代 / (試合の)一区切り」）。
// アプリの「1sense=1訳」モデルに合わせるため、この区切りで複数senseに分割する。
// 《U/C》のようなスペース無しの "/" は分割対象にしないよう、厳密一致の ' / ' で split すること
// （\s*\/\s* のような緩い正規表現にすると《U/C》まで誤って割れてしまう）。
//
// 注意: 配布CSVの実例では headword が空の行は topic_tag ではなく entry 列に単語名が入る
// （entry は「見出し語のコピー」であり meaning とは無関係）。meaning と meaning_ja は同一内容が
// 重複して入っており、これが実際の語義テキスト。
function parseDiqtRow(raw) {
  const word = raw.headword || raw.entry || raw.topic_tag
  if (!word) return null

  const partOfSpeech = raw.pos || ''
  const meaningJaText = raw.meaning_ja || raw.meaning || ''
  const meaningEnText = raw.meaning_en || ''
  const example = raw.example_sentence || ''
  const exampleJa = raw.translated_sentence || ''

  const parts = meaningJaText.split(' / ').map((s) => s.trim()).filter(Boolean)
  const meaningJaList = parts.length ? parts : ['']

  // pos・英語定義・例文はDiQt側が単語単位でしか持たないため、先頭のsenseにのみ割り当てる
  const senses = meaningJaList
    .map((meaningJa, i) =>
      createSense({
        partOfSpeech,
        meaningJa,
        meaningEn: i === 0 ? meaningEnText : '',
        example: i === 0 ? example : '',
        exampleJa: i === 0 ? exampleJa : '',
      })
    )
    .filter(hasSenseContent)

  return { word, phonetic: raw.ipa || '', senses }
}

// CSVテキストを単語エントリのオブジェクト配列に変換する。
// ヘッダー行の列名で対応付けるので、列の順序が違っても・一部の列が無くてもよい。
// 自前形式（word 列を持つ）と DiQt配布形式（headword/topic_tag/entry/ipa/word_id 等を持つ）を
// ヘッダーの列名で自動判別する。同じ word（大文字小文字無視）の行は1エントリにまとめる。
// 戻り値: { entries: [{word, phonetic, senses: [...]}], error: string | null }
export function parseWordsCsv(text) {
  const rows = parseRows(text)
  if (rows.length === 0) return { entries: [], error: 'CSVが空です' }

  const header = rows[0].map((h) => h.trim())
  const isNative = header.includes('word')
  const isDiqt = !isNative && DIQT_MARKER_COLUMNS.some((col) => header.includes(col))
  if (!isNative && !isDiqt) {
    return { entries: [], error: 'ヘッダー行に word（またはDiQt形式の headword）列が必要です' }
  }

  const byKey = new Map()
  for (const row of rows.slice(1)) {
    const raw = {}
    header.forEach((col, i) => {
      raw[col] = (row[i] ?? '').trim()
    })

    const parsed = isNative
      ? (() => {
          if (!raw.word) return null
          const sense = createSense(raw)
          return { word: raw.word, phonetic: raw.phonetic || '', senses: hasSenseContent(sense) ? [sense] : [] }
        })()
      : parseDiqtRow(raw)
    if (!parsed || !parsed.word) continue

    const key = parsed.word.toLowerCase()
    let entry = byKey.get(key)
    if (!entry) {
      entry = { word: parsed.word, phonetic: '', senses: [] }
      byKey.set(key, entry)
    }
    if (parsed.phonetic && !entry.phonetic) entry.phonetic = parsed.phonetic
    entry.senses.push(...parsed.senses)
  }
  return { entries: [...byKey.values()], error: null }
}

function escapeCell(value) {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`
  return s
}

// 単語配列をCSV文字列に変換する（1語義 = 1行に展開。語義なしの単語は空欄1行）
export function wordsToCsv(words) {
  const lines = [CSV_COLUMNS.join(',')]
  for (const w of words) {
    const senses = w.senses?.length ? w.senses : [createSense()]
    for (const s of senses) {
      const rowSource = { word: w.word, phonetic: w.phonetic, ...s }
      lines.push(CSV_COLUMNS.map((col) => escapeCell(rowSource[col])).join(','))
    }
  }
  return lines.join('\r\n')
}

// 単語配列をDiQt形式のCSV文字列に変換する（1単語 = 1行。DiQt自体の粒度に合わせる）。
// 既知の制約: DiQt形式は pos・例文を単語単位でしか持てないため、senseごとにposや例文が
// 異なる単語をここでエクスポートして再インポートすると、2つ目以降のsenseのpos・例文は失われる
// （完全な往復変換にはならない）。完全に往復させたい場合は自前形式（wordsToCsv）を使うこと。
export function wordsToDiqtCsv(words) {
  const lines = [DIQT_COLUMNS.join(',')]
  for (const w of words) {
    const senses = w.senses?.length ? w.senses : [createSense()]
    const pos = senses.find((s) => s.partOfSpeech)?.partOfSpeech ?? ''
    const meaningJa = senses.map((s) => s.meaningJa).filter(Boolean).join(' / ')
    const meaningEn = senses.map((s) => s.meaningEn).filter(Boolean).join(' / ')
    const example = senses.find((s) => s.example)?.example ?? ''
    const exampleJa = senses.find((s) => s.exampleJa)?.exampleJa ?? ''
    const rowSource = {
      headword: w.word,
      headword_variant: '',
      headword_variant_2: '',
      reading_ja: '',
      pos,
      supplement: '',
      topic_tag: '',
      entry: w.word,
      meaning: meaningJa,
      meaning_en: meaningEn,
      meaning_ja: meaningJa,
      ipa: w.phonetic ?? '',
      word_id: '',
      example_sentence: example,
      translated_sentence: exampleJa,
      sentence_id: '',
    }
    lines.push(DIQT_COLUMNS.map((col) => escapeCell(rowSource[col])).join(','))
  }
  return lines.join('\r\n')
}

// CSV文字列をファイルとしてダウンロードさせる
export function downloadCsv(csvText, filename) {
  // Excel での文字化け防止に BOM を付ける
  const blob = new Blob(['\uFEFF' + csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
