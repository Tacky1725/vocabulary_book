// 出題ロジック。出題モードごとの単語選択を関数として分離してあり、
// 新しいモードは QUESTION_PICKERS にエントリを追加するだけで拡張できる。
import { joinedMeaningJa, hasMeaningJa } from './senses.js'
import { compareDueWords, isDue } from './srs.js'

export const MIN_WORDS_FOR_TEST = 4

// 問題形式。出題範囲（ランダム・復習・ニガテ等）とは分離して管理する。
// 新しい形式を追加する場合は、問題生成と回答判定をこのファイルへ追加する。
export const QUESTION_TYPES = {
  MEANING_CHOICE: 'meaning-choice',
  MEANING_TO_WORD: 'meaning-to-word',
  FILL_BLANK: 'fill-blank',
}

export const QUESTION_FORMATS = [
  { type: QUESTION_TYPES.MEANING_CHOICE, label: '英語→日本語', available: true },
  { type: QUESTION_TYPES.MEANING_TO_WORD, label: '日本語→英語', available: true },
  { type: QUESTION_TYPES.FILL_BLANK, label: '例文の穴埋め', available: true },
]

// 出題モード定義。available: false のものはUI上で「準備中」として無効表示する。
export const QUIZ_MODES = [
  { id: 'random', label: 'ランダム', available: true },
  { id: 'recent', label: '直近に追加した語', available: true },
  { id: 'unlearned', label: '未出題の語（まだ出題していない語）', available: true },
  { id: 'weak', label: 'ニガテ克服（正答率が低い語を優先）', available: true },
  { id: 'review', label: '今日の復習（復習期限が来た語）', available: true },
]

