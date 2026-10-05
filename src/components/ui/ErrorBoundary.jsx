/**
 * ErrorBoundary — catches render/lifecycle crashes anywhere in its subtree and
 * shows a themed, actionable screen instead of a blank page or a dead spinner.
 *
 * Mounted in two places (see main.jsx and App.jsx):
 *   • once above the providers, so a context failure cannot blank the app
 *   • once around the routed screens, so a single page can fail alone
 */

import { Component } from 'react'
import { Button } from './Button.jsx'
import { ErrorState } from './Feedback.jsx'
import { markBooted } from '../../lib/boot.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.reset = this.reset.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Never surface raw stacks to players; keep detail in the dev console only.
    if (import.meta.env.DEV) console.error('[imposter] render error', error, info)
    // A friendly crash screen still counts as a successful boot.
    markBooted()
  }

  reset() {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    const title = this.props.title || 'Something broke'
    const message =
      this.props.message ||
      'The app hit an unexpected error. Your settings and words are stored safely on this device, so reloading usually clears it.'

    return (
      <div className="screen items-center justify-center px-4 py-16">
        <ErrorState
          title={title}
          message={message}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  if (this.props.onReset) this.props.onReset()
                  else window.location.reload()
                }}
              >
                {this.props.onReset ? 'Back to menu' : 'Reload'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                Reload app
              </Button>
            </div>
          }
        />
      </div>
    )
  }
}

export default ErrorBoundary
