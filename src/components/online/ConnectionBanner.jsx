/** ConnectionBanner — visible, honest reporting of realtime sync state. */

import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'

export function ConnectionBanner({ connection, onRetry }) {
  const { state, error } = connection || {}
  const visible = state && !['connected', 'idle'].includes(state)

  const copy = {
    connecting: { title: 'CONNECTING', body: 'Opening a live channel to the room…', tone: 'cyan' },
    reconnecting: { title: 'CONNECTION LOST', body: 'Trying to reconnect… your seat is held.', tone: 'amber' },
    offline: { title: 'YOU ARE OFFLINE', body: 'Reconnect to keep playing. Local pass & play still works.', tone: 'amber' },
    error: { title: 'ROOM UNAVAILABLE', body: error || 'Something went wrong.', tone: 'magenta' },
    terminated: { title: 'ROOM CLOSED', body: error || 'The host closed this room.', tone: 'magenta' },
  }[state] || { title: 'SYNC ISSUE', body: error || '', tone: 'amber' }

  const tones = {
    cyan: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100',
    amber: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
    magenta: 'border-fuchsia-400/45 bg-fuchsia-500/10 text-fuchsia-100',
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          role="status"
          aria-live="polite"
          className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${tones[copy.tone]}`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${state === 'reconnecting' || state === 'connecting' ? 'animate-ping' : ''} bg-current`} />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[10.5px] tracking-[.2em]">{copy.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug opacity-80">{copy.body}</p>
          </div>
          {onRetry && ['offline', 'error', 'terminated'].includes(state) && (
            <Button size="sm" variant="quiet" className="shrink-0 !min-h-8 !px-2 !text-[10px]" onClick={() => onRetry()}>
              Retry
            </Button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ConnectionBanner
