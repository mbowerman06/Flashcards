import { useEffect } from 'react'
import { useToastStore } from '../../stores/toast-store'

export default function Toast() {
  const { message, undoAction, dismiss } = useToastStore()

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => dismiss(), 5000)
    return () => clearTimeout(timer)
  }, [message, dismiss])

  if (!message) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-lg shadow-lg text-sm">
      <span>{message}</span>
      {undoAction && (
        <button
          onClick={() => {
            undoAction()
            dismiss()
          }}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium transition-colors"
        >
          Undo
        </button>
      )}
      <button
        onClick={dismiss}
        className="ml-1 text-gray-400 hover:text-white transition-colors"
      >
        &times;
      </button>
    </div>
  )
}
