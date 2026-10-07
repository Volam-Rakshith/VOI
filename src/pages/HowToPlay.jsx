/** HowToPlay — an animated, visual walkthrough of the game loop. */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ROUTES } from '../data/constants.js'
import { Button } from '../components/ui/Button.jsx'
import { Badge, Glyph, ScreenShell, ScreenHeader } from '../components/ui/Layout.jsx'
import { Panel, PanelBody } from '../components/ui/Panel.jsx'
import { useSettings } from '../context/SettingsContext.jsx'

const STEPS = [
  {
    id: 'players',
    title: 'Add players',
    body: 'Two to twenty players on one device in pass & play, or three to twenty with each player on their own phone in an online room. Names are checked for duplicates as you type.',
    glyph: 'users',
    demo: 'roster',
  },
  {
    id: 'deal',
    title: 'Everyone gets a secret',
    body: 'The crew all receive the same secret word. The imposter receives nothing but an optional cover word — so they have to bluff.',
    glyph: 'eye',
    demo: 'cards',
  },
  {
    id: 'hide',
    title: 'Reveal it, then hide it',
    body: 'Pass the device around. Your card only shows its secret while it is flipped, and it locks itself again before the next player looks.',
    glyph: 'lock',
    demo: 'flip',
  },
  {
    id: 'clues',
    title: 'Give one clue each',
    body: 'Take turns saying a single word that proves you know the secret — without handing it to the imposter. The timer keeps everyone honest.',
    glyph: 'bolt',
    demo: 'timer',
  },
  {
    id: 'discuss',
    title: 'Discuss it out',
    body: 'This is the game. Who was too vague? Who echoed someone else? Imposters can use their cover word, but they cannot fake knowing the real one.',
    glyph: 'users',
    demo: 'discuss',
  },
  {
    id: 'vote',
    title: 'Vote in secret',
    body: 'Ballots are cast one device at a time and stay hidden until every player has voted. Then the counts land, bar by bar.',
    glyph: 'skull',
    demo: 'vote',
  },
  {
    id: 'find',
    title: 'One player leaves',
    body: 'The vote removes a single player, and nobody is told which side they were on. The game keeps going — a tie removes nobody at all.',
    glyph: 'eye',
    demo: 'find',
  },
  {
    id: 'guess',
    title: 'Caught? One guess',
    body: 'If the player who leaves is an imposter, they get one private guess at the crew\'s word. Name it and the imposters take everything — miss it and they are simply gone.',
    glyph: 'lock',
    demo: 'find',
  },
  {
    id: 'win',
    title: 'End the game',
    body: 'The game runs until one side has nobody left. No round limit, no single-vote finish: remove every imposter and the crew wins, outlast the crew and the imposters do. Roles are revealed only here, once it is over.',
    glyph: 'spark',
    demo: 'win',
  },
]

