# 英単語帳アプリ

自分専用の英単語帳を作り、辞書APIで単語を追加し、4択クイズでテストし、学習の継続状況を記録できるアプリです。データは Google ログイン後に Firebase Firestore へ保存され、複数端末で同期されます（自前サーバーなし。オフラインでも全機能が動作し、再接続時に自動同期）。利用はメールアドレス許可制で、複数人が同じ端末を使っても単語帳はアカウントごとに独立しています。

## 機能

- **単語追加** (`/add`): 辞書API（[dictionaryapi.dev](https://dictionaryapi.dev/)）で発音記号・品詞・英語定義・例文を、翻訳API（[MyMemory](https://mymemory.translated.net/)）で日本語訳を自動取得。CSVからの一括インポートも可能
- **単語テスト** (`/test`): 登録した単語からランダム出題の4択クイズ。正解/不正解で習熟度（0〜5）が上下
- **ダッシュボード** (`/`): 連続学習日数（ストリーク）、習熟度分布、正答率などを表示
- **単語一覧** (`/words`): 検索・並び替え・編集・削除、CSVエクスポート（バックアップ用）

## 開発

```bash
npm install
npm run dev      # 開発サーバー起動
npm run build    # 本番ビルド（dist/ に出力）
npm run preview  # ビルド結果のプレビュー
```

Node.js 18 以上が必要です。

## CSVフォーマット

インポート／エクスポート共通で、ヘッダー付きの以下の形式です（列の順序は任意、存在しない列は空欄扱い）。

```csv
word,meaningEn,meaningJa,phonetic,partOfSpeech,example
bank,a financial institution,銀行,/bæŋk/,noun,I went to the bank.
bank,the land alongside a river,土手,/bæŋk/,noun,We walked along the bank.
```

**1行 = 1語義**です。同じ `word` の行はインポート時に1つの単語（複数語義）としてまとめて登録され、エクスポート時は語義ごとに行が展開されます。1単語1行の従来形式のCSVもそのまま読み込めます。

## GitHub Pages へのデプロイ手順

`main` ブランチへの push で GitHub Actions（[.github/workflows/deploy.yml](.github/workflows/deploy.yml)）が自動的にビルドして GitHub Pages にデプロイします。初回は以下の設定が必要です。

1. **`vite.config.js` の `base` をリポジトリ名に合わせる**

   `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されるため、`base: '/<リポジトリ名>/'` に変更してください（現在はこのリポジトリ名に合わせて `/vocabulary_book/` になっています）。

2. **GitHubリポジトリを作成して push**

   ```bash
   git remote add origin git@github.com:<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```

3. **Pages のソースを GitHub Actions に設定**

   リポジトリの **Settings → Pages → Build and deployment → Source** を **「GitHub Actions」** に変更します（デフォルトの「Deploy from a branch」のままだとワークフローのデプロイが反映されません）。

4. push すると Actions タブでワークフローが実行され、完了後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます。

※ ルーティングには HashRouter を使用しているため、GitHub Pages のサブパス配信でもリロード時に404になりません。

## Firebase（同期バックエンド）のセットアップ

データの正本は Firebase Firestore（無料 Spark プラン）に保存します。初回のみ以下の設定が必要です。

1. **プロジェクト作成**: [Firebase コンソール](https://console.firebase.google.com)でプロジェクトを作成（Analytics 不要）
2. **Google ログインを有効化**: Authentication → Sign-in method → Google を有効化
3. **Firestore を作成**: データベース ID は `(default)` のまま（無料枠は `(default)` のみ）、ロケーションは `asia-northeast1`/`asia-northeast2`、**Native モード・本番モード（全拒否）で開始**
4. **設定値を反映**: プロジェクト設定 → ウェブアプリを追加し、`firebaseConfig` の値を [src/lib/firebase.js](src/lib/firebase.js) に記載（このキーは公開識別子でありコミットしてよい。防御はセキュリティルールが担う）
5. **セキュリティルールを公開**: Firestore Database → ルール に [firestore.rules](firestore.rules) の内容を貼り付けて公開する。利用を許可する Google アカウントのメールアドレスを `allowedEmails` に列挙する（利用者を追加するときはここに1行足して再公開するだけ。ローカルの firestore.rules も同期して更新しておくこと）
6. **承認済みドメインの限定**: Authentication → Settings → 承認済みドメインを `localhost` と `<ユーザー名>.github.io` のみにする（`firebaseapp.com` / `web.app` の行は削除してよい）
7. **APIキーの利用元制限（多層防御・任意）**: [Google Cloud コンソール → 認証情報](https://console.cloud.google.com/apis/credentials) → Browser key → アプリケーションの制限で「ウェブサイト」を選び、`https://<ユーザー名>.github.io/*` と `http://localhost:*` を登録

## データの保存先

正本は Firestore の `users/{uid}` 配下に、ログインした Google アカウントごとに独立して保存されます。

| 場所 | 内容 |
| --- | --- |
| `users/{uid}/words/{wordId}` | 単語エントリ（1単語 = 1ドキュメント） |
| `users/{uid}/meta/testSessions` | テスト実施履歴（ストリーク・統計算出用） |

localStorage（`vocab-app:words:{uid}` / `vocab-app:test-sessions:{uid}`）には Firestore の内容が常時ミラーされ、クラウド障害時のローカルバックアップとして機能します。旧バージョン（localStorage のみ、uid なしキー）のデータは、その端末での最初のログイン時に自動で Firestore へ移行されます（**旧データが残っている端末では、データの持ち主が最初にログインしてください**）。単語一覧画面のCSVエクスポートによるバックアップも引き続き利用できます。
