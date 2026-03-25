import { useUIStore } from '../../stores/ui-store'

interface Props {
  onRate: (grade: number) => void
}

const detailedRatings = [
  { grade: 0, label: 'Again', key: '1', color: 'bg-red-600 hover:bg-red-700' },
  { grade: 2, label: 'Hard', key: '2', color: 'bg-orange-500 hover:bg-orange-600' },
  { grade: 4, label: 'Good', key: '3', color: 'bg-green-600 hover:bg-green-700' },
  { grade: 5, label: 'Easy', key: '4', color: 'bg-blue-600 hover:bg-blue-700' }
]

export default function RatingButtons({ onRate }: Props) {
  const { ratingMode, setRatingMode } = useUIStore()

  return (
    <div className="mt-6">
      {ratingMode === 'simple' ? (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => onRate(0)}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
          >
            Incorrect
            <span className="block text-xs opacity-75 mt-0.5">(1)</span>
          </button>
          <button
            onClick={() => onRate(4)}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
          >
            Correct
            <span className="block text-xs opacity-75 mt-0.5">(2)</span>
          </button>
        </div>
      ) : (
        <div className="flex justify-center gap-3">
          {detailedRatings.map((r) => (
            <button
              key={r.grade}
              onClick={() => onRate(r.grade)}
              className={`px-5 py-3 text-white rounded-xl font-medium transition-colors ${r.color}`}
            >
              {r.label}
              <span className="block text-xs opacity-75 mt-0.5">({r.key})</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-center mt-3">
        <button
          onClick={() => setRatingMode(ratingMode === 'simple' ? 'detailed' : 'simple')}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Switch to {ratingMode === 'simple' ? '4-button' : '2-button'} mode
        </button>
      </div>
    </div>
  )
}
