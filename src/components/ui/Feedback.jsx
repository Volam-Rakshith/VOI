/** Loading, empty, error and notification surfaces. */

import { motion } from 'framer-motion'
import { Button } from './Button.jsx'

export function Spinner({ size = 34, label = 'Loading' }) {
  return (
    <div className="inline-flex items-center gap-3" role="status" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 50 50" className="animate-spin" style={{ animationDuration: '1.1s' }}>
        <defs>
          <linearGradient id="spin-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#ff2bd1" />
          </linearGradient>
        </defs>
        <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(168,85,247,.22)" strokeWidth="4" />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="url(#spin-grad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="40 160"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function LoadingScreen({ title = 'Synchronising', caption = 'Linking devices…', children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center safe-t safe-b">
      <Spinner size={44} label={title} />
      <div>
        <p className="font-display text-[13px] tracking-[.28em] text-cyan-100/90">{title.toUpperCase()}</p>
        <p className="mt-1.5 text-[12.5px] text-violet-200/55">{caption}</p>
      </div>
      {children}
      <div className="mt-2 w-full max-w-xs space-y-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-3 rounded-full bg-violet-400/12"
            animate={{ opacity: [0.35, 0.75, 0.35] }}
            transition={{ duration: 1.6, delay: i * 0.16, repeat: Infinity }}
          />
        ))}
      </div>
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return (
    <motion.div
      className={`rounded-lg bg-violet-400/12 ${className}`}
      animate={{ opacity: [0.35, 0.8, 0.35] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  )
}

export function ErrorState({ title = 'Something went wrong', message, action = null, tone = 'error', glyph }) {
  const isError = tone === 'error'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass clip-hud mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 py-7 text-center"
      style={{ borderColor: isError ? 'rgba(255,43,209,.45)' : 'rgba(34,211,238,.45)' }}
      role={isError ? 'alert' : undefined}
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-full border text-lg"
        style={{
          borderColor: isError ? 'rgba(255,43,209,.6)' : 'rgba(34,211,238,.6)',
          background: isError ? 'rgba(255,43,209,.12)' : 'rgba(34,211,238,.12)',
          color: isError ? '#ff8fdc' : '#a5f3fc',
        }}
        aria-hidden="true"
      >
        {glyph || (isError ? '!' : 'i')}
      </span>
      <h2 className="font-display text-[13.5px] tracking-[.18em] text-violet-50">{title.toUpperCase()}</h2>
      {message && <p className="text-[12.5px] leading-relaxed text-violet-200/65">{message}</p>}
      {action}
    </motion.div>
  )
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-violet-400/25 bg-black/20 px-5 py-7 text-center">
      <p className="font-display text-[12px] tracking-[.18em] text-violet-100/85">{title}</p>
      {message && <p className="max-w-sm text-[12px] leading-relaxed text-violet-200/55">{message}</p>}
      {action}
    </div>
  )
}

export function InlineNotice({ tone = 'info', children, className = '' }) {
  const tones = {
    info: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100',
    warn: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
    error: 'border-fuchsia-400/45 bg-fuchsia-500/10 text-fuchsia-100',
    success: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  }
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[12px] leading-relaxed ${tones[tone]} ${className}`}>
      {children}
    </div>
  )
}

/** Full-screen barrier shown when the browser goes offline. */
export function OfflineBarrier({ online, children }) {
  if (online) return children
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <ErrorState
        title="Connection lost"
        message="Trying to reconnect… Local pass & play keeps working offline while we retry."
        action={
          <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
            Retry now
          </Button>
        }
      />
    </div>
  )
}

export default Spinner
