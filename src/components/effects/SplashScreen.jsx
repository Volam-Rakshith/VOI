/**
 * SplashScreen — the cinematic open.
 *
 * Beat sheet (about 2.6 s, then a blurred hand-off to the menu):
 *   • 0.00 — the frame glitch-slices twice and a neon horizon snaps in
 *   • 0.22 — the grid floor warps at the camera; a targeting reticle spins up
 *     around the studio mark, which punches in
 *   • 0.30 — speed streaks rip diagonally across the frame
 *   • 0.50 — "VOTE OUT" flies in from both sides, letter by letter
 *   • 1.05 — "IMPOSTER" slams down letter by letter: white flash, triple
 *     shockwave, sparks, and the whole screen takes the hit (shake)
 *   • 1.75 — a boot log ticks out: link, deck, crew
 *   • 2.05 — the loading bar finishes and the whole thing blurs out
 *
 * Mobile rule (learned the hard way): the headline is sized so all eight
 * letters fit a 320-px-wide phone on ONE line — the clamp keeps the cap low
 * and the line is nowrap, so it can never split a word mid-letter again.
 *
 * Everything is transform/opacity only (no layout thrash) and every animation
 * is short-circuited by the reduced-motion setting.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BRAND } from '../../data/constants.js'
import { useSettings } from '../../context/SettingsContext.jsx'
/* The mark only — <Logo> also renders the studio line and the wordmark, and this
   screen prints those itself (the name once read "IMPOSTER IMPOSTER"). */
import { StudioMark } from '../ui/Logo.jsx'

/** Title split into lines of letters, with a running index for the stagger. */
const TITLE_WORDS = BRAND.game.split(' ').filter(Boolean)
const TITLE = TITLE_WORDS.map((word, wordIndex) => ({
  word,
  headline: wordIndex === TITLE_WORDS.length - 1,
  letters: word.split('').map((letter, letterIndex) => ({
    letter,
    index: wordIndex === TITLE_WORDS.length - 1 ? letterIndex : TITLE_WORDS.slice(0, wordIndex).join('').length + wordIndex + letterIndex,
  })),
}))
const LEAD_WORDS = TITLE_WORDS.slice(0, -1).join(' ')
const HEAD_WORD = TITLE_WORDS[TITLE_WORDS.length - 1]
const LETTER_COUNT = TITLE_WORDS.join('').length
const STAGGER = 0.06
/** When the headline lands — sparks, flash, shake and shockwave fire on this beat. */
const IMPACT_AT = 0.5

/** Deterministic spark fan (no Math.random in render). */
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + 0.35
  const distance = 90 + (i % 5) * 26
  return {
    sx: `${Math.round(Math.cos(angle) * distance)}px`,
    sy: `${Math.round(Math.sin(angle) * distance * 0.72)}px`,
    delay: 0.02 * (i % 6),
    size: i % 3 === 0 ? 4 : 3,
    hot: i % 4 === 1,
  }
})

/** Speed streaks: fixed lanes across the frame, deterministic offsets. */
const STREAKS = Array.from({ length: 8 }, (_, i) => ({
  top: `${6 + i * 11.5}%`,
  delay: 0.28 + (i % 4) * 0.11 + i * 0.03,
  width: `${16 + (i % 3) * 9}%`,
  magenta: i % 3 === 1,
}))

/** The boot log that types itself out under the loading bar. */
const BOOT_LOG = [
  { text: 'link … established', at: 0 },
  { text: 'word deck … shuffled', at: 1 },
  { text: 'crew … syncing seats', at: 2 },
]

