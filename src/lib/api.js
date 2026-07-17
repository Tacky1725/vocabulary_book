// 外部API（辞書・翻訳）へのアクセス。どちらもAPIキー不要の無料エンドポイント。
// 失敗してもアプリが落ちないよう、必ず { ok, ... } 形式で返しthrowしない。

const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en'
// Google翻訳の非公式JSONエンドポイント（gtx）。MyMemoryより訳質が良く、CORS対応済みでAPIキーも不要。
// 非公式・未文書化のため予告なく仕様変更/遮断される可能性がある点に留意。
const TRANSLATE_API = 'https://translate.googleapis.com/translate_a/single'

// 候補として返す語義の最大数（UIが煩雑にならない程度に絞る）
const MAX_SENSE_CANDIDATES = 8

// 英英辞書APIから発音記号と語義候補（品詞・定義・例文のセット）を取得する。
// 戻り値: { ok: true, data: { word, phonetic, senses: [{ partOfSpeech, meaningEn, example }] } }
//        | { ok: false, error: string }
export async function fetchDictionaryEntry(word) {
  try {
    const res = await fetch(`${DICTIONARY_API}/${encodeURIComponent(word.trim())}`)
    if (res.status === 404) {
      return { ok: false, error: `「${word}」は辞書に見つかりませんでした` }
    }
    if (!res.ok) {
      return { ok: false, error: `辞書APIエラー (${res.status})` }
    }
    const json = await res.json()
    const entry = Array.isArray(json) ? json[0] : null
    if (!entry) return { ok: false, error: '辞書APIの応答を解釈できませんでした' }

    const phonetic =
      entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || ''

    // すべての品詞×定義を語義候補として平坦化する（上限あり）
    const senses = []
    outer: for (const meaning of entry.meanings ?? []) {
      for (const def of meaning.definitions ?? []) {
        if (!def.definition) continue
        senses.push({
          partOfSpeech: meaning.partOfSpeech || '',
          meaningEn: def.definition,
          example: def.example || '',
        })
        if (senses.length >= MAX_SENSE_CANDIDATES) break outer
      }
    }

    return {
      ok: true,
      data: {
        word: entry.word || word.trim(),
        phonetic,
        senses,
      },
    }
  } catch {
    return { ok: false, error: '辞書APIへの接続に失敗しました（ネットワークを確認してください）' }
  }
}

// 翻訳APIで英→日の訳を取得する。失敗時は ok: false（空欄のまま追加できるようにする）。
export async function fetchJapaneseTranslation(text) {
  try {
    const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl: 'ja', dt: 't', q: text.trim() })
    const res = await fetch(`${TRANSLATE_API}?${params}`)
    if (!res.ok) return { ok: false, error: `翻訳APIエラー (${res.status})` }
    const json = await res.json()
    // レスポンスは [[[訳1, 原文1, ...], [訳2, 原文2, ...], ...], ...] の形式。
    // 長文は複数チャンクに分割されるため、訳文チャンクを連結して1つの文字列に戻す。
    const chunks = json?.[0]
    const translated = Array.isArray(chunks) ? chunks.map((c) => c[0]).join('') : ''
    if (!translated) {
      return { ok: false, error: '翻訳を取得できませんでした' }
    }
    return { ok: true, data: translated }
  } catch {
    return { ok: false, error: '翻訳APIへの接続に失敗しました' }
  }
}
