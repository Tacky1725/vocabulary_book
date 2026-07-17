import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages で https://<ユーザー名>.github.io/<リポジトリ名>/ に公開する場合、
// base を '/<リポジトリ名>/' に合わせて変更してください。
// 例: リポジトリ名が vocabulary_book なら base: '/vocabulary_book/'
export default defineConfig({
  plugins: [react()],
  base: '/vocabulary_book/', // ← リポジトリ名に合わせて変更
})
