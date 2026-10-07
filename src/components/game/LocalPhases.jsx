/**
 * LocalPhases — every pass & play screen, driven purely by engine state.
 * Nothing here decides rules; it renders what the engine says and dispatches
 * intents back through the hook.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GAME_PHASES, ROLES } from '../../data/constants.js'
import { Button } from '../ui/Button.jsx'
import { Badge, Glyph, ProgressDots } from '../ui/Layout.jsx'
import { Panel, PanelBody } from '../ui/Panel.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { SecretCard } from './SecretCard.jsx'
import { CountdownRing } from './CountdownRing.jsx'
import { StatusStrip, TurnBanner, VoteGrid, VoteTally } from './PlayerBits.jsx'
import { WinnerScreen } from './WinnerScreen.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { playSfx } from '../../lib/sound.js'
import { haptic } from '../../lib/haptics.js'
import { chaosNoImposterLine } from '../../lib/gameEngine.js'

/* ------------------------------------------------------------------ */
/* Shared frame                                                        */
/* ------------------------------------------------------------------ */
function PhaseFrame({ state, view, onQuit, children, phaseLabel }) {
  return (
    <div className="shell-narrow flex flex-1 flex-col gap-3 pb-4">
      <StatusStrip
        round={state.round}
        totalRounds={state.config.winRule === 'survival' ? state.totalRounds : null}
        phase={phaseLabel || state.phase.replace(/_/g, ' ')}
        alive={view.alive.length}
        total={state.players.length}
        right={
          <Button size="sm" variant="quiet" className="!min-h-7 !px-2 !text-[10px]" onClick={onQuit}>
            Quit
          </Button>
        }
      />
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Card hand-off + reveal                                           */
/* ------------------------------------------------------------------ */
export function HandoffPhase({ state, view, actions, showDecoy }) {
  const { vibrate } = useSettings()
  const player = view.revealPlayer
  const [toggled, setToggled] = useState(false)
  const revealed = state.phase === GAME_PHASES.REVEAL

  useEffect(() => {
    setToggled(false)
  }, [player?.id])

  if (!player) return null

  const isLast = view.revealProgress.index >= view.revealProgress.total - 1

  return (
    <PhaseFrame state={state} view={view} phaseLabel="secret reveal" onQuit={actions.quit}>
      <motion.div
        key={player.id}
        initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ duration: 0.35 }}
        className="text-center"
      >
        <p className="label text-[9px]">pass the device to</p>
        <h2 className="mt-1 font-display text-[clamp(22px,8vw,30px)] tracking-[.1em] text-white text-neon">{player.name}</h2>
        <div className="mt-3 flex items-center justify-center gap-3">
          <ProgressDots total={view.revealProgress.total} current={view.revealProgress.index} />
          <span className="font-mono text-[10.5px] tabular text-violet-200/60">
            {view.revealProgress.index + 1}/{view.revealProgress.total}
          </span>
        </div>
      </motion.div>

      <div className="flex flex-1 flex-col items-center justify-center py-2">
        <SecretCard
          secret={{ role: player.role === ROLES.IMPOSTER ? 'imposter' : 'crew', ...(state.secret || {}) }}
          revealed={revealed}
          playerName={player.name}
          showDecoy={showDecoy}
          onToggle={(next) => {
            if (next) {
              playSfx('cardReveal')
              // One identical cue for every player: a buzz must never reveal a role.
              haptic('roleReveal', vibrate)
              actions.reveal()
            } else {
              playSfx('cardHide')
              haptic('roleHidden', vibrate)
              setToggled(true)
              actions.hide()
            }
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {toggled && !revealed ? (
          <motion.div key="next" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => {
                playSfx('swipe')
                actions.nextCard()
              }}
            >
              {isLast ? 'Everyone is ready' : 'Hand to next player'}
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-emerald-200/75">
              <Glyph name="lock" size={12} /> Secret hidden — safe to pass
            </p>
          </motion.div>
        ) : (
          <motion.p
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center text-[11.5px] text-violet-200/50"
          >
            {revealed ? 'Memorise it, then tap the card to hide your secret.' : 'Tap the card to reveal your secret.'}
          </motion.p>
        )}
      </AnimatePresence>
    </PhaseFrame>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Round briefing                                                   */
/* ------------------------------------------------------------------ */
export function BriefingPhase({ state, view, actions, briefLine }) {
  return (
    <PhaseFrame state={state} view={view} phaseLabel="briefing" onQuit={actions.quit}>
      <Panel annotated className="mx-auto w-full max-w-md">
        <PanelBody className="space-y-4 text-center">
          <Badge tone="cyan">round {state.round}{state.config.winRule === 'survival' ? ` of ${state.totalRounds}` : ''}</Badge>
          <h2 className="font-display text-[20px] leading-tight tracking-[.1em] text-violet-50">GIVE YOUR CLUE.</h2>
          <p className="font-display text-[14px] tracking-[.14em] text-magenta-glow">DON'T REVEAL THE WORD.</p>
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-violet-100/70">{briefLine}</p>

          <div className="space-y-2 rounded-xl border border-violet-500/20 bg-black/30 px-3.5 py-3 text-left">
            <p className="label text-[9px]">win condition</p>
            <p className="text-[12px] leading-relaxed text-violet-100/75">{view.winText}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge tone="muted">{state.config.turnSeconds}s turns</Badge>
              <Badge tone="muted">{state.config.clueOrder === 'random' ? 'random order' : 'seating order'}</Badge>
              <Badge tone="muted">{state.config.voteMode === 'secret' ? 'secret ballot' : 'open accusation'}</Badge>
            </div>
          </div>
        </PanelBody>
      </Panel>

      <Button variant="primary" size="lg" fullWidth onClick={actions.startRound}>
        Start round {state.round}
      </Button>
    </PhaseFrame>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Clue phase with timer                                            */
/* ------------------------------------------------------------------ */
export function CluesPhase({ state, view, actions, muted }) {
  const player = view.cluePlayer
  const { settings } = useSettings()
  const isLast = view.clueProgress.index >= view.clueProgress.total - 1

  return (
    <PhaseFrame state={state} view={view} phaseLabel="clues" onQuit={actions.quit}>
      <TurnBanner name={player?.name} index={view.clueProgress.index} total={view.clueProgress.total} isMe={false} />

      <div className="flex flex-col items-center gap-4 pt-1">
        <CountdownRing
          secondsLeft={state.timer.secondsLeft}
          duration={state.config.turnSeconds}
          running={state.timer.running}
          muted={muted}
          onComplete={() => {
            /* the ring already stings; nothing else to do */
          }}
        />

        <div className="flex w-full max-w-md flex-wrap items-center justify-center gap-2">
          {!state.timer.running && state.timer.secondsLeft === state.config.turnSeconds && (
            <Button variant="primary" size="sm" onClick={actions.startTimer}>
              Start timer
            </Button>
          )}
          {state.timer.running && (
            <Button variant="ghost" size="sm" onClick={actions.pauseTimer}>
              Pause
            </Button>
          )}
          {!state.timer.running && state.timer.secondsLeft < state.config.turnSeconds && state.timer.secondsLeft > 0 && (
            <Button variant="ghost" size="sm" onClick={actions.startTimer}>
              Resume
            </Button>
          )}
          <Button variant="quiet" size="sm" onClick={actions.resetTimer}>
            Reset
          </Button>
        </div>

        <InlineNotice tone="info" className="w-full max-w-md">
          One clue per player. Never repeat someone else's clue, and never say the secret word out loud.
          {settings.showDecoy && <span className="opacity-70"> Imposters, your cover word is a good starting point.</span>}
        </InlineNotice>
      </div>

      <div className="mt-auto space-y-2">
        <Button variant={isLast ? 'primary' : 'default'} size="lg" fullWidth onClick={actions.nextClue}>
          {isLast ? 'Clues done — move to voting' : 'Next player'}
        </Button>
        <p className="text-center text-[11px] text-violet-200/45">
          Skipping ahead is allowed — the table decides when a turn is really over.
        </p>
      </div>
    </PhaseFrame>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Voting                                                           */
/* ------------------------------------------------------------------ */
export function VoteIntroPhase({ state, view, actions }) {
  const secret = state.config.voteMode === 'secret'
  return (
    <PhaseFrame state={state} view={view} phaseLabel="discussion" onQuit={actions.quit}>
      <Panel annotated className="mx-auto w-full max-w-md">
        <PanelBody className="space-y-4 text-center">
          <Glyph name="skull" size={30} className="mx-auto text-fuchsia-300" />
          <h2 className="font-display text-[18px] tracking-[.12em] text-violet-50">WHO IS THE IMPOSTER?</h2>
          <p className="text-[12.5px] leading-relaxed text-violet-100/75">
            {secret
              ? 'Debate out loud, then vote one at a time — every ballot stays hidden until the tally. Nobody sees a vote while it is being cast.'
              : 'Debate out loud, then lock a single accusation for the whole table. One call decides this round.'}
          </p>
          <p className="text-[11.5px] leading-relaxed text-violet-200/55">{view.winText}</p>
        </PanelBody>
      </Panel>
      <Button variant="primary" size="lg" fullWidth onClick={actions.beginVoting}>
        {secret ? 'Begin secret ballot' : 'Open the accusation'}
      </Button>
    </PhaseFrame>
  )
}

export function VoteHandoffPhase({ state, view, actions }) {
  const voter = view.voter
  return (
    <PhaseFrame state={state} view={view} phaseLabel="voting" onQuit={actions.quit}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Badge tone="magenta">secret ballot</Badge>
        <div>
          <p className="label text-[9px]">hand the device to</p>
          <h2 className="mt-1 font-display text-[clamp(22px,8vw,30px)] tracking-[.1em] text-white text-neon">{voter?.name}</h2>
        </div>
        <div className="flex items-center gap-3">
          <ProgressDots total={view.voteProgress.total} current={view.voteProgress.index} />
          <span className="font-mono text-[10.5px] tabular text-violet-200/60">
            {view.voteProgress.index + 1}/{view.voteProgress.total}
          </span>
        </div>
        <p className="max-w-xs text-[12px] leading-relaxed text-violet-200/60">
          Nobody else should see the next screen. Your vote is locked the moment you submit it.
        </p>
        <Button variant="primary" size="lg" fullWidth className="max-w-sm" onClick={actions.openBallot}>
          Open my ballot
        </Button>
      </div>
    </PhaseFrame>
  )
}

export function VoteCastPhase({ state, view, actions, onSubmitted, open = false }) {
  const { vibrate } = useSettings()
  const [selected, setSelected] = useState(null)
  const voter = view.voter
  const candidates = view.alive.filter((player) => (open ? true : player.id !== voter?.id))
  const target = open ? null : voter

  useEffect(() => {
    setSelected(null)
  }, [voter?.id, open])

  const submit = () => {
    if (!selected) return
    playSfx('vote')
    haptic('voteSubmitted', vibrate)
    if (open) actions.openVote(selected)
    else actions.castVote(voter.id, selected)
    onSubmitted?.()
  }

  return (
    <PhaseFrame state={state} view={view} phaseLabel={open ? 'accusation' : 'voting'} onQuit={actions.quit}>
      <div className="text-center">
        <p className="label text-[9px]">{open ? 'the table accuses' : 'voting as'}</p>
        <h2 className="mt-1 font-display text-[clamp(18px,6.5vw,24px)] tracking-[.1em] text-white text-neon">
          {open ? 'PICK THE IMPOSTER' : target?.name}
        </h2>
        {!open && <p className="mt-1.5 text-[11.5px] text-violet-200/55">Tap the player you believe is the imposter.</p>}
      </div>

      <VoteGrid
        players={candidates}
        selected={selected}
        myId={voter?.id}
        onSelect={(id) => {
          setSelected(id)
          playSfx('tap')
        }}
      />

      <div className="mt-auto space-y-2">
        <Button variant="primary" size="lg" fullWidth disabled={!selected} onClick={submit}>
          {open ? 'Lock accusation' : 'Lock my vote'}
        </Button>
        <p className="text-center text-[11px] text-violet-200/45">
          {open ? 'One accusation for the whole table. Choose carefully.' : 'Your vote is hidden until every player has voted.'}
        </p>
      </div>
    </PhaseFrame>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Tally + result                                                   */
/* ------------------------------------------------------------------ */
export function TallyPhase({ state, view, actions, muted }) {
  const { vibrate } = useSettings()
  const [revealed, setRevealed] = useState(false)
  const totalVotes = Object.keys(state.votes).length

  return (
    <PhaseFrame state={state} view={view} phaseLabel="tally" onQuit={actions.quit}>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {!revealed ? (
          <>
            <motion.div
              animate={{ rotate: [0, 6, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="grid h-16 w-16 place-items-center rounded-full border border-cyan-300/50 bg-cyan-500/10 shadow-neon-cyan"
            >
              <Glyph name="eye" size={26} className="text-cyan-200" />
            </motion.div>
            <div>
              <h2 className="font-display text-[18px] tracking-[.14em] text-violet-50">VOTES ARE IN</h2>
              <p className="mt-2 text-[12.5px] text-violet-200/60">
                {totalVotes} ballot{totalVotes === 1 ? '' : 's'} locked. Gather round.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="max-w-sm"
              onClick={() => {
                playSfx(muted ? 'confirm' : 'reveal')
                haptic('eliminated', vibrate)
                setRevealed(true)
                actions.resolve()
              }}
            >
              Reveal the tally
            </Button>
          </>
        ) : null}
      </div>
    </PhaseFrame>
  )
}

/* ------------------------------------------------------------------ */
/* 8. The caught imposter's last guess                                  */
/* ------------------------------------------------------------------ */
/**
 * Shown only when the vote removed an imposter. The device goes to that player;
 * everybody else sees a neutral hand-off with no role information in it, which
 * is why the wording never says who was or was not an imposter.
 */
export function GuessPhase({ state, view, actions }) {
  const accused = state.pendingGuess || null
  const [step, setStep] = useState('handoff')
  const [guess, setGuess] = useState('')
  const inputRef = useRef(null)
  const { vibrate } = useSettings()

  useEffect(() => {
    if (step !== 'guess') return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [step])

  if (!accused) return null

  const submit = () => {
    const value = guess.trim()
    if (!value) return
    haptic('voteSubmitted', vibrate)
    actions.submitGuess(value)
  }

  if (step === 'handoff') {
    return (
      <PhaseFrame state={state} view={view} phaseLabel="final guess" onQuit={actions.quit}>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <Badge tone="magenta">final guess</Badge>
          <div>
            <h2 className="font-display text-[clamp(22px,7.5vw,30px)] tracking-[.1em] text-white text-neon">
              {accused.name}
            </h2>
            <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-violet-200/70">
              Pass the device to {accused.name}. Voted out players get one shot at naming the crew's word — get it
              right and the game flips.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full max-w-[320px]"
            onClick={() => {
              haptic('turnChange', vibrate)
              setStep('guess')
            }}
          >
            I'm {accused.name} — take my guess
          </Button>
        </div>
      </PhaseFrame>
    )
  }

  return (
    <PhaseFrame state={state} view={view} phaseLabel="final guess" onQuit={actions.quit}>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="text-center">
          <Badge tone="magenta">one guess</Badge>
          <h2 className="mt-3 font-display text-[clamp(19px,6.5vw,26px)] tracking-[.12em] text-white text-neon">
            WHAT WAS THE WORD?
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-violet-200/65">
            Everyone else, look away. This answer settles the whole game.
          </p>
        </div>

        <Panel className="px-4 py-4">
          <label htmlFor="final-guess" className="label mb-2 block text-[9px]">
            the crew's secret word
          </label>
          <input
            id="final-guess"
            ref={inputRef}
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit()
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck="false"
            maxLength={40}
            placeholder="Type the word…"
            className="w-full rounded-hud border border-violet-400/35 bg-violet-950/50 px-3.5 py-3 text-center font-display text-[16px] tracking-[.12em] text-white placeholder:text-violet-300/30 focus:border-cyan-300/70 focus:outline-none"
          />
        </Panel>

        <InlineNotice tone="warn">Only {accused.name} should see this screen.</InlineNotice>
      </div>

      <div className="mt-auto space-y-2">
        <Button variant="primary" size="lg" fullWidth disabled={!guess.trim()} onClick={submit}>
          Lock my guess
        </Button>
        <Button variant="ghost" size="sm" fullWidth onClick={actions.quit}>
          Quit to main menu
        </Button>
      </div>
    </PhaseFrame>
  )
}

export function ResultPhase({ state, view, actions, onExit, muted }) {
  const summary = view.summary
  const winner = state.winner
  const secretWord = state.secret?.word || null

  if (winner) {
    return (
      <WinnerScreen
        winner={winner.team}
        reason={winner.reason}
        word={secretWord}
        players={view.reveal}
        round={state.round}
        onPlayAgain={actions.replay}
        onExit={onExit}
        exitLabel="Main menu"
      >
        {summary && (
          <Panel variant="bare" className="!glass clip-hud px-4 py-3">
            <p className="label mb-2 text-[9px]">{summary.tie ? 'vote was tied' : 'eliminated'}</p>
            <VoteTally tally={summary.tally} max={Math.max(1, ...Object.values(summary.counts || { 0: 1 }))} />
          </Panel>
        )}
      </WinnerScreen>
    )
  }

  /*
   * Roles are never announced here. Until the game is over, nobody learns
   * whether the player who left was crew or an imposter — the vote total is all
   * the table gets.
   */
  const noImposter = Boolean(summary?.noImposter)
  const guessWrong = summary?.guess === 'wrong'

  return (
    <PhaseFrame state={state} view={view} phaseLabel="result" onQuit={actions.quit}>
      <div className="space-y-3">
        <div className="text-center">
          <Badge tone={summary?.tie || noImposter ? 'amber' : 'magenta'}>
            {noImposter ? 'no imposter' : summary?.tie ? 'tied vote' : 'voted out'}
          </Badge>
          <h2 className="mt-3 font-display text-[clamp(20px,7vw,28px)] tracking-[.1em] text-white text-neon">
            {noImposter ? 'NOBODY' : summary?.eliminatedName || 'Nobody'}
          </h2>
          <p className="mt-2 font-display text-[12.5px] tracking-[.18em] text-magenta-glow">
            {noImposter
              ? 'EVERY PLAYER WAS CREW THIS ROUND'
              : summary?.tie
                ? 'THE VOTE WAS SPLIT — NOBODY LEAVES'
                : 'OUT OF THE GAME — THE HUNT CONTINUES'}
          </p>
        </div>

        {!noImposter && !summary?.tie && (summary?.order || []).length > 0 && (
          <Panel className="px-4 py-3">
            <p className="label mb-2.5 text-[9px]">vote breakdown</p>
            <VoteTally tally={summary?.tally || []} max={Math.max(1, ...Object.values(summary?.counts || { 0: 1 }))} />
          </Panel>
        )}

        <InlineNotice tone={noImposter ? 'warn' : summary?.tie ? 'warn' : 'error'}>
          {noImposter
            ? chaosNoImposterLine()
            : summary?.tie
              ? 'A split vote means nobody leaves — the game moves on to the next round.'
              : guessWrong
                ? 'The word went unguessed. That player is out — the game continues.'
                : 'One player is out of the game. Nobody is told what they were.'}
        </InlineNotice>
      </div>

      <div className="mt-auto space-y-2">
        <Button variant="primary" size="lg" fullWidth onClick={actions.nextRound}>
          Next round
        </Button>
        <Button variant="ghost" size="sm" fullWidth onClick={onExit}>
          Quit to main menu
        </Button>
      </div>
    </PhaseFrame>
  )
}
