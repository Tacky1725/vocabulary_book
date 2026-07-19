import assert from 'node:assert/strict'
import test from 'node:test'
import {
  QUESTION_TYPES,
  buildFillBlankQuestion,
  buildFillBlankQuestionData,
  buildQuestions,
  completeFillBlankAnswer,
  getFillBlankSourceFingerprint,
  hydrateFillBlankQuestion,
  getFillBlankInputValidation,
  isFillBlankTypedAnswerCorrect,
  isQuestionAnswerCorrect,
  isTypedAnswerCorrect,
  isWordEligibleForQuestion,
} from '../src/lib/quiz.js'

function word(word, example, partOfSpeech = 'verb') {
  return {
    id: word,
    word,
    senses: [{ partOfSpeech, meaningJa: 'テスト', example }],
  }
}

test('例文中の見出し語を空欄にし、入力回答を採点する', () => {
  const question = buildFillBlankQuestion(word('bank', 'I went to the bank.', 'noun'))
  assert.equal(question.answer, 'bank')
  assert.equal(question.prompt, 'I went to the b___.')
  assert.equal(isQuestionAnswerCorrect(question, { kind: 'typed', value: ' ANK ' }), true)
})

test('名詞の複数形を例文どおりの正解として出題する', () => {
  const question = buildFillBlankQuestion(word('book', 'She bought three books.', 'noun'))
  assert.equal(question.answer, 'books')
  assert.equal(question.match.inflection, 'plural')
  assert.equal(isTypedAnswerCorrect('book', question.answer), false)
  assert.equal(isTypedAnswerCorrect('books', question.answer), true)

  const irregular = buildFillBlankQuestion(word('child', 'The children are playing.', 'noun'))
  assert.equal(irregular.answer, 'children')
})

test('不規則動詞と複数語表現の表層形を検出する', () => {
  const irregular = buildFillBlankQuestion(word('go', 'She went home yesterday.'))
  assert.equal(irregular.answer, 'went')
  assert.equal(irregular.prompt, 'She w___ home yesterday.')

  const phrase = buildFillBlankQuestion(word('take care of', 'He took care of the dog.'))
  assert.equal(phrase.answer, 'took care of')
  assert.equal(phrase.prompt, 'He t___ c___ o_ the dog.')
})

test('異なる活用形が同じ例文に混在する語と一致しない語は出題しない', () => {
  const ambiguous = word('walk', 'She walks to work and walked home.')
  const unmatched = word('bank', 'She visited the library.', 'noun')
  assert.equal(buildFillBlankQuestion(ambiguous), null)
  assert.equal(buildFillBlankQuestion(unmatched), null)
  assert.equal(isWordEligibleForQuestion(unmatched, QUESTION_TYPES.FILL_BLANK), false)
})

test('typed回答の特殊回答文字列は通常の英単語として扱う', () => {
  const question = buildFillBlankQuestion(word('unknown', 'The result is unknown.', 'adjective'))
  assert.equal(isQuestionAnswerCorrect(question, { kind: 'typed', value: 'nknown' }), true)
  assert.equal(isQuestionAnswerCorrect(question, 'unknown'), false)
})

test('各語の先頭文字を除いた入力と文字数を穴埋め用に検証する', () => {
  assert.deepEqual(getFillBlankInputValidation('a', 'bank'), {
    typedCharacters: ['a'],
    expectedLength: 3,
    isTooLong: false,
  })
  assert.equal(isFillBlankTypedAnswerCorrect('ank', 'bank'), true)
  assert.equal(isFillBlankTypedAnswerCorrect('ookaref', 'took care of'), true)
  const tooLong = getFillBlankInputValidation('ankx', 'bank')
  assert.equal(tooLong.isTooLong, true)
  assert.equal(tooLong.expectedLength, 3)
})

test('回答後の入力表示には各語の先頭文字を補う', () => {
  assert.equal(completeFillBlankAnswer('ank', 'bank'), 'bank')
  assert.equal(completeFillBlankAnswer('ookaref', 'took care of'), 'took care of')
  assert.equal(completeFillBlankAnswer('an', 'bank'), 'ban')
  assert.equal(completeFillBlankAnswer('ankx', 'bank'), 'bankx')
})

test('穴埋めキャッシュは例文生成に関係する値だけで無効化し、出題時に最新の単語を結び付ける', () => {
  const original = word('bank', 'I went to the bank.', 'noun')
  const changedMeaning = {
    ...original,
    senses: [{ ...original.senses[0], meaningJa: '金融機関' }],
    correctCount: 10,
  }
  const changedExample = {
    ...original,
    senses: [{ ...original.senses[0], example: 'The bank is closed.' }],
  }
  assert.equal(
    getFillBlankSourceFingerprint(original),
    getFillBlankSourceFingerprint(changedMeaning),
  )
  assert.notEqual(
    getFillBlankSourceFingerprint(original),
    getFillBlankSourceFingerprint(changedExample),
  )

  const data = buildFillBlankQuestionData(original)
  const cachedQuestions = new Map([[changedMeaning.id, hydrateFillBlankQuestion(data, changedMeaning)]])
  const [question] = buildQuestions([changedMeaning], [changedMeaning], {
    type: QUESTION_TYPES.FILL_BLANK,
    fillBlankQuestionsByWordId: cachedQuestions,
  })
  assert.equal(question.prompt, 'I went to the b___.')
  assert.equal(question.word, changedMeaning)
})
