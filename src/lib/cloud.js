// Firestore へのデータアクセス層（React 非依存）。
// データはすべて users/{uid} 配下に置き、セキュリティルールで所有者以外を遮断する。
//   users/{uid}/words/{wordId}     … 単語エントリ（1単語 = 1ドキュメント。競合解決は単語単位の後勝ち）
//   users/{uid}/meta/testSessions  … テスト実施履歴（{ sessions: [{date,total,correct}] } の1ドキュメント）
// 書き込み系は api.js と同じく throw せず { ok, error? } を返す契約。

import {
  arrayUnion,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { loadLegacyTestSessions, loadLegacyWords, normalizeWord } from './storage.js'

const wordsCol = (uid) => collection(db, 'users', uid, 'words')
const sessionsDoc = (uid) => doc(db, 'users', uid, 'meta', 'testSessions')
const settingsDoc = (uid) => doc(db, 'users', uid, 'meta', 'settings')

// Firestore のコレクションに固有の順序はないため、追加日時（同時刻は id）で表示順を安定させる。
// ISO 8601 文字列は辞書順比較で時系列順になる。
function sortWords(words) {
  return words.sort(
    (a, b) =>
      String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? '')) ||
      String(a.id).localeCompare(String(b.id))
  )
}

// 単語一覧の購読。オフライン時は IndexedDB キャッシュから配信される。戻り値は購読解除関数。
// 読み込み時に normalizeWord を通し、旧形式の変換と新フィールドのデフォルト補完を行う
// （ローカル state を埋めるだけで Firestore へは書き戻さない。README「共通の設計判断 B」）。
export function subscribeWords(uid, onChange, onError) {
  return onSnapshot(
    wordsCol(uid),
    (snap) => onChange(sortWords(snap.docs.map((d) => normalizeWord(d.data())))),
    (err) => {
      console.error('単語一覧の購読に失敗しました', err)
      onError?.(err)
    },
  )
}

// Firestore の 1 バッチ 500 操作制限に収まるよう分割してコミットする
const BATCH_LIMIT = 450

async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch)
    await batch.commit()
  }
}

// prev と next の差分だけを書き込む（追加/変更は set、消えた id は delete）。
// ページ側はイミュータブル更新なので、変更のないエントリは参照が同じ = 書き込み対象外になる。
export async function syncWordsDiff(uid, prev, next) {
  try {
    const prevById = new Map(prev.map((w) => [w.id, w]))
    const nextIds = new Set(next.map((w) => w.id))
    const ops = []
    for (const w of next) {
      if (prevById.get(w.id) !== w) ops.push((b) => b.set(doc(wordsCol(uid), w.id), w))
    }
    for (const w of prev) {
      if (!nextIds.has(w.id)) ops.push((b) => b.delete(doc(wordsCol(uid), w.id)))
    }
    if (ops.length > 0) await commitOps(ops)
    return { ok: true }
  } catch (e) {
    console.error('Firestore への保存に失敗しました', e)
    return { ok: false, error: '保存に失敗しました' }
  }
}

// テスト実施履歴の購読。戻り値は購読解除関数。
export function subscribeTestSessions(uid, onChange, onError) {
  return onSnapshot(
    sessionsDoc(uid),
    (snap) => {
      const data = snap.data()
      onChange(Array.isArray(data?.sessions) ? data.sessions : [])
    },
    (err) => {
      console.error('テスト履歴の購読に失敗しました', err)
      onError?.(err)
    },
  )
}

export async function recordTestSession(uid, { total, correct }) {
  try {
    await setDoc(
      sessionsDoc(uid),
      { sessions: arrayUnion({ date: new Date().toISOString(), total, correct }) },
      { merge: true }
    )
    return { ok: true }
  } catch (e) {
    console.error('テスト履歴の保存に失敗しました', e)
    return { ok: false, error: 'テスト履歴の保存に失敗しました' }
  }
}

