// 切磋琢磨機能（ランキング・週間チャレンジ・応援）のFirestoreアクセス層。
// users/{uid} 本体とは別の公開データ（publicProfiles・leaderboardDaily）と、
// 受信者限定の users/{uid}/cheers を扱う。パスと検証は firestore.rules と対応させること。
// api.js・cloud.js と同じく throw せず { ok, error? } を返す契約。

import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase.js'
import { CHEER_REACTIONS, toJstDateKey } from './socialStats.js'

const CHEER_TYPE_IDS = new Set(CHEER_REACTIONS.map((r) => r.id))

const publicProfileDoc = (uid) => doc(db, 'publicProfiles', uid)
const dailyEntriesCol = (jstDate) => collection(db, 'leaderboardDaily', jstDate, 'entries')
const dailyEntryDoc = (jstDate, uid) => doc(db, 'leaderboardDaily', jstDate, 'entries', uid)
const cheersCol = (uid) => collection(db, 'users', uid, 'cheers')

// 自分の公開プロフィール（表示名・アイコン）を購読する。未設定なら null を配信する
// （初回設定モーダルの表示要否の判定に使う）。戻り値は購読解除関数。
export function subscribePublicProfile(uid, onChange, onError) {
  return onSnapshot(
    publicProfileDoc(uid),
    (snap) => onChange(snap.data() ?? null),
    (err) => {
      console.error('公開プロフィールの購読に失敗しました', err)
      onError?.(err)
    }
  )
}

// 他ユーザーの公開プロフィールを1回だけ取得する（届いた応援の送信元表示名解決など）。
// リアルタイム性は不要なため購読ではなく単発取得にする。
export async function getPublicProfile(uid) {
  try {
    const snap = await getDoc(publicProfileDoc(uid))
    return { ok: true, data: snap.data() ?? null }
  } catch (e) {
    console.error('公開プロフィールの取得に失敗しました', e)
    return { ok: false, error: '公開プロフィールの取得に失敗しました' }
  }
}

// ランキング参加用の表示名・アイコンを保存する。
export async function savePublicProfile(uid, { displayName, photoURL }) {
  try {
    await setDoc(
      publicProfileDoc(uid),
      { displayName, photoURL: photoURL ?? '', updatedAt: serverTimestamp() },
      { merge: true }
    )
    return { ok: true }
  } catch (e) {
    console.error('公開プロフィールの保存に失敗しました', e)
    return { ok: false, error: '公開プロフィールの保存に失敗しました' }
  }
}

// 当日エントリの作成/更新。未学習ユーザーもランキングに0件表示するため、
// ログイン成立時に1回呼ぶ（streak には calcStreakFromSessions 等で計算した実値を渡す）。
// questionCount は increment(0) にして、ドキュメント未作成時だけ0初期化し既存の値は壊さない
// （rules が create 時に questionCount is int を要求するため、フィールド自体は常に必要）。
export async function ensureDailyEntry(uid, { displayName, photoURL, streak }) {
  if (!displayName) return { ok: false, error: '表示名が未設定です' }
  try {
    const jstDate = toJstDateKey(new Date())
    await setDoc(
      dailyEntryDoc(jstDate, uid),
      {
        uid,
        questionCount: increment(0),
        streak,
        displayName,
        photoURL: photoURL ?? '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    return { ok: true }
  } catch (e) {
    console.error('当日エントリの作成・更新に失敗しました', e)
    return { ok: false, error: '当日エントリの作成・更新に失敗しました' }
  }
}

// 回答確定のたびに呼ぶ（fire-and-forget。オフライン時はSDKがキューし再接続時に送信）。
// streak の実値管理は ensureDailyEntry 側の責務なので、ここでは increment(0) で
// 未作成時の型検証だけ満たし、既存の streak 値には触れない。
export async function recordLeaderboardAnswer(uid, { displayName, photoURL }) {
  if (!displayName) return { ok: false, error: '表示名が未設定です' }
  try {
    const jstDate = toJstDateKey(new Date())
    await setDoc(
      dailyEntryDoc(jstDate, uid),
      {
        uid,
        questionCount: increment(1),
        streak: increment(0),
        displayName,
        photoURL: photoURL ?? '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    return { ok: true }
  } catch (e) {
    console.error('ランキング集計の更新に失敗しました', e)
    return { ok: false, error: 'ランキング集計の更新に失敗しました' }
  }
}

// 指定日(JST基準の 'YYYY-MM-DD')の日次ランキングエントリ一覧を購読する。戻り値は購読解除関数。
// Weekly集計は呼び出し側が対象週7日分をそれぞれ購読して合算する（README参照）。
export function subscribeDailyLeaderboard(jstDate, onChange, onError) {
  return onSnapshot(
    dailyEntriesCol(jstDate),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    (err) => {
      console.error('ランキングの購読に失敗しました', err)
      onError?.(err)
    }
  )
}

// 自分宛ての応援を新しい順に購読する。戻り値は購読解除関数。
export function subscribeCheers(uid, onChange, onError) {
  return onSnapshot(
    query(cheersCol(uid), orderBy('createdAt', 'desc')),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error('応援の購読に失敗しました', err)
      onError?.(err)
    }
  )
}

// 定型リアクションを送る。自分自身への送信はここでも拒否する（rulesと二重にガード）。
export async function sendCheer({ recipientUid, type }) {
  const senderUid = auth.currentUser?.uid
  if (!senderUid) return { ok: false, error: 'ログインしていません' }
  if (senderUid === recipientUid) return { ok: false, error: '自分自身には応援を送れません' }
  if (!CHEER_TYPE_IDS.has(type)) return { ok: false, error: '不正な応援の種類です' }
  try {
    await addDoc(cheersCol(recipientUid), {
      senderUid,
      type,
      createdAt: serverTimestamp(),
    })
    return { ok: true }
  } catch (e) {
    console.error('応援の送信に失敗しました', e)
    return { ok: false, error: '応援の送信に失敗しました' }
  }
}
