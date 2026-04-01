const isMac = navigator.userAgent.includes('Macintosh') || navigator.platform === 'MacIntel'

export default function TitleBar() {
  const api = window.electronAPI

  return (
    <div className="flex items-center justify-between h-8 bg-gray-900 select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* On macOS, leave space for the native traffic light buttons */}
      <div className={`${isMac ? 'pl-20' : 'pl-3'} text-xs text-gray-400 font-medium`}>Flashcards</div>
      {/* Only show custom window controls on Windows/Linux — macOS uses native traffic lights */}
      {!isMac && (
        <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => api?.windowMinimize()}
            className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-0.5" fill="currentColor" viewBox="0 0 12 2"><rect width="12" height="2" /></svg>
          </button>
          <button
            onClick={() => api?.windowMaximize()}
            className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" />
            </svg>
          </button>
          <button
            onClick={() => api?.windowClose()}
            className="w-12 h-full flex items-center justify-center text-gray-400 hover:bg-red-600 hover:text-white transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 12 12">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
