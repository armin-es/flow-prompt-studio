import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; title?: string }

type State = { err: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  override componentDidCatch(err: Error, info: ErrorInfo) {
    console.error(info.componentStack, err)
  }

  override render() {
    if (this.state.err) {
      return (
        <div
          className="error-boundary"
          role="alert"
        >
          <h2 className="error-boundary-title">
            {this.props.title ?? 'Something went wrong'}
          </h2>
          <pre className="error-boundary-msg">{this.state.err.message}</pre>
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ err: null })
              window.location.reload()
            }}
          >
            Reset app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
