/** Panel — the HUD surface used by every screen (glass + clipped corners). */

import { motion } from 'framer-motion'

export function Panel({ children, className = '', variant = 'glass', as = 'div', delay = 0, annotated = false, ...rest }) {
  const Comp = motion[as] || motion.div
  const base = variant === 'strong' ? 'glass-strong' : variant === 'bare' ? 'bg-transparent border-0 shadow-none' : 'glass'
  return (
    <Comp
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative clip-hud ${base} ${className}`}
      {...rest}
    >
      {annotated && (
        <>
          <span className="pointer-events-none absolute left-0 top-0 h-px w-10 bg-gradient-to-r from-cyan-neon to-transparent" />
          <span className="pointer-events-none absolute bottom-0 right-0 h-px w-10 bg-gradient-to-l from-magenta-neon to-transparent" />
        </>
      )}
      {children}
    </Comp>
  )
}

export function PanelHeader({ title, subtitle, right = null, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 border-b border-violet-500/20 px-4 py-3 sm:px-5 ${className}`}>
      <div className="min-w-0">
        <h2 className="truncate font-display text-[13px] tracking-[.2em] text-violet-50">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-violet-200/55">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function PanelBody({ children, className = '' }) {
  return <div className={`px-4 py-4 sm:px-5 ${className}`}>{children}</div>
}

export default Panel
