import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 p-8">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-3">Something went wrong</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-2 text-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <pre className="text-xs text-left bg-gray-100 dark:bg-gray-800 rounded-lg p-3 mb-4 max-h-32 overflow-auto text-gray-500">
              {this.state.error?.stack?.split('\n').slice(0, 5).join('\n')}
            </pre>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
