/** Page chrome: ScreenShell, ScreenHeader, ProgressDots, Badge, CategoryGlyph. */

import { motion } from 'framer-motion'
import { Button } from './Button.jsx'
import { Footer } from './Footer.jsx'

export function ScreenShell({ children, className = '', withFooter = true, footerCompact = false }) {
  return (
    <div className={`screen ${className}`}>
      <div className="flex flex-1 flex-col">{children}</div>
      {withFooter && <Footer compact={footerCompact} />}
    </div>
  )
}

export function ScreenHeader({ title, eyebrow, onBack, right = null, sticky = true, className = '' }) {
  return (
    <header
      className={`safe-t z-30 w-full ${sticky ? 'sticky top-0' : ''} ${className}`}
      style={{ background: sticky ? 'linear-gradient(180deg, rgba(11,0,26,.92), rgba(11,0,26,.35) 70%, transparent)' : undefined }}
    >
      <div className="shell flex items-center gap-3 py-3">
        {onBack && (
          <Button
            variant="quiet"
            size="sm"
            onClick={onBack}
            aria-label="Go back"
            className="!min-h-10 !w-10 !px-0 shrink-0 border border-violet-400/30"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ←
            </span>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="label text-[9.5px] text-cyan-200/70">{eyebrow}</p>}
          <h1 className="truncate font-display text-[15px] tracking-[.16em] text-violet-50 sm:text-base">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  )
}

export function Badge({ children, tone = 'violet', className = '' }) {
  const tones = {
    violet: 'border-violet-400/40 bg-violet-500/15 text-violet-100',
    cyan: 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100',
    magenta: 'border-fuchsia-400/45 bg-fuchsia-500/15 text-fuchsia-100',
    amber: 'border-amber-400/45 bg-amber-500/15 text-amber-100',
    emerald: 'border-emerald-400/45 bg-emerald-500/15 text-emerald-100',
    muted: 'border-violet-400/20 bg-black/30 text-violet-200/65',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] ${tones[tone] || tones.violet} ${className}`}
    >
      {children}
    </span>
  )
}

export function ProgressDots({ total, current, className = '' }) {
  const shown = Math.min(total, 14)
  const capped = total > 14
  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: shown }).map((_, i) => {
        const done = i < current
        const active = i === current
        return (
          <motion.span
            key={i}
            layout
            className={`h-1.5 rounded-full ${active ? 'w-6 bg-cyan-300 shadow-neon-cyan' : done ? 'w-1.5 bg-violet-400/70' : 'w-1.5 bg-white/15'}`}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          />
        )
      })}
      {capped && <span className="ml-1 font-mono text-[10px] text-violet-200/50">+{total - shown}</span>}
    </div>
  )
}

export function StatBlock({ label, value, tone = 'cyan', className = '' }) {
  const colors = {
    cyan: 'text-cyan-100 border-cyan-400/30',
    magenta: 'text-fuchsia-100 border-fuchsia-400/30',
    violet: 'text-violet-100 border-violet-400/30',
  }
  return (
    <div className={`rounded-xl border bg-black/30 px-3 py-2.5 ${colors[tone]} ${className}`}>
      <p className="label text-[9px] opacity-70">{label}</p>
      <p className="mt-1 font-display text-[17px] tabular leading-none">{value}</p>
    </div>
  )
}

/** Small inline SVG glyph set — avoids emoji and any icon-font dependency. */
export function Glyph({ name = 'spark', size = 18, className = '' }) {
  const paths = {
    spark: 'M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6z',
    skull: 'M12 3c-4.4 0-7 2.8-7 6.4 0 2.1.9 3.6 2.2 4.6V18a2 2 0 002 2h5.6a2 2 0 002-2v-4c1.3-1 2.2-2.5 2.2-4.6C19 5.8 16.4 3 12 3z M9.6 10.4a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm4.8 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
    eye: 'M12 5c-5 0-9 4.4-9 7s4 7 9 7 9-4.4 9-7-4-7-9-7zm0 11.2A4.2 4.2 0 1112 7.8a4.2 4.2 0 010 8.4zm0-6.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8z',
    lock: 'M6 11V8a6 6 0 1112 0v3h1a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1zm2 0h8V8a4 4 0 10-8 0z',
    chip: 'M8 8h8v8H8zM6 3h2v2H6zm10 0h2v2h-2zM6 19h2v2H6zm10 0h2v2h-2zM3 6h2v2H3zm0 10h2v2H3zm16-10h2v2h-2zm0 10h2v2h-2zM9 3h6v2H9zm0 16h6v2H9z',
    room: 'M4 20V6l8-3 8 3v14h-5v-6h-6v6z',
    book: 'M5 4h6a3 3 0 013 3v13a3 3 0 00-3-3H5zm14 0h-4v13h4z',
    users: 'M9 11a4 4 0 100-8 4 4 0 000 8zm7 1a3 3 0 100-6 3 3 0 000 6zM2 20a7 7 0 0114 0zm14.5 0a6.5 6.5 0 00-2-4.7A5 5 0 0122 20z',
    bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2 .6.9 1.9-1.7 1.7-1.9-.9-.6 2h-.6l-.6-2-1.9.9-1.7-1.7.9-1.9-2-.6v-.6l2-.6-.9-1.9 1.7-1.7 1.9.9.6-2h.6l.6 2 1.9-.9 1.7 1.7-.9 1.9 2 .6z',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d={paths[name] || paths.spark} />
    </svg>
  )
}

export const CATEGORY_GLYPHS = {
  everyday: 'spark',
  food: 'spark',
  animals: 'spark',
  places: 'room',
  technology: 'chip',
  movies: 'spark',
  sports: 'bolt',
  school: 'book',
  travel: 'room',
}

export default ScreenShell
