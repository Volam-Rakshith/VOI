/**
 * CountdownRing — animated circular turn timer.
 * Three escalating visual states (normal → warning ≤10s → critical ≤5s) plus
 * colour, pulse and a "time up" flare. Audio is optional and off by default.
 */

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettings } from '../../context/SettingsContext.jsx'
import { playSfx } from '../../lib/sound.js'

export function CountdownRing({
  secondsLeft = 30,
  duration = 30,
  running = false,
  size = 216,
  label = 'seconds',
  onComplete,
  muted = false,
}) {
  const { motionOff } = useSettings()
  const firedRef = useRef(new Set())
  const completeRef = useRef(false)

  const progress = Math.max(0, Math.min(1, duration ? secondsLeft / duration : 0))
  const critical = secondsLeft <= 5 && secondsLeft > 0
  const warning = secondsLeft <= 10 && secondsLeft > 5
  const finished = secondsLeft <= 0

  const stroke = critical ? '#ff2bd1' : warning ? '#facc15' : '#22d3ee'
  const glow = critical ? 'rgba(255,43,209,.55)' : warning ? 'rgba(250,204,21,.45)' : 'rgba(34,211,238,.45)'

  const radius = (size - 22) / 2
  const circumference = 2 * Math.PI * radius

  /* Ticking cues: one per second under 10s, then a "time up" sting. */
  useEffect(() => {
    if (muted || !running) return
    if (secondsLeft <= 10 && secondsLeft > 0 && !firedRef.current.has(secondsLeft)) {
      firedRef.current.add(secondsLeft)
      playSfx(secondsLeft <= 5 ? 'warning' : 'tick')
    }
    if (secondsLeft <= 0 && !completeRef.current) {
      completeRef.current = true
      playSfx('timeUp')
      onComplete?.()
    }
  }, [secondsLeft, running, muted, onComplete])

  useEffect(() => {
    if (running) {
      completeRef.current = false
      if (secondsLeft > 10) firedRef.current.clear()
    }
  }, [running, secondsLeft])

  return (
    <div className="flex flex-col items-center">
      <motion.div
        className="relative"
        style={{ width: size, height: size }}
        animate={
          motionOff
            ? {}
            : critical && running
              ? { scale: [1, 1.035, 1] }
              : warning && running
                ? { scale: [1, 1.018, 1] }
                : { scale: 1 }
        }
        transition={{ duration: critical ? 0.55 : 1, repeat: critical && running ? Infinity : 0 }}
      >
        {/* ambient glow disc */}
        <div
          className="absolute inset-3 rounded-full"
          style={{ boxShadow: `inset 0 0 60px ${glow}, 0 0 40px -12px ${glow}` }}
        />
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative -rotate-90">
          <defs>
            <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="55%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ff2bd1" />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(168,85,247,.18)" strokeWidth="10" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: 'stroke-dashoffset .35s linear, stroke .3s ease', filter: `drop-shadow(0 0 8px ${glow})` }}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={secondsLeft}
              initial={{ opacity: 0, y: motionOff ? 0 : -10, scale: motionOff ? 1 : 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: motionOff ? 0 : 12, scale: motionOff ? 1 : 0.94 }}
              transition={{ duration: motionOff ? 0 : 0.2 }}
              className="font-display text-[clamp(2.6rem,12vw,3.4rem)] leading-none tabular"
              style={{ color: critical ? '#ffd6f6' : warning ? '#fde68a' : '#e9feff', textShadow: `0 0 18px ${glow}` }}
            >
              {Math.max(0, Math.ceil(secondsLeft))}
            </motion.span>
          </AnimatePresence>
          <span className="label mt-1 text-[9px] opacity-70">{finished ? 'time up' : label}</span>
        </div>

        {critical && running && !motionOff && (
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-fuchsia-400/45" />
        )}
      </motion.div>
    </div>
  )
}

export default CountdownRing