// ---- ユーザー設定（meta/settings） ----
// デイリーゴール等のユーザー設定を置く単一ドキュメント（README「共通の設計判断 A」）。
// meta サブコレクション配下なので既存ルール（users/{uid}/{document=**}）がカバーし、
// セキュリティルールの変更は不要。各機能が必要なキーを merge で足していく。

// 設定ドキュメントの購読。未作成なら {} を配信する。戻り値は購読解除関数。
export function subscribeSettings(uid, onChange, onError) {
  return onSnapshot(
    settingsDoc(uid),
    (snap) => onChange(snap.data() ?? {}),
    (err) => {
      console.error('設定の購読に失敗しました', err)
      onError?.(err)
    },
  )
}

// 設定の部分更新。merge: true でドキュメント全体を上書きせず patch したキーだけ差し替える
// （他機能が同じ settings ドキュメントにキーを足す前提。丸ごと上書きしないこと）。
export async function saveSettings(uid, patch) {
  try {
    await setDoc(settingsDoc(uid), patch, { merge: true })
    return { ok: true }
  } catch (e) {
    console.error('設定の保存に失敗しました', e)
    return { ok: false, error: '設定の保存に失敗しました' }
  }
}

// ---- 初回チェックと移行 ----
// アカウント×端末ごとの初回ログイン時に、サーバーへの疎通確認（許可リスト外なら
// ここで permission-denied になる）と、旧バージョン localStorage データの移行を行う。
//
// 旧データの移行は「この端末につき1回だけ・クラウドが空のときだけ」実施する。
// 複数人利用の端末では最初にログインした人のアカウントへ取り込まれるため、
// 旧データが残っている端末では必ずデータの持ち主が最初にログインすること。
// localStorage 側のデータは削除せずバックアップとして残す。
//
// 「クラウドが空かどうか」の判定はサーバーへの問い合わせ（*FromServer）で行う。
// キャッシュ判定にすると、オフライン時に空キャッシュを「クラウドが空」と誤認して
// 二重移行や取りこぼしが起きるため。オフラインで判定できなかった場合は
// { ok: false } を返し、呼び出し側（useAuth）がアプリの利用開始をブロックして再試行を促す。

const LEGACY_MIGRATED_KEY = 'vocab-app:cloud-migrated' // 端末単位: この端末の旧データは移行済み
const checkedKey = (uid) => `vocab-app:cloud-migrated:${uid}` // アカウント×端末単位: 初回チェック済み

export async function migrateLocalDataIfNeeded(uid) {
  try {
    if (localStorage.getItem(checkedKey(uid))) return { ok: true }
  } catch {
    return { ok: true }
  }
  try {
    const [wordsSnap, sessionsSnap] = await Promise.all([
      getDocsFromServer(wordsCol(uid)),
      getDocFromServer(sessionsDoc(uid)),
    ])
    if (!localStorage.getItem(LEGACY_MIGRATED_KEY)) {
      if (wordsSnap.empty) {
        const legacyWords = loadLegacyWords()
        if (legacyWords.length > 0) {
          await commitOps(legacyWords.map((w) => (b) => b.set(doc(wordsCol(uid), w.id), w)))
        }
      }
      if (!sessionsSnap.exists()) {
        const legacySessions = loadLegacyTestSessions()
        if (legacySessions.length > 0) {
          await setDoc(sessionsDoc(uid), { sessions: legacySessions })
        }
      }
      localStorage.setItem(LEGACY_MIGRATED_KEY, new Date().toISOString())
    }
    localStorage.setItem(checkedKey(uid), new Date().toISOString())
    return { ok: true }
  } catch (e) {
    console.error('初回チェック・データ移行に失敗しました', e)
    // code 例: 'permission-denied'（許可リスト外・ルール不一致） / 'unavailable'（オフライン・接続不可）
    return { ok: false, error: e?.code ?? e?.message ?? '不明なエラー' }
  }
}