function shuffle(array) {
  const a = [...array]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 試行回数（正答+誤答）。未出題の判定と正答率の分母に使う。
function attempts(w) {
  return (w.correctCount ?? 0) + (w.incorrectCount ?? 0)
}

// 正答率。未出題(試行0)は「ニガテと断定できない」ため Infinity で最後尾へ回す。
function accuracy(w) {
  const total = attempts(w)
  return total === 0 ? Infinity : (w.correctCount ?? 0) / total
}

// ニガテ度の比較: 正答率が低い順。同率なら誤答数が多い方を優先する（説明可能な単純指標）。
function byWeakness(a, b) {
  return accuracy(a) - accuracy(b) || (b.incorrectCount ?? 0) - (a.incorrectCount ?? 0)
}

// モードID → 出題する単語を選ぶ関数（(words, count) => 出題順の配列）。
// いずれもイミュータブル（元配列を破壊しない）。新モードはここにエントリを足すだけ。
const QUESTION_PICKERS = {
  random: (words, count) => shuffle(words).slice(0, count),
  // 追加日の新しい順。addedAt は ISO 文字列なので辞書順比較で時系列順になる（cloud.js の sortWords と同じ発想）。
  recent: (words, count) =>
    [...words]
      .sort((a, b) => String(b.addedAt ?? '').localeCompare(String(a.addedAt ?? '')))
      .slice(0, count),
  // 未出題のみ: まだ一度も出題されていない語(試行0)だけを、追加が古い順（積み残しの消化）に出す。
  // 対象を絞るため件数が count / MIN_WORDS_FOR_TEST に満たないことがある（開始判定は TestPage 側）。
  unlearned: (words, count) =>
    [...words]
      .filter((w) => attempts(w) === 0)
      .sort((a, b) => String(a.addedAt ?? '').localeCompare(String(b.addedAt ?? '')))
      .slice(0, count),
  // ニガテ優先: 正答率の低い順（byWeakness）。未出題は accuracy=Infinity で最後尾。
  // 未出題を優先的に出したいニーズは unlearned モードでカバーする。
  weak: (words, count) => [...words].sort(byWeakness).slice(0, count),
  // 今日の復習: 期限到来語だけを期限の早い順に出す。未学習語は未出題モードで扱う。
  review: (words, count) => [...words].filter((w) => isDue(w)).sort(compareDueWords).slice(0, count),
}

// 出題対象の単語リストを選ぶ。count が null/undefined なら全問。
export function pickQuestionWords(words, count, mode = 'random') {
  const picker = QUESTION_PICKERS[mode] ?? QUESTION_PICKERS.random
  const n = count == null ? words.length : Math.min(count, words.length)
  return picker(words, n)
}

// 問題形式ごとの出題対象を判定する。穴埋めはキャッシュ未使用時の互換用に
// ここで生成する。画面では useFillBlankQuestionCache を使い、毎回の再生成を避ける。
export function isWordEligibleForQuestion(word, type = QUESTION_TYPES.MEANING_CHOICE) {
  if (type === QUESTION_TYPES.FILL_BLANK) return buildFillBlankQuestion(word) !== null
  if (!hasMeaningJa(word)) return false
  if (type === QUESTION_TYPES.MEANING_TO_WORD) {
    return String(word.word ?? '').trim() !== ''
  }
  return true
}

function normalizedEnglishWord(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

// 入力された回答は、表示上の大文字小文字・全半角・余分な空白を吸収して比較する。
// ハイフンやアポストロフィなど、単語そのものに含まれる記号は削除しない。
export function normalizeTypedAnswer(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function isTypedAnswerCorrect(input, answer) {
  const normalizedInput = normalizeTypedAnswer(input)
  return normalizedInput !== '' && normalizedInput === normalizeTypedAnswer(answer)
}

function alphanumericCharacters(value) {
  return String(value ?? '').normalize('NFKC').match(/[A-Za-z0-9]/g) ?? []
}

// 穴埋めでは各語の先頭文字を問題文に表示するため、入力対象は各語の2文字目以降だけ。
function fillBlankExpectedCharacters(answer) {
  return String(answer ?? '')
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .flatMap((segment) => alphanumericCharacters(segment).slice(1))
}

export function isFillBlankTypedAnswerCorrect(input, answer) {
  const typed = alphanumericCharacters(input).join('').toLowerCase()
  const expected = fillBlankExpectedCharacters(answer).join('').toLowerCase()
  return typed === expected
}

// 例文中の穴埋め表示と回答ボタンの有効／無効に使う、入力途中の検証結果。
// 文字数は既存仕様どおり英字・数字だけを数える。
export function getFillBlankInputValidation(input, answer) {
  const typedCharacters = alphanumericCharacters(input)
  const expectedCharacters = fillBlankExpectedCharacters(answer)
  return {
    typedCharacters,
    expectedLength: expectedCharacters.length,
    isTooLong: typedCharacters.length > expectedCharacters.length,
  }
}

// 回答後の表示用に、入力を省略していた各語の先頭文字を補う。
// 途中までの入力・超過入力もそのまま確認できるよう、未入力部分の _ は補わない。
export function completeFillBlankAnswer(input, answer) {
  const typedCharacters = alphanumericCharacters(input)
  let expectedIndex = 0
  const completed = String(answer ?? '')
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .map((segment) => {
      const characters = alphanumericCharacters(segment)
      if (characters.length === 0) return ''
      const remaining = characters.slice(1).map(() => typedCharacters[expectedIndex++] ?? '').join('')
      return `${characters[0]}${remaining}`
    })
    .join(' ')

  return `${completed}${typedCharacters.slice(expectedIndex).join('')}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizePartOfSpeech(value) {
  return String(value ?? '').trim().toLowerCase()
}

function regularPluralForms(word) {
  const forms = new Map()
  const add = (surface, inflection = 'plural') => forms.set(surface, inflection)
  if (/(?:s|x|z|ch|sh)$/i.test(word)) add(`${word}es`)
  else if (/[^aeiou]y$/i.test(word)) add(`${word.slice(0, -1)}ies`)
  else add(`${word}s`)
  // knife -> knives のような代表的な変化も候補にする。例文に実際に現れるものだけ採用する。
  if (/fe$/i.test(word)) add(`${word.slice(0, -2)}ves`)
  else if (/f$/i.test(word)) add(`${word.slice(0, -1)}ves`)
  return forms
}

function regularVerbForms(word) {
  const forms = new Map()
  const add = (surface, inflection) => forms.set(surface, inflection)
  if (/(?:s|x|z|ch|sh|o)$/i.test(word)) add(`${word}es`, 'thirdPerson')
  else if (/[^aeiou]y$/i.test(word)) add(`${word.slice(0, -1)}ies`, 'thirdPerson')
  else add(`${word}s`, 'thirdPerson')

  if (/e$/i.test(word)) {
    add(`${word}d`, 'past')
    add(`${word.slice(0, -1)}ing`, 'gerund')
  } else if (/[^aeiou]y$/i.test(word)) {
    add(`${word.slice(0, -1)}ied`, 'past')
    add(`${word}ing`, 'gerund')
  } else if (/ie$/i.test(word)) {
    add(`${word}d`, 'past')
    add(`${word.slice(0, -2)}ying`, 'gerund')
  } else {
    add(`${word}ed`, 'past')
    add(`${word}ing`, 'gerund')
  }

  // stop -> stopped / stopping のような短いCVC語を補う。規則形も残すため、
  // 例文に実際にある表記だけが最終的な候補になる。
  if (/[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]$/i.test(word) && !/[wxy]$/i.test(word)) {
    const last = word.at(-1)
    add(`${word}${last}ed`, 'past')
    add(`${word}${last}ing`, 'gerund')
  }
  return forms
}

const IRREGULAR_NOUN_FORMS = {
  analysis: ['analyses'],
  child: ['children'],
  criterion: ['criteria'],
  foot: ['feet'],
  goose: ['geese'],
  man: ['men'],
  mouse: ['mice'],
  person: ['people'],
  phenomenon: ['phenomena'],
  tooth: ['teeth'],
  woman: ['women'],
}

// 代表的な不規則動詞。外部APIに依存せず、例文の表層形を検出するためだけに使う。
// 正解値は常に例文から抜き出した文字列であり、この表の値そのものを表示しない。
const IRREGULAR_VERB_FORMS = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  become: ['became', 'become', 'becoming', 'becomes'],
  begin: ['began', 'begun', 'begins', 'beginning'],
  break: ['broke', 'broken', 'breaks', 'breaking'],
  bring: ['brought', 'brings', 'bringing'],
  build: ['built', 'builds', 'building'],
  buy: ['bought', 'buys', 'buying'],
  catch: ['caught', 'catches', 'catching'],
  choose: ['chose', 'chosen', 'chooses', 'choosing'],
  come: ['came', 'comes', 'coming'],
  cost: ['costs', 'costing'],
  cut: ['cuts', 'cutting'],
  do: ['does', 'did', 'done', 'doing'],
  draw: ['drew', 'drawn', 'draws', 'drawing'],
  drink: ['drank', 'drunk', 'drinks', 'drinking'],
  drive: ['drove', 'driven', 'drives', 'driving'],
  eat: ['ate', 'eaten', 'eats', 'eating'],
  fall: ['fell', 'fallen', 'falls', 'falling'],
  feel: ['felt', 'feels', 'feeling'],
  find: ['found', 'finds', 'finding'],
  fly: ['flew', 'flown', 'flies', 'flying'],
  forget: ['forgot', 'forgotten', 'forgets', 'forgetting'],
  get: ['got', 'gotten', 'gets', 'getting'],
  give: ['gave', 'given', 'gives', 'giving'],
  go: ['goes', 'went', 'gone', 'going'],
  have: ['has', 'had', 'having'],
  hear: ['heard', 'hears', 'hearing'],
  keep: ['kept', 'keeps', 'keeping'],
  know: ['knew', 'known', 'knows', 'knowing'],
  leave: ['left', 'leaves', 'leaving'],
  lose: ['lost', 'loses', 'losing'],
  make: ['made', 'makes', 'making'],
  meet: ['met', 'meets', 'meeting'],
  pay: ['paid', 'pays', 'paying'],
  put: ['puts', 'putting'],
  read: ['reads', 'reading'],
  ride: ['rode', 'ridden', 'rides', 'riding'],
  run: ['ran', 'runs', 'running'],
  say: ['said', 'says', 'saying'],
  see: ['saw', 'seen', 'sees', 'seeing'],
  sell: ['sold', 'sells', 'selling'],
  send: ['sent', 'sends', 'sending'],
  sing: ['sang', 'sung', 'sings', 'singing'],
  sit: ['sat', 'sits', 'sitting'],
  speak: ['spoke', 'spoken', 'speaks', 'speaking'],
  spend: ['spent', 'spends', 'spending'],
  stand: ['stood', 'stands', 'standing'],
  swim: ['swam', 'swum', 'swims', 'swimming'],
  take: ['took', 'taken', 'takes', 'taking'],
  teach: ['taught', 'teaches', 'teaching'],
  tell: ['told', 'tells', 'telling'],
  think: ['thought', 'thinks', 'thinking'],
  understand: ['understood', 'understands', 'understanding'],
  wear: ['wore', 'worn', 'wears', 'wearing'],
  win: ['won', 'wins', 'winning'],
  write: ['wrote', 'written', 'writes', 'writing'],
}

function addForm(forms, surface, inflection) {
  const normalized = normalizedEnglishWord(surface)
  if (normalized) forms.set(normalized, inflection)
}

function getHeadwordForms(headword, partOfSpeech) {
  const normalizedHeadword = normalizedEnglishWord(headword)
  if (!normalizedHeadword) return new Map()
  const [head, ...tail] = normalizedHeadword.split(' ')
  const suffix = tail.length > 0 ? ` ${tail.join(' ')}` : ''
  const forms = new Map()
  addForm(forms, normalizedHeadword, 'base')

  const pos = normalizePartOfSpeech(partOfSpeech)
  const includeVerb = pos === '' || pos.includes('verb')
  const includeNoun = pos === '' || pos.includes('noun')
  if (includeNoun) {
    for (const [surface, inflection] of regularPluralForms(head)) {
      addForm(forms, `${surface}${suffix}`, inflection)
    }
    for (const surface of IRREGULAR_NOUN_FORMS[head] ?? []) {
      addForm(forms, `${surface}${suffix}`, 'plural')
    }
  }
  if (includeVerb) {
    for (const [surface, inflection] of regularVerbForms(head)) {
      addForm(forms, `${surface}${suffix}`, inflection)
    }
    for (const surface of IRREGULAR_VERB_FORMS[head] ?? []) {
      addForm(forms, `${surface}${suffix}`, 'irregular')
    }
  }
  return forms
}

function findHeadwordMatches(example, forms) {
  const matches = []
  for (const [surface, inflection] of forms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(surface)}(?![\\p{L}\\p{N}])`, 'giu')
    for (const match of example.matchAll(pattern)) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        surface: match[0],
        normalizedSurface: normalizedEnglishWord(match[0]),
        inflection,
      })
    }
  }
  return matches
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter((match, index, all) => index === 0 || match.start >= all[index - 1].end)
}

