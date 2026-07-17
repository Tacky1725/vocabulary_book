// Firebase の初期化と認証まわり。
// firebaseConfig は秘密情報ではなく公開前提の識別子（GitHub にコミットしてよい）。
// アクセス制御はすべて Firestore セキュリティルール側で行う（リポジトリ直下の firestore.rules 参照）。
// Analytics は使わない（トラッキング不要・バンドルサイズ削減のため import しない）。

import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCAJGznV4OeMnQQkXXFH1ATcsailUMQNLc',
  authDomain: 'vocabulary-book-1725.firebaseapp.com',
  projectId: 'vocabulary-book-1725',
  storageBucket: 'vocabulary-book-1725.firebasestorage.app',
  messagingSenderId: '943441827745',
  appId: '1:943441827745:web:0dabdd61e6760224911de0',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

// オフラインでも全機能が動くよう IndexedDB 永続キャッシュを有効化する（複数タブ対応）。
// オフライン中の書き込みは SDK がキューに保持し、再接続時に自動送信される。
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

// 認証状態の購読。cb(user | null) が即時＋変化のたびに呼ばれる。戻り値は購読解除関数。
export function subscribeAuth(cb) {
  return onAuthStateChanged(auth, cb)
}

// GitHub Pages のようなサブパス配信ではリダイレクト方式が
// サードパーティストレージ制限で壊れやすいため、ポップアップ方式を使う。
// api.js と同じく throw せず { ok, error? } を返す契約。
export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider()
    // 共用端末での利用を想定し、毎回アカウント選択画面を出す
    provider.setCustomParameters({ prompt: 'select_account' })
    await signInWithPopup(auth, provider)
    return { ok: true }
  } catch (e) {
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
      return { ok: false, error: 'ログインがキャンセルされました' }
    }
    if (e?.code === 'auth/unauthorized-domain') {
      return {
        ok: false,
        error: 'このドメインは許可されていません（Firebase コンソールの承認済みドメインを確認してください）',
      }
    }
    if (e?.code === 'auth/network-request-failed') {
      return { ok: false, error: 'ネットワークに接続できません。オンラインで再度お試しください' }
    }
    console.error('ログインに失敗しました', e)
    return { ok: false, error: `ログインに失敗しました（${e?.code ?? '不明なエラー'}）` }
  }
}

export function logout() {
  return signOut(auth)
}
