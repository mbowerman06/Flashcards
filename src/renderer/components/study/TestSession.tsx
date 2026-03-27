import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useDeckStore } from '../../stores/deck-store'
import type { Card } from '../../stores/card-store'
import * as api from '../../api/ipc-client'
import {
  parseContent, detectQuestionType, extractBlanks, frontWithBlanks,
  getMultiAnswers, answerMatches, getPlainText, QuestionType
} from '../../lib/card-content'
import RichTextViewer from '../card/RichTextViewer'

interface TestQuestion {
  card: Card
  type: QuestionType
  prompt: string         // what to show the user
  expectedAnswers: string[] // all required answers
  pointsTotal: number    // max points for this question
}

interface TestResult {
  question: TestQuestion
  givenAnswers: string[]
  pointsEarned: number
  timeMs: number
  correct: boolean
}

function buildQuestions(cards: Card[]): TestQuestion[] {
  return cards.map((card) => {
    const front = parseContent(card.front_content)
    const back = parseContent(card.back_content)
    const type = detectQuestionType(front, back)

    const frontText = getPlainText(front)
    const backText = getPlainText(back)

    if (type === 'fill-in-blank') {
      const blanks = extractBlanks(frontText)
      return {
        card,
        type,
        prompt: frontWithBlanks(frontText),
        expectedAnswers: blanks,
        pointsTotal: blanks.length
      }
    } else if (type === 'multi-answer') {
      const answers = getMultiAnswers(backText)
      return {
        card,
        type,
        prompt: frontText,
        expectedAnswers: answers,
        pointsTotal: answers.length
      }
    } else {
      return {
        card,
        type,
        prompt: frontText,
        expectedAnswers: [backText.trim()],
        pointsTotal: 1
      }
    }
  })
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

export default function TestSession() {
  const { deckId } = useParams<{ deckId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { decks } = useDeckStore()
  const deck = decks.find((d) => d.id === Number(deckId))
  const numericDeckId = Number(deckId)

  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<string[]>([''])
  const [results, setResults] = useState<TestResult[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [testComplete, setTestComplete] = useState(false)
  const cardStartTime = useRef(Date.now())
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Load cards
  useEffect(() => {
    (async () => {
      setLoading(true)
      let cards = await api.getCards(numericDeckId)
      // Filter by card IDs if provided
      const cardIdsParam = searchParams.get('cards')
      if (cardIdsParam) {
        const ids = new Set(cardIdsParam.split(',').map(Number))
        cards = cards.filter((c: Card) => ids.has(c.id))
      }
      const q = shuffle(buildQuestions(cards))
      setQuestions(q)
      setAnswers(q.length > 0 ? new Array(q[0].expectedAnswers.length).fill('') : [''])
      setCurrentIdx(0)
      setResults([])
      setSubmitted(false)
      setTestComplete(false)
      cardStartTime.current = Date.now()
      setLoading(false)
    })()
  }, [numericDeckId, searchParams])

  const currentQ = questions[currentIdx]

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentQ || submitted) return
    setSubmitted(true)

    const timeMs = Date.now() - cardStartTime.current

    // Score the answer
    let pointsEarned = 0
    const expected = currentQ.expectedAnswers

    if (currentQ.type === 'multi-answer') {
      // Each expected answer that was given correctly = 1 point
      // Each given answer that doesn't match = -1 point (min 0 total)
      const matched = new Set<number>()
      for (const given of answers) {
        const trimmed = given.trim()
        if (!trimmed) continue
        const matchIdx = expected.findIndex((e, i) => !matched.has(i) && answerMatches(trimmed, e))
        if (matchIdx >= 0) {
          matched.add(matchIdx)
          pointsEarned++
        } else {
          pointsEarned = Math.max(0, pointsEarned - 1)
        }
      }
    } else if (currentQ.type === 'fill-in-blank') {
      // Each blank matched = 1 point
      for (let i = 0; i < expected.length; i++) {
        if (answers[i] && answerMatches(answers[i], expected[i])) {
          pointsEarned++
        }
      }
    } else {
      // Definition: 1 point if answer matches
      if (answers[0] && answerMatches(answers[0], expected[0])) {
        pointsEarned = 1
      }
    }

    const correct = pointsEarned === currentQ.pointsTotal

    // Submit review time to backend for Best/Avg tracking
    await api.submitReview(currentQ.card.id, correct ? 4 : 0, timeMs)

    setResults((prev) => [...prev, {
      question: currentQ,
      givenAnswers: [...answers],
      pointsEarned,
      timeMs,
      correct
    }])
  }, [currentQ, answers, submitted])

  const handleNext = useCallback(() => {
    const nextIdx = currentIdx + 1
    if (nextIdx >= questions.length) {
      setTestComplete(true)
    } else {
      setCurrentIdx(nextIdx)
      setAnswers(new Array(questions[nextIdx].expectedAnswers.length).fill(''))
      setSubmitted(false)
      cardStartTime.current = Date.now()
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    }
  }, [currentIdx, questions])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, inputIdx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (submitted) {
        handleNext()
      } else {
        handleSubmitAnswer()
      }
    } else if (e.key === 'Tab' && !submitted) {
      e.preventDefault()
      const next = inputIdx + 1
      if (next < answers.length) {
        inputRefs.current[next]?.focus()
      }
    }
  }, [submitted, handleNext, handleSubmitAnswer, answers.length])

  // Global Enter key for submit/next
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const tag = (document.activeElement as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return // let input handler deal with it
        e.preventDefault()
        if (submitted) handleNext()
        else handleSubmitAnswer()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [submitted, handleNext, handleSubmitAnswer])

  // Auto-focus first input
  useEffect(() => {
    if (!loading && questions.length > 0) {
      setTimeout(() => inputRefs.current[0]?.focus(), 50)
    }
  }, [loading, currentIdx])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><p className="text-gray-500">Loading...</p></div>
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-gray-500 mb-4">No cards to test.</p>
        <button onClick={() => navigate(`/deck/${deckId}`)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Back to Deck</button>
      </div>
    )
  }

  // Results screen
  if (testComplete) {
    const totalPoints = results.reduce((s, r) => s + r.pointsEarned, 0)
    const maxPoints = results.reduce((s, r) => s + r.question.pointsTotal, 0)
    const totalTime = results.reduce((s, r) => s + r.timeMs, 0)
    const correctCount = results.filter((r) => r.correct).length
    const pct = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold mb-2">Test Complete!</h2>
        <p className="text-gray-500 mb-6">{deck?.name}</p>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-blue-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{pct}%</div>
            <div className="text-xs text-gray-500">Score</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{correctCount}/{questions.length}</div>
            <div className="text-xs text-gray-500">Correct</div>
          </div>
          <div className="bg-purple-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{totalPoints}/{maxPoints}</div>
            <div className="text-xs text-gray-500">Points</div>
          </div>
          <div className="bg-orange-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{formatTime(totalTime)}</div>
            <div className="text-xs text-gray-500">Total Time</div>
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-2 mb-6">
          {results.map((r, i) => (
            <div key={i} className={`p-3 rounded-lg border ${r.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  <span className="text-gray-400 mr-2">Q{i + 1}</span>
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                    r.question.type === 'fill-in-blank' ? 'bg-yellow-100 text-yellow-700' :
                    r.question.type === 'multi-answer' ? 'bg-purple-100 text-purple-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {r.question.type === 'fill-in-blank' ? 'Fill-in-blank' :
                     r.question.type === 'multi-answer' ? 'Multi-answer' : 'Definition'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {r.pointsEarned}/{r.question.pointsTotal} pts &middot; {formatTime(r.timeMs)}
                </div>
              </div>
              <div className="text-sm text-gray-600 mt-1 truncate">{r.question.prompt.substring(0, 80)}</div>
              {!r.correct && (
                <div className="text-xs mt-1">
                  <span className="text-red-500">Your answer: {r.givenAnswers.filter(Boolean).join(', ') || '(empty)'}</span>
                  <span className="text-gray-400 mx-1">&rarr;</span>
                  <span className="text-green-600">Correct: {r.question.expectedAnswers.join(', ')}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <button onClick={() => navigate(`/deck/${deckId}/test${searchParams.get('cards') ? `?cards=${searchParams.get('cards')}` : ''}`)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">
            Test Again
          </button>
          <button onClick={() => navigate(`/deck/${deckId}`)}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 font-medium">
            Back to Deck
          </button>
        </div>
      </div>
    )
  }

  // Active question
  const progress = `${currentIdx + 1} / ${questions.length}`
  const typeLabel = currentQ.type === 'fill-in-blank' ? 'Fill in the blank' :
                    currentQ.type === 'multi-answer' ? `Type all ${currentQ.expectedAnswers.length} answers` :
                    'Type the answer'

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold">{deck?.name ?? 'Test'}</h2>
          <p className="text-sm text-gray-500">{progress} &middot; {typeLabel}</p>
        </div>
        <button onClick={() => navigate(`/deck/${deckId}`)}
          className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
          End Test
        </button>
      </div>

      {/* Question prompt */}
      <div className="flex-1 overflow-auto min-h-0">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-4">
            <div className="text-xs text-gray-400 uppercase mb-2">
              {currentQ.type === 'fill-in-blank' ? 'Fill in the blank' :
               currentQ.type === 'multi-answer' ? 'Multi-answer' : 'Question'}
            </div>
            <div className="text-base">
              {currentQ.prompt}
            </div>
            {currentQ.type === 'multi-answer' && !submitted && (
              <div className="mt-2 text-sm text-gray-400">
                {currentQ.expectedAnswers.length} answer{currentQ.expectedAnswers.length !== 1 ? 's' : ''} required
              </div>
            )}
          </div>

          {/* Answer inputs */}
          <div className="space-y-2">
            {answers.map((ans, i) => {
              const isCorrect = submitted && currentQ.expectedAnswers.some((e) => answerMatches(ans, e))
              const expected = currentQ.type === 'fill-in-blank' ? currentQ.expectedAnswers[i] : null
              const blankCorrect = submitted && expected && answerMatches(ans, expected)

              return (
                <div key={i} className="relative">
                  <input
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    value={ans}
                    onChange={(e) => {
                      if (submitted) return
                      const next = [...answers]
                      next[i] = e.target.value
                      setAnswers(next)
                    }}
                    onKeyDown={(e) => handleKeyDown(e, i)}
                    placeholder={currentQ.type === 'fill-in-blank' ? `Blank ${i + 1}` : `Answer ${i + 1}`}
                    disabled={submitted}
                    className={`w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      submitted
                        ? (currentQ.type === 'fill-in-blank' ? blankCorrect : isCorrect)
                          ? 'border-green-400 bg-green-50'
                          : 'border-red-400 bg-red-50'
                        : 'border-gray-300'
                    }`}
                  />
                  {submitted && currentQ.type === 'fill-in-blank' && !blankCorrect && expected && (
                    <div className="text-xs text-green-600 mt-1">Correct: {expected}</div>
                  )}
                </div>
              )
            })}

            {/* Add more answer fields for multi-answer */}
            {currentQ.type === 'multi-answer' && !submitted && answers.length < currentQ.expectedAnswers.length + 2 && (
              <button
                onClick={() => setAnswers([...answers, ''])}
                className="text-xs text-blue-500 hover:underline"
              >
                + Add another answer
              </button>
            )}
          </div>

          {/* Show correct answers after submit for definition/multi */}
          {submitted && !results[results.length - 1]?.correct && currentQ.type !== 'fill-in-blank' && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-xs text-green-700 font-medium mb-1">Correct answer{currentQ.expectedAnswers.length > 1 ? 's' : ''}:</div>
              {currentQ.expectedAnswers.map((a, i) => (
                <div key={i} className="text-sm text-green-800">{a}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 pt-4 max-w-2xl mx-auto w-full text-center">
        {submitted ? (
          <button onClick={handleNext}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium text-lg">
            {currentIdx + 1 >= questions.length ? 'See Results' : 'Next Question'}
          </button>
        ) : (
          <button onClick={handleSubmitAnswer}
            className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium text-lg">
            Submit Answer
          </button>
        )}
        <p className="text-xs text-gray-400 mt-2">Press Enter to {submitted ? 'continue' : 'submit'}</p>
      </div>
    </div>
  )
}
