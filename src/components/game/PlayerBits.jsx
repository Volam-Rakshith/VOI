/** Roster, turn banner and vote-selection components shared by both modes. */

import { motion } from 'framer-motion'
import { Badge, Glyph, ProgressDots } from '../ui/Layout.jsx'

export function PlayerPill({ player, active = false, eliminated = false, showRole = false, meta = null, onClick, disabled = false }) {
  const isImposter = player.role === 'imposter'
  return (
    <motion.button
      type="button"
      layout
      data-player-id={player.id}
      data-player-name={player.name}
      onClick={onClick}
      disabled={disabled || !onClick}
      whileTap={onClick && !disabled ? { scale: 0.97 } : undefined}
      className={`relative flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 ${
        active
          ? 'border-cyan-300/70 bg-gradient-to-r from-cyan-500/16 to-fuchsia-500/14 shadow-neon-cyan'
          : 'border-violet-500/25 bg-black/32'
      } ${onClick && !disabled ? 'hover:border-cyan-300/55' : ''} ${eliminated ? 'opacity-45 saturate-50' : ''}`}
      aria-pressed={active || undefined}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border font-display text-[13px] ${
          eliminated
            ? 'border-violet-400/25 text-violet-200/50'
            : isImposter && showRole
              ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100'
              : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
        }`}
        aria-hidden="true"
      >
        {player.name?.slice(0, 1)?.toUpperCase() || '?'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[12.5px] tracking-[.1em] text-violet-50">{player.name}</span>
        {meta && <span className="mt-0.5 block truncate text-[11px] text-violet-200/55">{meta}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {eliminated && <Badge tone="muted">out</Badge>}
        {showRole && !eliminated && isImposter && <Badge tone="magenta">imposter</Badge>}
        {showRole && !eliminated && !isImposter && <Badge tone="cyan">crew</Badge>}
      </span>
    </motion.button>
  )
}

/** Whose turn is it? */
export function TurnBanner({ name, index, total, isMe, className = '' }) {
  return (
    <div className={`glass clip-hud px-4 py-4 text-center sm:px-6 ${className}`}>
      <p className="label text-[9px]">{isMe ? 'your clue' : 'clue turn'}</p>
      <motion.p
        key={name}
        initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.36 }}
        className="mt-1.5 font-display text-[clamp(20px,7vw,28px)] leading-tight tracking-[.1em] text-white text-neon"
      >
        {name || '—'}
      </motion.p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <ProgressDots total={total} current={index} />
        <span className="font-mono text-[10.5px] tabular text-violet-200/60">
          {Math.min(index + 1, total)}/{total}
        </span>
      </div>
    </div>
  )
}

/** Grid used by the voting phases. */
export function VoteGrid({ players, selected, onSelect, disabledIds = [], myId = null, columns = 'auto' }) {
  return (
    <div
      className={`grid gap-2 ${columns === 'auto' ? 'grid-cols-1 sm:grid-cols-2' : ''}`}
      style={columns === 'auto' ? undefined : { gridTemplateColumns: columns }}
    >
      {players.map((player, i) => (
        <motion.div
          key={player.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.03, 0.3) }}
        >
          <PlayerPill
            player={player}
            active={selected === player.id}
            disabled={disabledIds.includes(player.id)}
            meta={player.id === myId ? 'that is you' : null}
            onClick={() => onSelect?.(player.id)}
          />
        </motion.div>
      ))}
    </div>
  )
}

/** Animated vote tally with dramatic reveal. */
export function VoteTally({ tally = [], max = 1, onEmpty }) {
  if (!tally.length) return onEmpty || null
  return (
    <div className="space-y-2.5">
      {tally.map((entry, index) => {
        const pct = max > 0 ? Math.max(8, (entry.count / max) * 100) : 8
        const top = index === 0 && entry.count === max
        return (
          <div key={entry.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate font-display text-[12px] tracking-[.08em] text-violet-50">{entry.name}</span>
                {entry.wasImposter && <Badge tone="magenta">imposter</Badge>}
              </span>
              <span className="shrink-0 font-mono tabular text-violet-200/70">
                {entry.count} vote{entry.count === 1 ? '' : 's'}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/45">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ delay: 0.18 + index * 0.14, type: 'spring', stiffness: 120, damping: 22 }}
                className="h-full rounded-full"
                style={{
                  background: top
                    ? 'linear-gradient(90deg,#ff2bd1,#ff5fa2)'
                    : 'linear-gradient(90deg,#22d3ee,#a855f7)',
                  boxShadow: top ? '0 0 16px rgba(255,43,209,.5)' : '0 0 12px rgba(34,211,238,.35)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Compact live status strip (round / phase / alive count). */
export function StatusStrip({ round, totalRounds, phase, alive, total, right = null }) {
  return (
    <div className="glass clip-hud-sm flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Glyph name="bolt" size={14} className="shrink-0 text-cyan-300" />
        <span className="truncate font-display text-[11px] tracking-[.16em] text-violet-50">
          ROUND {round}
          {totalRounds ? `/${totalRounds}` : ''}
        </span>
        <span className="hidden h-3 w-px bg-violet-400/30 sm:block" />
        <span className="hidden truncate text-[11px] uppercase tracking-[.18em] text-cyan-200/70 sm:block">{phase}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[10.5px] tabular text-violet-200/60">
          {alive}/{total} in
        </span>
        {right}
      </div>
    </div>
  )
}

export default PlayerPill