function buildBlankText(surface) {
  return String(surface)
    .trim()
    .split(/\s+/)
    .map((segment) => {
      const characters = segment.match(/[A-Za-z0-9]/g) ?? []
      const initial = characters.find((character) => /[A-Za-z]/.test(character))
      if (!initial) return '_'.repeat(Math.max(1, characters.length))
      return `${initial}${'_'.repeat(Math.max(0, characters.length - 1))}`
    })
    .join(' ')
}

// 穴埋め生成結果に影響するフィールドだけでキャッシュキーを作る。
// 日本語訳・タグ・学習履歴が変わっても例文問題の再計算は不要。
export function getFillBlankSourceFingerprint(word) {
  return JSON.stringify([
    String(word?.word ?? ''),
    (word?.senses ?? []).map((sense) => [
      String(sense?.partOfSpeech ?? ''),
      String(sense?.example ?? ''),
    ]),
  ])
}

// 既存の語義例文だけから穴埋め問題の派生データを作る。例文に同じ見出し語の
// 異なる活用形が混在すると単一入力の正解が一意にならないため、その例文はスキップする。
// word 自体はキャッシュせず、出題時に最新の単語データを結び付ける。
export function buildFillBlankQuestionData(word) {
  const headword = String(word?.word ?? '').trim()
  if (!headword) return null
  for (let senseIndex = 0; senseIndex < (word?.senses?.length ?? 0); senseIndex += 1) {
    const sense = word.senses[senseIndex]
    const example = String(sense?.example ?? '').trim()
    if (!example) continue
    const matches = findHeadwordMatches(example, getHeadwordForms(headword, sense?.partOfSpeech))
    if (matches.length === 0) continue
    const surfaces = new Set(matches.map((match) => match.normalizedSurface))
    if (surfaces.size !== 1) continue

    const answer = matches[0].surface
    let prompt = example
    for (const match of [...matches].reverse()) {
      prompt = `${prompt.slice(0, match.start)}${buildBlankText(match.surface)}${prompt.slice(match.end)}`
    }
    return {
      type: QUESTION_TYPES.FILL_BLANK,
      answerMode: 'text',
      prompt,
      answer,
      example,
      blanks: matches.map(({ start, end, surface }) => ({ start, end, surface })),
      match: {
        headword,
        surface: answer,
        inflection: matches[0].inflection,
        senseIndex,
      },
      choices: [],
      noneIsCorrect: false,
    }
  }
  return null
}

