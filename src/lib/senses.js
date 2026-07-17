// 語義（sense）まわりのヘルパー。
// 1つの単語エントリは senses 配列を持ち、各語義が品詞・英語定義・日本語訳・例文のセットを持つ。

export function createSense(fields = {}) {
  return {
    partOfSpeech: fields.partOfSpeech ?? '',
    meaningEn: fields.meaningEn ?? '',
    meaningJa: fields.meaningJa ?? '',
    example: fields.example ?? '',
    exampleJa: fields.exampleJa ?? '',
  }
}

// senseの全フィールドが空かどうか（CSV読み込み・一覧編集の両方で使う判定を一本化）
export function hasSenseContent(sense) {
  return Boolean(
    sense.partOfSpeech || sense.meaningEn || sense.meaningJa || sense.example || sense.exampleJa
  )
}

// 全語義の日本語訳を「銀行；土手」のように結合する（クイズの選択肢・一覧表示用）
export function joinedMeaningJa(word) {
  return (word.senses ?? [])
    .map((s) => s.meaningJa?.trim())
    .filter(Boolean)
    .join('；')
}

// 日本語訳を1つ以上持つか（クイズの出題対象判定用）
export function hasMeaningJa(word) {
  return (word.senses ?? []).some((s) => s.meaningJa && s.meaningJa.trim() !== '')
}
