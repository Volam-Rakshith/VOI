/**
 * SplashScreen — 1.6s cinematic open: studio mark, glitch, neon sweep, then a
 * smooth hand-off to the main menu.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BRAND } from '../../data/constants.js'
import { useSettings } from '../../context/SettingsContext.jsx'
/*
 * The mark only — <Logo> also renders the studio line and the IMPOSTER wordmark,
 * and this screen prints both of those itself right below (the name used to
 * appear twice, reading "IMPOSTER IMPOSTER").
 */
import { StudioMark } from '../ui/Logo.jsx'

/** The name, split so each letter can be revealed on its own beat. */
const NAME_LETTERS = BRAND.game.split('')

export function SplashScreen({ onDone, duration = 1600 }) {
  const { motionOff } = useSettings()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 260),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => onDone?.(), motionOff ? 700 : duration),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone, duration, motionOff])

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(14px)', scale: 1.04 }}
      transition={{ duration: motionOff ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ background: 'radial-gradient(900px 600px at 50% 40%, #1B0440 0%, #0B001A 60%, #050008 100%)' }}
    >
      <div className="relative flex flex-col items-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.86, y: 18, filter: 'blur(16px)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: motionOff ? 0 : 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <StudioMark size={58} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 10 }}
          transition={{ duration: motionOff ? 0 : 0.6 }}
          className="mt-6 space-y-2"
        >
          <p className="label text-[10px] text-cyan-200/80">{BRAND.studio}</p>
          {/*
            * The name is typed out one letter at a time — each letter drops in,
            * unblurs and settles on its own beat, then the whole word takes the
            * flicker. The h1 carries the readable label so assistive tech hears
            * "IMPOSTER" rather than a list of letters.
            */}
          <h1
            aria-label={BRAND.game}
            className={`font-display text-[clamp(2.4rem,13vw,4.6rem)] leading-none tracking-[.14em] text-neon ${
              phase >= 1 && !motionOff ? 'animate-flicker' : ''
            }`}
          >
            {NAME_LETTERS.map((letter, index) => (
              <motion.span
                key={`${letter}-${index}`}
                aria-hidden="true"
                className="inline-block"
                initial={motionOff ? false : { opacity: 0, y: 18, scale: 0.88, filter: 'blur(14px)' }}
                animate={
                  phase >= 1
                    ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
                    : { opacity: 0, y: 18, scale: 0.88, filter: 'blur(14px)' }
                }
                transition={{
                  duration: motionOff ? 0 : 0.46,
                  delay: motionOff ? 0 : 0.075 * index,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {letter === ' ' ? '\u00A0' : letter}
              </motion.span>
            ))}
          </h1>
          {/* A hairline that draws itself under the name as the last letter lands. */}
          <motion.span
            aria-hidden="true"
            className="mx-auto block h-[2px] rounded-full"
            style={{
              background:
                'linear-gradient(90deg, rgba(34,211,238,0), #22d3ee, #a855f7, #ff2bd1, rgba(255,43,209,0))',
            }}
            initial={motionOff ? { width: '78%', opacity: 0.85 } : { width: 0, opacity: 0 }}
            animate={phase >= 1 ? { width: '78%', opacity: 0.85 } : undefined}
            transition={{
              duration: motionOff ? 0 : 0.7,
              delay: motionOff ? 0 : 0.075 * (NAME_LETTERS.length - 1) + 0.08,
              ease: 'easeInOut',
            }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase >= 2 ? 1 : 0 }}
          transition={{ duration: motionOff ? 0 : 0.4 }}
          className="mt-7 w-56"
        >
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg,#22d3ee,#a855f7,#ff2bd1)' }}
              initial={{ width: '8%' }}
              animate={{ width: '100%' }}
              transition={{ duration: motionOff ? 0 : 1.05, ease: 'easeInOut' }}
            />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[.4em] text-violet-200/60">initialising</p>
        </motion.div>
      </div>

      {/* Neon sweep + vignette */}
      {!motionOff && (
        <span
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-sweep"
          style={{
            background: 'linear-gradient(105deg, transparent, rgba(255,255,255,.16), transparent)',
            animationDuration: '1.4s',
          }}
        />
      )}
      <div className="noise-plate pointer-events-none absolute inset-0 opacity-[.06]" />
    </motion.div>
  )
}

export default SplashScreen
