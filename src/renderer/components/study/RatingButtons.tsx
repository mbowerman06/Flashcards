interface Props {
  onRate: (grade: number) => void
}

const ratings = [
  { grade: 0, label: 'Again', key: '1', color: 'bg-red-600 hover:bg-red-700' },
  { grade: 2, label: 'Hard', key: '2', color: 'bg-orange-500 hover:bg-orange-600' },
  { grade: 4, label: 'Good', key: '3', color: 'bg-green-600 hover:bg-green-700' },
  { grade: 5, label: 'Easy', key: '4', color: 'bg-blue-600 hover:bg-blue-700' }
]

export default function RatingButtons({ onRate }: Props) {
  return (
    <div className="mt-6">
      <div className="flex justify-center gap-3">
        {ratings.map((r) => (
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
    </div>
  )
}
