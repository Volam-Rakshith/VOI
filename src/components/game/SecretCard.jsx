/**
 * SecretCard — the 3D flip card that holds a player's secret.
 *
 * Front : TAP TO REVEAL
 * Back  : the secret word (crew) or IMPOSTER (with a bluff decoy)
 *
 * The card is only readable while flipped; the caller hides it again before the
 * device moves on, so a secret is never left on screen.
 */

import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '../../context/SettingsContext.jsx'
import { Glyph } from '../ui/Layout.jsx'

export function SecretCard({
  secret,
  revealed = false,
  onToggle,
  playerName,
  showDecoy = true,
  disabled = false,
  footerHint,
}) {
  const { motionOff, vibrate } = useSettings()
  const [glare, setGlare] = useState({ x: 50, y: 50, active: false })
  const cardRef = useRef(null)

  const isImposter = secret?.role === 'imposter'

  const handlePointerMove = useCallback(
    (event) => {
      if (motionOff) return
      const rect = cardRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = event.touches?.[0] || event
      setGlare({
        x: Math.max(0, Math.min(100, ((point.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((point.clientY - rect.top) / rect.height) * 100)),
        active: true,
      })
    },
    [motionOff],
  )

  const accent = isImposter
    ? { border: 'rgba(255,43,209,.75)', glow: 'rgba(255,43,209,.45)', text: '#ffd6f6' }
    : { border: 'rgba(34,211,238,.7)', glow: 'rgba(34,211,238,.4)', text: '#d8fbff' }

  return (
    <div className="flex w-full flex-col items-center">
      <div className="perspective-1200 w-full max-w-[340px]">
        <motion.div
          ref={cardRef}
          className="relative w-full preserve-3d"
          style={{ height: 'min(60vh, 520px)', minHeight: '330px' }}
          animate={{
            rotateY: revealed ? 180 : 0,
            rotateX: motionOff ? 0 : revealed ? 0 : glare.active ? (glare.y - 50) * -0.06 : 0,
            rotateZ: motionOff ? 0 : revealed ? 0 : glare.active ? (glare.x - 50) * 0.03 : 0,
          }}
          transition={motionOff ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18, mass: 0.9 }}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setGlare((g) => ({ ...g, active: false }))}
          onClick={() => {
            if (disabled) return
            vibrate?.(14)
            onToggle?.(!revealed)
          }}
          role="button"
          tabIndex={0}
          aria-label={revealed ? 'Hide your secret' : 'Reveal your secret'}
          onKeyDown={(event) => {
            if (disabled) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onToggle?.(!revealed)
            }
          }}
          whileHover={motionOff || revealed ? undefined : { scale: 1.012 }}
          whileTap={disabled ? undefined : { scale: 0.985 }}
        >
          {/* ---------------------------------------------------------- FRONT */}
          <div
            className="backface-hidden absolute inset-0 flex flex-col items-center justify-between overflow-hidden clip-hud"
            style={{
              background: 'linear-gradient(158deg, #1D0640 0%, #12012B 48%, #0A0018 100%)',
              border: '1px solid rgba(168,85,247,.45)',
              boxShadow: '0 34px 80px -30px rgba(0,0,0,.95), inset 0 1px 0 rgba(255,255,255,.08)',
            }}
          >
            {/* neon frame + holo pattern */}
            <span className="pointer-events-none absolute inset-[6px] rounded-[10px] border border-violet-400/25" />
            <span
              className="pointer-events-none absolute inset-0 opacity-[.35]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 15%, rgba(255,43,209,.25), transparent 42%), radial-gradient(circle at 85% 82%, rgba(34,211,238,.22), transparent 45%)',
              }}
            />
            <span
              className="pointer-events-none absolute inset-0 opacity-[.07]"
              style={{ backgroundImage: 'repeating-linear-gradient(180deg, #fff 0 1px, transparent 1px 4px)' }}
            />
            {!motionOff && (
              <span
                className="pointer-events-none absolute -inset-x-1/3 top-0 h-full w-1/3 animate-sweep bg-gradient-to-r from-transparent via-white/10 to-transparent"
                style={{ animationDuration: '3.6s', animationIterationCount: 'infinite' }}
              />
            )}
            {/* Pointer-tracked glare: stays inside the face so it can never
                add scroll height or drift away from the card. */}
            {!motionOff && glare.active && (
              <span
                className="pointer-events-none absolute inset-0 mix-blend-screen"
                style={{
                  background: `radial-gradient(240px circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,.14), transparent 62%)`,
                }}
              />
            )}

            <div className="relative z-10 flex w-full items-center justify-between px-5 pt-5">
              <span className="label text-[9px] text-violet-200/70">classified</span>
              <Glyph name="lock" size={15} className="text-violet-300/70" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
              <motion.div
                animate={motionOff ? {} : { scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 2.6, repeat: Infinity }}
                className="grid h-16 w-16 place-items-center rounded-full border border-cyan-300/45 bg-cyan-400/10 shadow-neon-cyan"
              >
                <Glyph name="eye" size={26} className="text-cyan-200" />
              </motion.div>
              <p className="font-display text-[15px] tracking-[.24em] text-violet-50">TAP TO REVEAL</p>
              <p className="max-w-[220px] text-[11.5px] leading-relaxed text-violet-200/55">
                Hold the screen close. Nobody else should see this.
              </p>
            </div>

            <div className="relative z-10 w-full px-5 pb-5">
              <div className="rounded-lg border border-violet-400/25 bg-black/40 px-3 py-2 text-center">
                <p className="label text-[8.5px] opacity-70">player</p>
                <p className="truncate font-display text-[12px] tracking-[.14em] text-cyan-100">{playerName || 'Player'}</p>
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------- BACK */}
          <div
            className="backface-hidden absolute inset-0 flex flex-col items-center justify-between overflow-hidden clip-hud"
            style={{
              transform: 'rotateY(180deg)',
              background: isImposter
                ? 'linear-gradient(158deg, #3A0327 0%, #1B0120 52%, #0A0013 100%)'
                : 'linear-gradient(158deg, #062B3A 0%, #12012B 52%, #0A0018 100%)',
              border: `1px solid ${accent.border}`,
              boxShadow: `0 34px 90px -28px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,.08)`,
            }}
          >
            <span className="pointer-events-none absolute inset-[6px] rounded-[10px]" style={{ border: `1px solid ${accent.border}`, opacity: 0.35 }} />
            {!motionOff && (
              <span
                className="pointer-events-none absolute -inset-x-1/3 top-0 h-full w-1/3 animate-sweep"
                style={{
                  background: `linear-gradient(105deg, transparent, ${accent.glow}, transparent)`,
                  animationDuration: '2.8s',
                  animationIterationCount: 'infinite',
                  opacity: 0.5,
                }}
              />
            )}

            <div className="relative z-10 w-full px-5 pt-5">
              <p className="label text-[9px]" style={{ color: accent.text }}>
                {isImposter ? 'imposter clearance' : 'crew clearance'}
              </p>
            </div>

            <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
              {isImposter ? (
                <>
                  <Glyph name="skull" size={46} className="text-fuchsia-300 animate-pulse" />
                  <p className="font-display text-[20px] leading-tight tracking-[.12em] text-white text-magenta-glow">
                    YOU ARE THE
                    <br />
                    IMPOSTER
                  </p>
                  <p className="max-w-[240px] text-[12px] leading-relaxed text-fuchsia-100/80">
                    You do not get the word. Bluff a clue, mirror the crew, survive the vote.
                  </p>
                  {showDecoy && secret?.decoy && (
                    <div className="mt-1 rounded-xl border border-fuchsia-400/40 bg-black/40 px-4 py-2.5">
                      <p className="label text-[8.5px] text-fuchsia-200/80">cover word you may use</p>
                      <p className="mt-1 font-display text-[15px] tracking-[.1em] text-fuchsia-100">{secret.decoy}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="label text-[10px] text-cyan-200/80">your secret word</p>
                  <motion.p
                    initial={motionOff ? {} : { opacity: 0, scale: 0.9, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    transition={{ delay: motionOff ? 0 : 0.16, duration: 0.5 }}
                    className="font-display text-[clamp(26px,9vw,38px)] leading-tight tracking-[.06em] text-white text-cyan-glow"
                  >
                    {secret?.word || '—'}
                  </motion.p>
                  {secret?.categoryName && (
                    <p className="rounded-full border border-cyan-400/35 px-3 py-1 text-[10.5px] uppercase tracking-[.2em] text-cyan-100/80">
                      {secret.categoryName}
                    </p>
                  )}
                  <p className="max-w-[250px] text-[12px] leading-relaxed text-cyan-100/70">
                    Give one clue that proves you know it — without handing it to the imposter.
                  </p>
                </>
              )}
            </div>

            <div className="relative z-10 w-full px-5 pb-5">
              <div className="rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-center">
                <p className="label text-[8.5px] opacity-70">remember it, then hide</p>
                <p className="mt-0.5 text-[11px] text-violet-100/70">Tap the card to hide your secret</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {footerHint && <p className="mt-4 text-center text-[11.5px] text-violet-200/50">{footerHint}</p>}
    </div>
  )
}

export default SecretCard