export function SplashScreen({ onDone, duration = 2600 }) {
  const { motionOff } = useSettings()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [setTimeout(() => setPhase(1), 220), setTimeout(() => setPhase(2), 900), setTimeout(() => setPhase(3), 1750), setTimeout(() => onDone?.(), motionOff ? 700 : duration)]
    return () => timers.forEach(clearTimeout)
  }, [onDone, duration, motionOff])

  const letterFrom = (index) => (index % 2 === 0 ? -1 : 1)

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(16px)', scale: 1.06 }}
      style={{ background: 'radial-gradient(1000px 620px at 50% 38%, #1B0440 0%, #0B001A 58%, #040007 100%)' }}
    >
      {/* ---- glitch slices: two hard light bars snap across, then are gone --- */}
      {!motionOff &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[-10%] h-[3px]"
            style={{ top: `${30 + i * 34}%`, background: i ? 'rgba(255,43,209,.85)' : 'rgba(34,211,238,.85)', filter: 'blur(1px)' }}
            initial={{ opacity: 0, x: '-14%' }}
            animate={{ opacity: [0, 0.9, 0, 0.55, 0], x: ['-14%', '12%', '12%', '-8%', '10%'] }}
            transition={{ duration: 0.34, delay: 0.04 + i * 0.07, times: [0, 0.2, 0.4, 0.6, 1], ease: 'easeOut' }}
          />
        ))}

      {/* ---- warp floor: a neon grid rushing at the camera ---------------- */}
      {!motionOff && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] overflow-hidden [perspective:420px]">
          <div className="absolute inset-x-[-40%] bottom-[-10%] top-0 animate-warp bg-grid-neon bg-grid opacity-[.55]" style={{ transformOrigin: '50% 100%' }} />
        </div>
      )}

      {/* ---- speed streaks tearing across the frame ------------------------ */}
      {!motionOff && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {STREAKS.map((streak, i) => (
            <motion.span
              key={i}
              className="absolute h-px origin-left"
              style={{
                top: streak.top,
                width: streak.width,
                background: `linear-gradient(90deg, transparent, ${streak.magenta ? 'rgba(255,43,209,.75)' : 'rgba(34,211,238,.75)'}, transparent)`,
                transform: 'skewY(-7deg)',
              }}
              initial={{ opacity: 0, x: '-30vw', scaleX: 0.2 }}
              animate={{ opacity: [0, 0.9, 0], x: '115vw', scaleX: 1 }}
              transition={{ duration: 0.85, delay: streak.delay, ease: 'easeIn' }}
            />
          ))}
        </div>
      )}

      {/* ---- conic burst behind the mark ---------------------------------- */}
      <motion.div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[38%] h-[720px] w-[720px] -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 0 }} animate={{ opacity: phase >= 1 ? (motionOff ? 0.5 : 0.75) : 0 }} transition={{ duration: motionOff ? 0 : 1 }}>
        <div
          className={`h-full w-full rounded-full ${motionOff ? '' : 'animate-spin-slow'}`}
          style={{
            background: 'conic-gradient(from 0deg, rgba(34,211,238,.22), transparent 18%, rgba(168,85,247,.24) 42%, transparent 58%, rgba(255,43,209,.2) 78%, transparent 92%)',
            filter: 'blur(42px)',
            maskImage: 'radial-gradient(circle, black 0%, black 42%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(circle, black 0%, black 42%, transparent 70%)',
          }}
        />
      </motion.div>

      {/* ---- impact flash ------------------------------------------------- */}
      {!motionOff && <span className="pointer-events-none absolute inset-0 animate-flash bg-[radial-gradient(600px_400px_at_50%_46%,rgba(255,255,255,.55),transparent_70%)]" style={{ animationDelay: `${IMPACT_AT + 0.55}s`, opacity: 0 }} />}

      {/* ---- shockwave rings: cyan, magenta, cyan again ------------------- */}
      {!motionOff && [0, 0.14, 0.27].map((offset, i) => <span key={offset} aria-hidden="true" className={`pointer-events-none absolute left-1/2 top-[46%] h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 animate-ring rounded-full border-2 ${i === 1 ? 'border-fuchsia-300/55' : 'border-cyan-300/60'}`} style={{ animationDelay: `${IMPACT_AT + 0.62 + offset}s`, opacity: 0 }} />)}

      {/* ---- sparks -------------------------------------------------------- */}
      {!motionOff && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[46%]">
          {SPARKS.map((spark, i) => (
            <span
              key={i}
              className={`absolute animate-spark rounded-full ${spark.hot ? 'bg-fuchsia-200' : 'bg-cyan-200'}`}
              style={{
                width: spark.size,
                height: spark.size,
                '--sx': spark.sx,
                '--sy': spark.sy,
                animationDelay: `${IMPACT_AT + 0.62 + spark.delay}s`,
                opacity: 0,
                boxShadow: spark.hot ? '0 0 10px rgba(255,43,209,.9)' : '0 0 10px rgba(34,211,238,.9)',
              }}
            />
          ))}
        </span>
      )}

      {/* ---- the title block -----------------------------------------------
          px-4 + a low clamp cap + nowrap: "IMPOSTER" fits one line from a
          320-px phone up, in landscape included — the old 13.5vw cap let the
          eight letters wrap and split mid-word on narrow screens. */}
      <motion.div
        className="relative flex flex-col items-center px-4 py-6 text-center"
        animate={motionOff ? {} : { x: phase >= 2 ? [0, -8, 7, -4, 3, 0] : 0 }}
        transition={motionOff ? { duration: 0 } : { duration: 0.42, delay: IMPACT_AT + 0.5, ease: 'easeOut' }}
      >
        <motion.div className="relative" initial={motionOff ? false : { opacity: 0, scale: 0.72, y: 26, filter: 'blur(20px)' }} animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: motionOff ? 0 : 0.8, ease: [0.16, 1, 0.3, 1], delay: motionOff ? 0 : 0.16 }}>
          {/* targeting reticle — dashed ring that spins up around the mark */}
          {!motionOff && (
            <motion.span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 block h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2" animate={{ opacity: phase >= 1 ? 0.8 : 0, rotate: 120 }} transition={{ opacity: { duration: 0.5 }, rotate: { duration: 12, ease: 'linear' } }}>
              <svg viewBox="0 0 104 104" className="h-full w-full">
                <circle cx="52" cy="52" r="49" fill="none" stroke="rgba(34,211,238,.5)" strokeWidth="1" strokeDasharray="10 6 2 6" />
                <circle cx="52" cy="52" r="38" fill="none" stroke="rgba(255,43,209,.28)" strokeWidth="1" strokeDasharray="1 7" />
                <path d="M52 0v9M52 95v9M0 52h9M95 52h9" stroke="rgba(34,211,238,.65)" strokeWidth="1.5" />
              </svg>
            </motion.span>
          )}
          <StudioMark size={62} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 12 }} transition={{ duration: motionOff ? 0 : 0.5 }} className="mt-7 space-y-2.5">
          {/* The title, one letter at a time. The h1 carries the readable label
              so assistive tech hears "VOTE OUT IMPOSTER", not a list of letters. */}
          <h1 aria-label={BRAND.game} className="flex flex-col items-center leading-[.98]">
            {TITLE.map((line) => (
              <span key={line.word} aria-hidden="true" className={line.headline ? `whitespace-nowrap font-display text-[clamp(2.1rem,10.4vw,4.4rem)] tracking-[.11em] text-neon ${phase >= 2 && !motionOff ? 'animate-chroma' : ''}` : 'whitespace-nowrap font-display text-[clamp(.9rem,4.6vw,1.4rem)] tracking-[.4em] text-violet-100/85'}>
                {line.letters.map(({ letter, index }) => (
                  <motion.span
                    key={`${letter}-${index}`}
                    className="inline-block"
                    initial={motionOff ? false : line.headline ? { opacity: 0, y: -34, scale: 1.62, rotateX: -80, filter: 'blur(18px)' } : { opacity: 0, x: 30 * letterFrom(index), filter: 'blur(10px)' }}
                    animate={phase >= 1 ? { opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0, filter: 'blur(0px)' } : undefined}
                    transition={{
                      type: 'spring',
                      stiffness: line.headline ? 320 : 340,
                      damping: line.headline ? 15 : 26,
                      delay: motionOff ? 0 : line.headline ? IMPACT_AT + STAGGER * 0.7 * index : STAGGER * 0.5 * index,
                    }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          {/* A hairline that draws itself under the title as the last letter lands. */}
          <span className="relative mx-auto block h-[2px] w-[78%] max-w-md overflow-hidden rounded-full">
            <motion.span
              className="block h-full w-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, rgba(34,211,238,0), #22d3ee, #a855f7, #ff2bd1, rgba(255,43,209,0))',
              }}
              initial={motionOff ? { scaleX: 1, opacity: 0.85 } : { scaleX: 0, opacity: 0 }}
              animate={phase >= 1 ? { scaleX: 1, opacity: 0.9 } : undefined}
              transition={{
                duration: motionOff ? 0 : 0.75,
                delay: motionOff ? 0 : IMPACT_AT + STAGGER * 0.7 * (HEAD_WORD.length - 1) + 0.1,
                ease: 'easeInOut',
              }}
            />
            {!motionOff && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-y-0 w-16 animate-beam-run"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)',
                  backgroundSize: '200% 100%',
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: phase >= 2 ? 1 : 0 }}
                transition={{ delay: motionOff ? 0 : 1.35, duration: 0.4 }}
              />
            )}
          </span>

          <motion.p className="label text-[10px] text-cyan-200/80" initial={motionOff ? false : { opacity: 0, y: 8, letterSpacing: '.1em' }} animate={phase >= 1 ? { opacity: 1, y: 0 } : undefined} transition={{ duration: motionOff ? 0 : 0.6, delay: motionOff ? 0 : 1.5 }}>
            by {BRAND.studio}
          </motion.p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: phase >= 2 ? 1 : 0 }} transition={{ duration: motionOff ? 0 : 0.45 }} className="mt-7 w-56 max-w-full">
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#22d3ee,#a855f7,#ff2bd1)' }} initial={{ width: '6%' }} animate={{ width: '100%' }} transition={{ duration: motionOff ? 0 : 1, ease: 'easeInOut', delay: motionOff ? 0 : 0.1 }} />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[.4em] text-violet-200/60">initialising</p>
          {/* boot log — three little lines that land as the bar finishes */}
          <div className="mt-2 space-y-0.5 font-mono text-[9px] uppercase tracking-[.18em] text-cyan-200/45">
            {BOOT_LOG.map((entry, i) => (
              <motion.p key={entry.text} initial={motionOff ? false : { opacity: 0, x: -8 }} animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0 }} transition={{ duration: motionOff ? 0 : 0.25, delay: motionOff ? 0 : 0.05 + entry.at * 0.13 }}>
                <span className="text-fuchsia-300/60">▸</span> {entry.text}
              </motion.p>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* ---- HUD chrome: corner brackets draw themselves in --------------- */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-4 sm:inset-6">
        {[
          { pos: 'left-0 top-0 border-l border-t', axis: 'scaleY' },
          { pos: 'right-0 top-0 border-r border-t', axis: 'scaleY' },
          { pos: 'left-0 bottom-0 border-b border-l', axis: 'scaleY' },
          { pos: 'right-0 bottom-0 border-b border-r', axis: 'scaleY' },
        ].map(({ pos, axis }) => (
          <motion.span key={pos} className={`absolute h-6 w-6 border-cyan-300/35 ${pos}`} initial={motionOff ? false : { opacity: 0, [axis]: 0 }} animate={{ opacity: 1, [axis]: 1 }} transition={{ duration: motionOff ? 0 : 0.5, delay: motionOff ? 0 : 0.12, ease: 'easeOut' }} />
        ))}
      </span>
      {!motionOff && <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[38%] animate-scanline opacity-[.10]" style={{ background: 'linear-gradient(180deg, transparent, #ffffff, transparent)' }} />}

      {/* ---- light sweep across the whole frame ---------------------------- */}
      {!motionOff && (
        <span
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sweep"
          style={{
            background: 'linear-gradient(105deg, transparent, rgba(255,255,255,.10), transparent)',
            animationDuration: '1.6s',
            animationDelay: '0.9s',
          }}
        />
      )}

      <div className="noise-plate pointer-events-none absolute inset-0 opacity-[.06]" />
    </motion.div>
  )
}

export default SplashScreen
