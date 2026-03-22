interface CardTimeRecord {
  cardId: number
  timeMs: number
}

interface Props {
  reviewed: number
  cardTimes: CardTimeRecord[]
  onBack: () => void
  onStudyAgain: () => void
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

export default function StudyComplete({ reviewed, cardTimes, onBack, onStudyAgain }: Props) {
  const totalTimeMs = cardTimes.reduce((sum, t) => sum + t.timeMs, 0)
  const avgTimeMs = cardTimes.length > 0 ? Math.round(totalTimeMs / cardTimes.length) : 0
  const fastestMs = cardTimes.length > 0 ? Math.min(...cardTimes.map((t) => t.timeMs)) : 0
  const slowestMs = cardTimes.length > 0 ? Math.max(...cardTimes.map((t) => t.timeMs)) : 0

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="text-center">
        <div className="text-5xl mb-4">&#10003;</div>
        <h2 className="text-2xl font-bold mb-2">Session Complete!</h2>
        <p className="text-gray-600 mb-6">
          You reviewed <span className="font-semibold">{reviewed}</span> card
          {reviewed !== 1 ? 's' : ''}.
        </p>

        {cardTimes.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-8 max-w-xs mx-auto text-sm">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-blue-600 font-semibold">{formatTime(totalTimeMs)}</div>
              <div className="text-gray-500">Total time</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-green-600 font-semibold">{formatTime(avgTimeMs)}</div>
              <div className="text-gray-500">Avg per card</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-purple-600 font-semibold">{formatTime(fastestMs)}</div>
              <div className="text-gray-500">Fastest</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-3">
              <div className="text-orange-600 font-semibold">{formatTime(slowestMs)}</div>
              <div className="text-gray-500">Slowest</div>
            </div>
          </div>
        )}

        <div className="flex gap-4 justify-center">
          <button
            onClick={onStudyAgain}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
          >
            Study Again
          </button>
          <button
            onClick={onBack}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-colors font-medium"
          >
            Back to Deck
          </button>
        </div>
      </div>
    </div>
  )
}