export function hydrateFillBlankQuestion(data, word) {
  return data ? { ...data, word } : null
}

export function buildFillBlankQuestion(word) {
  return hydrateFillBlankQuestion(buildFillBlankQuestionData(word), word)
}

// 選択肢の表示文字列を共通化する。meaningJa は既存コード・保存済み問題との
// 互換用に残し、新しい問題は text を正本として持つ。
export function getChoiceText(choice) {
  return choice?.text ?? choice?.meaningJa ?? ''
}

// 問題形式に依存しない回答判定の入口。
// 現在は選択式の英語→日本語・日本語→英語に対応し、穴埋めは後から拡張する。
export function isQuestionAnswerCorrect(question, answer) {
  const answerKind = typeof answer === 'object' && answer !== null ? answer.kind : answer
  if (answerKind === 'none') return question.noneIsCorrect === true
  if (answerKind === 'unknown') return false
  if (question.type === QUESTION_TYPES.FILL_BLANK) {
    return answerKind === 'typed' && isFillBlankTypedAnswerCorrect(answer.value, question.answer)
  }
  if (
    question.type &&
    ![QUESTION_TYPES.MEANING_CHOICE, QUESTION_TYPES.MEANING_TO_WORD].includes(question.type)
  ) {
    return false
  }
  return question.choices?.[answer]?.isCorrect === true
}