function Demo({ kind }) {
  const { motionOff } = useSettings()
  const tween = (delay = 0) => ({ duration: motionOff ? 0 : 0.6, delay: motionOff ? 0 : delay, repeat: motionOff ? 0 : Infinity, repeatDelay: motionOff ? 0 : 1.6, repeatType: 'reverse' })

  if (kind === 'roster') {
    return (
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <motion.span
            key={i}
            className="h-8 rounded-lg border border-cyan-400/35 bg-cyan-500/10"
            animate={{ opacity: motionOff ? 1 : [0.3, 1] }}
            transition={tween(i * 0.12)}
          />
        ))}
      </div>
    )
  }
  if (kind === 'cards') {
    return (
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2, 3].map((i) => {
          const imposter = i === 2
          return (
            <motion.span
              key={i}
              className={`grid h-16 w-11 place-items-center rounded-md border text-[9px] ${
                imposter ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100' : 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
              }`}
              animate={{ y: motionOff ? 0 : [0, -6, 0] }}
              transition={{ duration: 2.2, delay: i * 0.18, repeat: motionOff ? 0 : Infinity }}
            >
              {imposter ? 'IMP' : 'CREW'}
            </motion.span>
          )
        })}
      </div>
    )
  }
  if (kind === 'flip') {
    return (
      <div className="flex items-center justify-center">
        <motion.div
          className="preserve-3d relative h-24 w-16"
          animate={{ rotateY: motionOff ? 180 : [0, 180, 180, 0] }}
          transition={{ duration: 4.4, repeat: motionOff ? 0 : Infinity, times: [0, 0.25, 0.75, 1] }}
        >
          <span className="backface-hidden absolute inset-0 grid place-items-center rounded-md border border-violet-400/45 bg-violet-900/50 text-[8px] text-violet-100">
            TAP
          </span>
          <span
            className="backface-hidden absolute inset-0 grid place-items-center rounded-md border border-cyan-300/60 bg-cyan-500/15 text-[9px] text-cyan-50"
            style={{ transform: 'rotateY(180deg)' }}
          >
            SECRET
          </span>
        </motion.div>
      </div>
    )
  }
  if (kind === 'timer') {
    return (
      <div className="flex items-center justify-center gap-2">
        {['P1', 'P2', 'P3', 'P4'].map((seat, i) => (
          <motion.span
            key={seat}
            className="grid h-11 w-11 place-items-center rounded-full border border-cyan-400/40 bg-black/40 text-[10px] text-cyan-100"
            animate={{ scale: motionOff ? 1 : [1, 1.14, 1], borderColor: ['rgba(34,211,238,.4)', 'rgba(255,43,209,.75)', 'rgba(34,211,238,.4)'] }}
            transition={{ duration: 2.4, delay: i * 0.6, repeat: motionOff ? 0 : Infinity }}
          >
            {seat}
          </motion.span>
        ))}
      </div>
    )
  }
  if (kind === 'discuss') {
    return (
      <div className="space-y-2">
        {['“It melts in the sun.”', '“It comes in a cone.”', '“It is a topping… mostly.”'].map((line, i) => (
          <motion.div
            key={line}
            className={`max-w-[86%] rounded-2xl border px-3 py-2 text-[11.5px] ${
              i === 2 ? 'ml-auto border-fuchsia-400/45 bg-fuchsia-500/12 text-fuchsia-50' : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-50'
            }`}
            animate={{ opacity: motionOff ? 1 : [0.35, 1] }}
            transition={tween(i * 0.25)}
          >
            {line}
          </motion.div>
        ))}
      </div>
    )
  }
  if (kind === 'find') {
    return (
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className={`grid h-12 w-12 place-items-center rounded-xl border text-[9.5px] ${
              i === 1 ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100' : 'border-cyan-400/35 bg-cyan-500/8 text-cyan-100/70'
            }`}
            animate={{ opacity: motionOff ? 1 : i === 1 ? [0.4, 1] : [1, 0.45] }}
            transition={{ duration: 2.4, delay: i * 0.2, repeat: motionOff ? 0 : Infinity, repeatType: 'reverse' }}
          >
            {i === 1 ? 'IMP' : 'CREW'}
          </motion.span>
        ))}
      </div>
    )
  }
  if (kind === 'vote') {
    return (
      <div className="space-y-1.5">
        {[3, 5, 1].map((votes, i) => (
          <div key={i} className="h-2.5 overflow-hidden rounded-full bg-black/45">
            <motion.div
              className="h-full rounded-full"
              style={{ background: i === 0 ? 'linear-gradient(90deg,#ff2bd1,#ff5fa2)' : 'linear-gradient(90deg,#22d3ee,#a855f7)' }}
              animate={{ width: motionOff ? `${votes * 18}%` : ['0%', `${votes * 18}%`] }}
              transition={tween(i * 0.2)}
            />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center gap-3">
      <motion.span
        className="font-display text-[15px] tracking-[.16em] text-cyan-glow"
        animate={{ opacity: motionOff ? 1 : [0.5, 1] }}
        transition={tween()}
      >
        TEAM WINS
      </motion.span>
      <motion.span
        className="font-display text-[15px] tracking-[.16em] text-magenta-glow"
        animate={{ opacity: motionOff ? 0.6 : [1, 0.35] }}
        transition={tween(0.2)}
      >
        IMPOSTER WINS
      </motion.span>
    </div>
  )
}

export function HowToPlay({ onNavigate }) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]

  return (
    <ScreenShell>
      <ScreenHeader title="How to play" eyebrow="tutorial" onBack={() => onNavigate(ROUTES.home)} right={<Badge tone="cyan">{step + 1}/{STEPS.length}</Badge>} />

      <div className="shell-narrow flex-1 space-y-4 pb-6">
        <div className="glass clip-hud relative overflow-hidden px-4 py-5">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-neon/70 to-transparent" />
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.28 }}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/45 bg-cyan-500/10 text-cyan-100">
                  <Glyph name={current.glyph} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="label text-[9px]">step {step + 1}</p>
                  <h2 className="font-display text-[15px] tracking-[.1em] text-violet-50">{current.title}</h2>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-violet-100/75">{current.body}</p>
              <div className="mt-5 rounded-xl border border-violet-500/20 bg-black/30 p-4">
                <Demo kind={current.demo} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" fullWidth disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" size="sm" fullWidth onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next
            </Button>
          ) : (
            <Button variant="primary" size="sm" fullWidth onClick={() => onNavigate(ROUTES.local)}>
              Start playing
            </Button>
          )}
        </div>

        <div className="flex justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to step ${i + 1}: ${s.title}`}
              aria-current={i === step}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-cyan-300' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>

        <Panel>
          <PanelBody className="space-y-3">
            <h3 className="font-display text-[12px] tracking-[.18em] text-violet-50">HOUSE RULES</h3>
            <ul className="space-y-2 text-[12.5px] leading-relaxed text-violet-100/70">
              <li>• One clue per player, per round. One word is best.</li>
              <li>• Never repeat someone else's clue — that is how imposters hide.</li>
              <li>• No spelling, no rhyming, no saying the category out loud.</li>
              <li>• Imposters can use their cover word, or invent something vague and confident.</li>
              <li>• A split vote removes nobody — the round simply starts again.</li>
              <li>• Nobody learns a role from a single vote. Roles are revealed only when the game ends.</li>
            </ul>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/8 px-3 py-2.5">
                <p className="label text-[9px]">the end</p>
                <p className="mt-1 text-[11.5px] leading-snug text-cyan-100/80">
                  Last side standing. Caught imposters still get one guess at the word.
                </p>
              </div>
              <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/8 px-3 py-2.5">
                <p className="label text-[9px]">chaos rounds</p>
                <p className="mt-1 text-[11.5px] leading-snug text-fuchsia-100/80">
                  Every few rounds the deal is re-rolled — nobody an imposter, several, or the whole table.
                </p>
              </div>
            </div>
          </PanelBody>
        </Panel>
      </div>
    </ScreenShell>
  )
}

export default HowToPlay
