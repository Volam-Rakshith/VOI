/**
 * Logo — the VR DEVELOPMENTS studio mark plus the IMPOSTER wordmark.
 * Pure SVG/CSS: no image requests, scales crisply, works offline.
 */

import { BRAND } from '../../data/constants.js'

export function StudioMark({ size = 38, className = '' }) {
  const id = 'vrdev-mark-grad'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${BRAND.studio} logo`}
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="52%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ff2bd1" />
        </linearGradient>
      </defs>
      <path
        d="M32 2 58 17v30L32 62 6 47V17Z"
        fill="rgba(10,0,26,.72)"
        stroke={`url(#${id})`}
        strokeWidth="2.2"
      />
      <path d="M32 9 51 20v24L32 55 13 44V20Z" fill="none" stroke="rgba(168,85,247,.45)" strokeWidth="1" />
      <path
        d="M20 22h7.4l4.6 12.6L36.6 22H44L32 48Z"
        fill={`url(#${id})`}
        style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,.6))' }}
      />
      <circle cx="32" cy="32" r="2.4" fill="#fff" opacity=".85" />
    </svg>
  )
}

export function Logo({ size = 'md', withStudio = true, className = '' }) {
  const scales = {
    sm: { mark: 26, word: 'text-2xl', studio: 'text-[8px]' },
    md: { mark: 34, word: 'text-4xl', studio: 'text-[10px]' },
    lg: { mark: 54, word: 'text-6xl', studio: 'text-xs' },
  }
  const s = scales[size] || scales.md

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex items-center gap-3">
        <StudioMark size={s.mark} />
        {withStudio && (
          <span className={`font-display ${s.studio} tracking-[.42em] text-cyan-200/85`}>{BRAND.studio}</span>
        )}
      </div>
      <span className={`font-display ${s.word} leading-none tracking-[.1em] text-neon`}>{BRAND.game}</span>
    </div>
  )
}

export default Logo
