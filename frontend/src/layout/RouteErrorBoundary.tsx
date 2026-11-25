import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import './shell.css'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Catches a screen that failed to load. The usual cause is a deploy replacing the hashed files
 * while a tab was open, so the import of the next screen's code is refused. Without this the whole
 * app would unmount to a blank page; with it the shell stays and the person can reload.
 * Mount it with a key that changes per page, so moving to another page starts it afresh.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('A page failed to load or render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    // An h1, because this stands in for the page and takes over its heading's job (the route
    // focus lands here); the message is an alert, as Incidents does for a list that failed to load.
    return (
      <div className="ui-route-error">
        <h1 className="ui-route-error-title">This page didn&rsquo;t load</h1>
        <p className="ui-route-error-message" role="alert">
          This page didn&rsquo;t load. The site may have just been updated.
        </p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    )
  }
}
