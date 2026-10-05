/**
 * WinnerScreen — the cinematic end-of-game payoff.
 * Crew victory: confetti, glow burst, celebratory lift.
 * Imposter victory: glitch, screen shake, magenta pulse.
 */

import { useEffect, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Badge, Glyph } from '../ui/Layout.jsx'
import { crewVictoryCanvases, imposterVictoryCanvases, stopConfetti } from '../../lib/confetti.js'
import { playSfx } from '../../lib/sound.js'
import { useSettings } from '../../context/SettingsContext.jsx'

export function WinnerScreen({
  winner, // 'crew' | 'imposter'
  reason = '',
  word = null,
  players = [],
  round = 1,
  onPlayAgain,
  onNextRound = null,
  onExit,
  exitLabel = 'Main menu',
  children,
}) {
  const crewWon = winner === 'crew'
  const { motionOff, settings } = useSettings()
  const celebrated = useRef(false)

  useEffect(() => {
    if (celebrated.current) return
    celebrated.current = true
    const intensity = settings.intensity === 0 ? 0.6 : settings.intensity === 2 ? 1.4 : 1
    if (crewWon) {
      crewVictoryCanvases(intensity)
      playSfx('victory')
    } else {
      imposterVictoryCanvases(intensity)
      playSfx('defeat')
    }
    return () => stopConfetti()
  }, [crewWon, settings.intensity])

  const revealed = useMemo(() => players.filter((p) => p.role), [players])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`relative flex flex-1 flex-col items-center justify-center gap-5 px-4 py-8 safe-t safe-b ${
        !crewWon && !motionOff ? 'shake' : ''
      }`}
    >
      {/* Victory backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: crewWon
            ? 'radial-gradient(700px 420px at 50% 30%, rgba(34,211,238,.24), transparent 68%), radial-gradient(600px 380px at 20% 90%, rgba(168,85,247,.22), transparent 70%)'
            : 'radial-gradient(700px 420px at 50% 30%, rgba(255,43,209,.26), transparent 68%), radial-gradient(600px 400px at 80% 88%, rgba(127,29,63,.35), transparent 72%)',
        }}
      />
      {!crewWon && !motionOff && (
        <>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scanline bg-gradient-to-b from-fuchsia-400/12 to-transparent" />
          <span className="pointer-events-none absolute inset-0 opacity-[.07]" style={{ backgroundImage: 'repeating-linear-gradient(180deg,#fff 0 2px, transparent 2px 5px)' }} />
        </>
      )}

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        className="text-center"
      >
        <Badge tone={crewWon ? 'cyan' : 'magenta'}>{crewWon ? 'crew secured' : 'deception complete'}</Badge>
        <h1
          className={`mt-4 font-display text-[clamp(2rem,11vw,3.4rem)] leading-none tracking-[.08em] ${
            crewWon ? 'text-cyan-glow' : 'text-magenta-glow'
          } ${!crewWon && !motionOff ? 'animate-glitch' : ''}`}
        >
          {crewWon ? 'TEAM WINS' : 'IMPOSTER WINS'}
        </h1>
        <p className="mt-3 font-display text-[12.5px] tracking-[.2em] text-violet-100/85">
          {crewWon ? 'THE IMPOSTER WAS CAUGHT' : 'YOU WERE FOOLED'}
        </p>
        {reason && <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-violet-200/60">{reason}</p>}
      </motion.div>

      <div className="w-full max-w-md space-y-3">
        {word && (
          <div className="glass clip-hud px-4 py-3 text-center">
            <p className="label text-[9px]">the secret word was</p>
            <p className="mt-1 font-display text-[22px] tracking-[.08em] text-white text-neon">{word}</p>
          </div>
        )}

        {children}

        {revealed.length > 0 && (
          <div className="glass clip-hud max-h-[38vh] overflow-y-auto px-3.5 py-3">
            <p className="label mb-2 text-[9px]">everyone's role</p>
            <ul className="space-y-1.5">
              {revealed.map((player, i) => {
                const imp = player.role === 'imposter'
                return (
                  <motion.li
                    key={player.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/20 bg-black/30 px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Glyph name={imp ? 'skull' : 'eye'} size={13} className={imp ? 'text-fuchsia-300' : 'text-cyan-300'} />
                      <span className="truncate font-display text-[12px] tracking-[.08em] text-violet-50">{player.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {!player.alive && <Badge tone="muted">out · r{player.eliminatedRound || '—'}</Badge>}
                      <Badge tone={imp ? 'magenta' : 'cyan'}>{imp ? 'imposter' : 'crew'}</Badge>
                    </span>
                  </motion.li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
        {onNextRound && (
          <Button variant="primary" fullWidth onClick={onNextRound}>
            Next round
          </Button>
        )}
        {onPlayAgain && (
          <Button variant={onNextRound ? 'ghost' : 'primary'} fullWidth onClick={onPlayAgain}>
            Play again
          </Button>
        )}
        <Button variant="ghost" fullWidth onClick={onExit}>
          {exitLabel}
        </Button>
      </div>

      <p className="font-mono text-[10px] tracking-wider text-violet-200/40">round {round} · {crewWon ? 'crew victory' : 'imposter victory'}</p>
    </motion.div>
  )
}

export default WinnerScreen
