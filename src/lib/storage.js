// localStorage レイヤー。Firestore 移行後の役割は次の2つ:
//   1. 初回移行元: 旧バージョンが localStorage に保存したデータを cloud.js が読んで Firestore へ移す
//      （uid なしの旧キーを読む。書き込みはもうしない）
//   2. ローカルバックアップ: 各フックが Firestore スナップショットをミラー保存する（クラウド障害時の保険）
//      （複数人利用で互いに上書きしないよう、uid 付きのキーに保存する）
// アプリの読み書きの正は Firestore（lib/cloud.js）であり、ここを直接の保存先にはしない。

import { createSense } from './senses.js'

const LEGACY_WORDS_KEY = 'vocab-app:words'
const LEGACY_SESSIONS_KEY = 'vocab-app:test-sessions'
const wordsMirrorKey = (uid) => `vocab-app:words:${uid}`
const sessionsMirrorKey = (uid) => `vocab-app:test-sessions:${uid}`

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : fallback
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error('localStorage への保存に失敗しました', e)
  }
}

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ---- 単語 ----

// 旧形式（meaningJa 等がトップレベルの単一語義）のエントリを senses 配列形式に変換する。
// 読み込み時に毎回通すので、localStorage に残っている旧データもそのまま使える。
function migrateWord(w) {
  if (Array.isArray(w.senses)) return w
  const { meaningEn, meaningJa, partOfSpeech, example, ...rest } = w
  const hasContent = [meaningEn, meaningJa, partOfSpeech, example].some(
    (v) => v && String(v).trim() !== ''
  )
  return {
    ...rest,
    senses: hasContent ? [createSense({ partOfSpeech, meaningEn, meaningJa, example })] : [],
  }
}

// 旧バージョン（Firestore 導入前）のデータ読み込み。初回移行専用。
export function loadLegacyWords() {
  return loadJson(LEGACY_WORDS_KEY, []).map(migrateWord)
}

export function saveWordsMirror(uid, words) {
  saveJson(wordsMirrorKey(uid), words)
}

// 入力フィールドから完全な単語エントリを組み立てる（デフォルト値を補完）。
// 意味・品詞・例文は senses 配列（lib/senses.js の createSense を通すこと）に持つ。
export function createWordEntry(fields) {
  return {
    id: generateId(),
    word: '',
    phonetic: '',
    senses: [],
    addedAt: new Date().toISOString(),
    masteryLevel: 0,
    correctCount: 0,
    incorrectCount: 0,
    lastTestedAt: null,
    ...fields,
  }
}

// ---- テスト実施履歴（ストリーク・統計用） ----
// [{ date: ISO文字列, total: 出題数, correct: 正解数 }]

// 旧バージョン（Firestore 導入前）のデータ読み込み。初回移行専用。
export function loadLegacyTestSessions() {
  return loadJson(LEGACY_SESSIONS_KEY, [])
}

export function saveTestSessionsMirror(uid, sessions) {
  saveJson(sessionsMirrorKey(uid), sessions)
}