// 1問分の4択問題を組み立てる。
// 選択肢のテキストは全語義の日本語訳を結合したもの（例:「銀行；土手」）。
// noneIsCorrect: true を指定すると「正解選択肢が存在しない問題」として
// ダミー4件のみで選択肢を組む。ただしテキストの異なるダミーが4件揃わない場合は
// 通常問題にフォールバックするので、呼び出し側は戻り値の noneIsCorrect フラグだけを信頼すること。
// 戻り値: { type, answerMode, prompt, answer, word, choices: [{ text, meaningJa, isCorrect }], noneIsCorrect }
// （choicesはシャッフル済み）。
export function buildQuestion(
  word,
  allWords,
  {
    noneIsCorrect = false,
    type = QUESTION_TYPES.MEANING_CHOICE,
    fillBlankQuestionsByWordId,
  } = {},
) {
  if (type === QUESTION_TYPES.MEANING_TO_WORD) {
    return buildMeaningToWordQuestion(word, allWords)
  }
  if (type === QUESTION_TYPES.FILL_BLANK) {
    // キャッシュが渡された場合は未生成の問題を同期生成しない。
    // TestPage は生成完了まで開始を無効化するため、ここでは null として除外する。
    if (fillBlankQuestionsByWordId) {
      return fillBlankQuestionsByWordId.get(word.id) ?? null
    }
    return buildFillBlankQuestion(word)
  }
  if (type !== QUESTION_TYPES.MEANING_CHOICE) throw new Error(`未対応の問題形式です: ${type}`)

  return buildMeaningChoiceQuestion(word, allWords, { noneIsCorrect })
}

