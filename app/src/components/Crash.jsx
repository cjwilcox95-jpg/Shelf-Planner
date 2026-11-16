import { Component } from 'react'
import { saveRescueBackup } from '../lib/rescue.js'

/**
 * If a screen breaks, show this instead of a blank page: say that the work is safe (it is saved after every
 * change), offer to start again, and offer a backup file made straight from storage.
 */
export class CrashScreen extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, msg: null, busy: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Shelf Planner stopped:', error, info?.componentStack)
  }

  render() {
    const { error, msg, busy } = this.state
    if (!error) return this.props.children
    const backup = async () => {
      this.setState({ busy: true, msg: null })
      this.setState({ busy: false, msg: await saveRescueBackup() })
    }
    return (
      <div className="import crash" role="alert" data-testid="crash">
        <img className="logo" src="logo.svg" alt="" />
        <h1>Something went wrong</h1>
        <p>Your plans are safe. They are saved on this phone after every change, and nothing was deleted.</p>
        <div className="import-card">
          <button className="btn primary wide" onClick={() => window.location.reload()} data-testid="crash-reload">Open the app again</button>
          <button className="btn wide" onClick={backup} disabled={busy} data-testid="crash-backup">{busy ? 'Making the backup…' : 'Save a backup file first'}</button>
          {msg && <p className={msg.startsWith('Could not') ? 'error' : 'ok-msg'} role="status">{msg}</p>}
          <p className="muted small">If this keeps happening, save a backup file and send it, with the line below, to whoever looks after the app.</p>
          <p className="muted small crash-detail">{String(error?.message || error).slice(0, 300)}</p>
        </div>
      </div>
    )
  }
}
