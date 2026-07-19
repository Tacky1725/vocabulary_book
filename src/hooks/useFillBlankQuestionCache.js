import { useEffect, useMemo, useState } from 'react'
import {
  buildFillBlankQuestionData,
  getFillBlankSourceFingerprint,
  hydrateFillBlankQuestion,
} from '../lib/quiz.js'

const MAX_WORK_MS = 8
const cachesByScope = new Map()

function getCache(scope) {
  if (!cachesByScope.has(scope)) cachesByScope.set(scope, new Map())
  return cachesByScope.get(scope)
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

// requestIdleCallback 非対応のブラウザでも、setTimeout で小さな処理単位に分ける。
function requestIdleWork(callback) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 100 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(
    () => callback({ didTimeout: false, timeRemaining: () => MAX_WORK_MS }),
    0,
  )
  return () => clearTimeout(id)
}

// 例文穴埋めの派生データをメモリ上で保持する。
// キャッシュは問題を構成する入力だけで無効化し、学習履歴などの更新では再利用する。
export function useFillBlankQuestionCache(words, userId, isWordsLoading = false) {
  // 画面を離れて戻っても再利用できるが、別ユーザーのキャッシュとは混在させない。
  const cacheScope = userId ?? 'anonymous'
  const cache = useMemo(() => getCache(cacheScope), [cacheScope])
  const [generationVersion, setGenerationVersion] = useState(0)

  useEffect(() => {
    // useWords は購読結果が届くまで一時的に [] を返す。
    // この段階で削除済みと判断すると、画面遷移で既存キャッシュを全消去してしまう。
    if (isWordsLoading) return undefined

    const currentIds = new Set(words.map((word) => word.id))
    for (const id of cache.keys()) {
      if (!currentIds.has(id)) cache.delete(id)
    }

    const pending = []
    for (const word of words) {
      const fingerprint = getFillBlankSourceFingerprint(word)
      if (cache.get(word.id)?.fingerprint !== fingerprint) {
        pending.push({ word, fingerprint })
      }
    }

    if (pending.length === 0) {
      return undefined
    }

    let cancelled = false
    let cancelIdleWork = null
    let cursor = 0

    const process = (deadline) => {
      if (cancelled) return
      const startedAt = now()
      let processed = 0
      do {
        const { word, fingerprint } = pending[cursor]
        cache.set(word.id, {
          fingerprint,
          data: buildFillBlankQuestionData(word),
        })
        cursor += 1
        processed += 1
      } while (
        cursor < pending.length &&
        now() - startedAt < MAX_WORK_MS &&
        (deadline.didTimeout || deadline.timeRemaining() > 1 || processed === 0)
      )

      if (cursor < pending.length) {
        cancelIdleWork = requestIdleWork(process)
      } else {
        // 全件の生成が終わった時点だけ描画を更新する。
        setGenerationVersion((version) => version + 1)
      }
    }

    cancelIdleWork = requestIdleWork(process)
    return () => {
      cancelled = true
      cancelIdleWork?.()
    }
  }, [cache, isWordsLoading, words])

  const questionsByWordId = useMemo(() => {
    const questions = new Map()
    for (const word of words) {
      const cached = cache.get(word.id)
      if (cached?.fingerprint !== getFillBlankSourceFingerprint(word) || !cached.data) continue
      questions.set(word.id, hydrateFillBlankQuestion(cached.data, word))
    }
    return questions
  }, [cache, words, generationVersion])

  // effect が走る前の最初の描画でも、生成待ちを正しく伝える。
  const isGenerating = useMemo(
    () =>
      !isWordsLoading &&
      words.some(
        (word) =>
          cache.get(word.id)?.fingerprint !== getFillBlankSourceFingerprint(word),
      ),
    [cache, isWordsLoading, words, generationVersion],
  )

  return {
    questionsByWordId,
    isGenerating,
  }
}