function buildMeaningChoiceQuestion(word, allWords, { noneIsCorrect = false } = {}) {
  const correctText = joinedMeaningJa(word) || '(訳未登録)'
  const dummies = shuffle(allWords.filter((w) => w.id !== word.id && hasMeaningJa(w)))
  // 結合後のテキストが重複するダミー・正解テキストと同一のダミーは除いて最大4つ集める
  const seen = new Set([correctText])
  const picked = []
  for (const w of dummies) {
    if (picked.length >= 4) break
    const text = joinedMeaningJa(w)
    if (seen.has(text)) continue
    seen.add(text)
    picked.push(text)
  }
  if (noneIsCorrect && picked.length >= 4) {
    // 正解なし問題: 正解選択肢を含めずダミー4件だけで組む
    return {
      type: QUESTION_TYPES.MEANING_CHOICE,
      answerMode: 'choice',
      prompt: word.word,
      answer: correctText,
      word,
      choices: shuffle(picked.map((text) => ({ text, meaningJa: text, isCorrect: false }))),
      noneIsCorrect: true,
    }
  }
  // 通常問題（正解なし指定でもダミーが4件揃わなければこちらにフォールバック）
  const choices = shuffle([
    { text: correctText, meaningJa: correctText, isCorrect: true },
    ...picked.slice(0, 3).map((text) => ({ text, meaningJa: text, isCorrect: false })),
  ])
  return {
    type: QUESTION_TYPES.MEANING_CHOICE,
    answerMode: 'choice',
    prompt: word.word,
    answer: correctText,
    word,
    choices,
    noneIsCorrect: false,
  }
}

// 日本語訳を問題文にし、英単語を選択肢にする4択問題。
// 英単語の表記が重複する単語はダミー候補から除外する。
// 4種類の英単語を作れない場合は null を返し、その問題を出題対象から除外する。
function buildMeaningToWordQuestion(word, allWords) {
  const correctText = String(word.word ?? '').trim()
  const prompt = joinedMeaningJa(word)
  if (!correctText || !prompt) return null

  const seen = new Set([normalizedEnglishWord(correctText)])
  const dummies = shuffle(
    allWords.filter(
      (candidate) =>
        candidate.id !== word.id &&
        isWordEligibleForQuestion(candidate, QUESTION_TYPES.MEANING_TO_WORD),
    ),
  )
  const picked = []
  for (const candidate of dummies) {
    if (picked.length >= 3) break
    const text = String(candidate.word ?? '').trim()
    const key = normalizedEnglishWord(text)
    if (!text || seen.has(key)) continue
    seen.add(key)
    picked.push(text)
  }
  if (picked.length < 3) return null

  return {
    type: QUESTION_TYPES.MEANING_TO_WORD,
    answerMode: 'choice',
    prompt,
    answer: correctText,
    word,
    choices: shuffle([
      { text: correctText.toLowerCase(), isCorrect: true },
      ...picked.map((text) => ({ text: text.toLowerCase(), isCorrect: false })),
    ]),
    noneIsCorrect: false,
  }
}

// 出題単語リスト全体から問題配列を組み立てる（出題順は pickedWords の順を維持）。
// meaning-choice では全体の10〜20%（最低1問）を目標件数として「正解なし問題」を混ぜる。
// meaning-to-word では正解なし問題を作らず、ダミー不足の問題を除外する。
export function buildQuestions(pickedWords, allWords, options = {}) {
  const type = options.type ?? QUESTION_TYPES.MEANING_CHOICE
  const n = pickedWords.length
  const lo = Math.max(1, Math.floor(n * 0.1))
  const hi = Math.max(lo, Math.floor(n * 0.2))
  const target = lo + Math.floor(Math.random() * (hi - lo + 1))
  // 正解なし問題にするインデックスを重複なくランダムに選ぶ
  const noneIndices =
    type === QUESTION_TYPES.MEANING_CHOICE
      ? new Set(shuffle(pickedWords.map((_, i) => i)).slice(0, target))
      : new Set()
  return pickedWords
    .map((word, i) =>
      buildQuestion(word, allWords, {
        ...options,
        noneIsCorrect: noneIndices.has(i),
      }),
    )
    .filter(Boolean)
}

// 単語を「習得済み」（masteryLevel 最大値）にした新しいオブジェクトを返す（イミュータブル）。
export function markAsMastered(word) {
  return { ...word, masteryLevel: 5 }
}

// 回答結果を単語エントリに反映した新しいオブジェクトを返す（イミュータブル）。
// masteryLevel は 0〜5 の範囲でクランプ。
export function applyAnswerResult(word, isCorrect) {
  return {
    ...word,
    masteryLevel: Math.max(0, Math.min(5, word.masteryLevel + (isCorrect ? 1 : -1))),
    correctCount: word.correctCount + (isCorrect ? 1 : 0),
    incorrectCount: word.incorrectCount + (isCorrect ? 0 : 1),
    lastTestedAt: new Date().toISOString(),
  }
}
