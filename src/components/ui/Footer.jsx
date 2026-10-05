/** Footer — subtle, always-on studio credit. */

import { BRAND } from '../../data/constants.js'
import { StudioMark } from './Logo.jsx'

export function Footer({ compact = false, className = '' }) {
  return (
    <footer
      className={`relative z-10 mt-auto w-full border-t border-violet-500/15 bg-black/25 backdrop-blur-sm ${className}`}
    >
      <div className="shell flex flex-col items-center gap-1.5 py-4 text-center safe-b">
        <div className="flex items-center gap-2 opacity-80">
          <StudioMark size={compact ? 16 : 18} />
          <span className="font-display text-[9px] tracking-[.3em] text-cyan-200/70">{BRAND.studio}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-violet-200/45">{BRAND.footer}</p>
        {!compact && <p className="font-mono text-[10px] tracking-wider text-violet-200/30">v{BRAND.version} · static build</p>}
      </div>
    </footer>
  )
}

export default Footer
