/**
 * OnlineGamePhases — the in-game screens for an online room.
 * Everything is derived from the shared room document: card reveal, briefing,
 * shared clue timer, per-player secret ballots and the result reveal.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ONLINE_PHASES, ROLES } from '../../data/constants.js'
import { Button } from '../ui/Button.jsx'
import { Badge, ProgressDots, ScreenHeader, StatBlock } from '../ui/Layout.jsx'
import { Panel, PanelBody } from '../ui/Panel.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx'
import { CountdownRing } from '../game/CountdownRing.jsx'
import { SecretCard } from '../game/SecretCard.jsx'
import { StatusStrip, VoteGrid, VoteTally } from '../game/PlayerBits.jsx'
import { WinnerScreen } from '../game/WinnerScreen.jsx'
import { haptic } from '../../lib/haptics.js'
import { ConnectionBanner } from './ConnectionBanner.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { playSfx } from '../../lib/sound.js'
import { roomAlive } from '../../lib/onlineGame.js'

/* ------------------------------------------------------------------ */

/**
 * The caught imposter's one guess. Only that player's device shows the input —
 * everyone else watches a waiting screen that says nothing about their role.
 */
function GuessPanel({ pending, waiting, submitted, onGuess }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const { vibrate } = useSettings()

  if (waiting) {
    return (
      <Panel className="px-4 py-5 text-center">
        <p className="label mb-2 text-[9px]">final guess</p>
        <p className="font-display text-[clamp(18px,6vw,24px)] tracking-[.1em] text-white text-neon">
          {pending?.name || 'The accused'}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-violet-200/70">
          {submitted
            ? 'Guess locked. Waiting for the verdict…'
            : 'Is naming the crew\'s word on their own device. Hold tight.'}
        </p>
      </Panel>
    )
  }

  const submit = () => {
    const value = text.trim()
    if (!value || sent) return
    haptic('voteSubmitted', vibrate)
    setSent(true)
    onGuess(value)
  }

  return (
    <Panel className="px-4 py-5">
      <p className="label mb-2 text-[9px]">one guess — nobody else should see this</p>
      <h2 className="text-center font-display text-[clamp(19px,6.5vw,26px)] tracking-[.12em] text-white text-neon">
        WHAT WAS THE WORD?
      </h2>
      <p className="mt-2 text-center text-[12.5px] leading-relaxed text-violet-200/65">
        Name it right and the imposters take the whole game.
      </p>
      <input
        id="online-final-guess"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck="false"
        maxLength={40}
        placeholder="Type the word…"
        className="mt-4 w-full rounded-hud border border-violet-400/35 bg-violet-950/50 px-3.5 py-3 text-center font-display text-[16px] tracking-[.12em] text-white placeholder:text-violet-300/30 focus:border-cyan-300/70 focus:outline-none"
      />
      <Button className="mt-3" variant="primary" size="lg" fullWidth disabled={!text.trim() || sent} onClick={submit}>
        {sent ? 'Guess locked…' : 'Lock my guess'}
      </Button>
    </Panel>
  )
}

export function OnlineGamePhases({ online, onExit }) {
  const { room, view, session, actions, connection, busy, timerRemaining } = online
  const { settings, vibrate } = useSettings()
  const [confirm, setConfirm] = useState(null)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [seen, setSeen] = useState(false)
  const hapticPhaseRef = useRef('')

  const alive = useMemo(() => roomAlive(room), [room])
  const isHost = view?.isHost
  const gameOver = Boolean(room.game?.winner)

  const header = (eyebrow, badge) => (
    <ScreenHeader
      title={gameOver ? 'Result' : `Round ${room.game?.round || 1}`}
      eyebrow={eyebrow}
      onBack={() => setConfirm(isHost ? 'close' : 'leave')}
      right={badge}
    />
  )

  const exit = async () => {
    if (confirm === 'close' && isHost) await actions.closeRoom()
    else await actions.leave()
    setConfirm(null)
    onExit?.()
  }

  /*
   * Phase-driven haptics, mirroring pass & play: the cue depends on the moment,
   * never on anybody's role.
   */
  useEffect(() => {
    const phase = room.game?.phase
    if (!phase) return
    const key = `${room.game.round || 1}:${phase}`
    if (hapticPhaseRef.current === key) return
    hapticPhaseRef.current = key
    const chaos = room.config?.mode === 'chaos'
    switch (phase) {
      case ONLINE_PHASES.REVEAL:
        haptic('roleReveal', vibrate)
        break
      case ONLINE_PHASES.BRIEFING:
        haptic(chaos ? 'chaosRound' : 'roundStart', vibrate)
        break
      case ONLINE_PHASES.CLUES:
        haptic('turnChange', vibrate)
        break
      case ONLINE_PHASES.VOTING:
        haptic('votingStart', vibrate)
        break
      case ONLINE_PHASES.TALLY:
        haptic('votingEnded', vibrate)
        break
      case ONLINE_PHASES.RESULT:
        haptic('eliminated', vibrate)
        break
      default:
        break
    }
  }, [room.game?.phase, room.game?.round, room.config?.mode, vibrate])

  /* ---------------- winner / result ---------------- */
  if (view?.screen === 'terminated') {
    return (
      <>
        <ScreenHeader title="Room closed" eyebrow="session ended" onBack={onExit} />
        <div className="shell-narrow flex-1 py-6">
          <InlineNotice tone="error">The host closed this room. Start a new one whenever you are ready.</InlineNotice>
          <Button className="mt-4" variant="primary" fullWidth onClick={onExit}>
            Back to online menu
          </Button>
        </div>
      </>
    )
  }

  if (gameOver && view?.screen === 'result') {
    const roles = room.game.revealedRoles || {}
    const players = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      role: roles[p.id] || (p.id === session.playerId ? view.myRole : null) || ROLES.CREW,
      alive: !(room.game.eliminated || []).includes(p.id),
      eliminatedRound: room.game.lastResult?.round || null,
    }))
    const mySecret = online.secret
    return (
      <>
        {header('game over', <Badge tone={room.game.winner === 'crew' ? 'cyan' : 'magenta'}>{room.game.winner}</Badge>)}
        <WinnerScreen
          winner={room.game.winner}
          reason={room.game.lastResult?.reason}
          word={mySecret?.role === ROLES.IMPOSTER ? null : mySecret?.word || null}
          players={players}
          round={room.game.round}
          onPlayAgain={isHost ? actions.playAgain : null}
          onExit={onExit}
          exitLabel="Leave room"
        >
          {room.game.lastResult && (
            <Panel className="px-4 py-3">
              <p className="label mb-2 text-[9px]">final tally</p>
              <VoteTally
                tally={Object.entries(room.game.lastResult.counts || {}).map(([id, count]) => ({
                  id,
                  name: room.players.find((p) => p.id === id)?.name || 'Unknown',
                  count,
                  wasImposter: (room.game.revealedRoles || {})[id] === ROLES.IMPOSTER,
                }))}
                max={Math.max(1, ...Object.values(room.game.lastResult.counts || { 0: 1 }))}
              />
            </Panel>
          )}
        </WinnerScreen>
        <ConfirmDialog
          open={Boolean(confirm)}
          title={isHost ? 'Close this room?' : 'Leave this room?'}
          message={isHost ? 'All players will be disconnected.' : 'You can rejoin with the same name while the room is live.'}
          confirmLabel={isHost ? 'Close room' : 'Leave'}
          onCancel={() => setConfirm(null)}
          onConfirm={exit}
        />
      </>
    )
  }

  /* ---------------- reveal ---------------- */
  if (view?.screen === 'card') {
    const mineSeen = seen || view.seen
    return (
      <>
        {header('secret reveal', <Badge tone="cyan">{`${view.progress.cast}/${view.progress.total} seen`}</Badge>)}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />
          <StatusStrip
            round={room.game.round}
            phase="secret reveal"
            alive={alive.length}
            total={room.players.length}
            right={<span className="font-display text-[11px] tracking-[.14em] text-cyan-100">{view.me?.name}</span>}
          />

          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-2">
            <SecretCard
              secret={online.secret}
              revealed={cardFlipped}
              playerName={view.me?.name}
              showDecoy={settings.showDecoy}
              onToggle={(next) => {
                setCardFlipped(next)
                playSfx(next ? 'cardReveal' : 'cardHide')
                haptic(next ? 'roleReveal' : 'roleHidden', vibrate)
                if (next) {
                  setSeen(true)
                  actions.markCardSeen()
                }
              }}
            />
          </div>

          <Panel className="px-4 py-3">
            <p className="label mb-2 text-[9px]">crew status</p>
            <ul className="flex flex-wrap gap-1.5">
              {alive.map((player) => {
                const done = (room.game.revealedBy || []).includes(player.id)
                return (
                  <li key={player.id}>
                    <Badge tone={done ? 'emerald' : 'muted'}>
                      {done ? '✓ ' : '· '}
                      {player.name}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </Panel>

          {mineSeen && !cardFlipped && (
            <InlineNotice tone="success">Secret hidden. Keep your phone to yourself — you can tap the card again to re-read it.</InlineNotice>
          )}
          {!mineSeen && (
            <p className="text-center text-[11.5px] text-violet-200/50">Reveal your card when nobody is looking over your shoulder.</p>
          )}
          {view.progress.complete && (
            <p className="text-center text-[11.5px] text-cyan-200/75">Everyone has seen their card — the host will open the round.</p>
          )}
        </div>
      </>
    )
  }

  /* ---------------- briefing ---------------- */
  if (view?.screen === 'briefing') {
    return (
      <>
        {header('briefing')}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />
          <Panel annotated className="mx-auto w-full max-w-md">
            <PanelBody className="space-y-4 text-center">
              <Badge tone="cyan">round {room.game.round}</Badge>
              <h2 className="font-display text-[19px] leading-tight tracking-[.1em] text-violet-50">GIVE YOUR CLUE.</h2>
              <p className="font-display text-[13px] tracking-[.14em] text-magenta-glow">DON'T REVEAL THE WORD.</p>
              <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-violet-100/70">
                One clue per player, in turn order. The timer keeps the table moving — the host starts it when the
                round opens.
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Badge tone="muted">{room.config.turnSeconds}s turns</Badge>
                <Badge tone="muted">{room.config.categoryLabel}</Badge>
                <Badge tone="muted">{room.config.winRule === 'survival' ? 'manhunt' : 'classic'}</Badge>
              </div>
            </PanelBody>
          </Panel>
          <div className="mt-auto">
            {view.isDriver ? (
              <Button variant="primary" size="lg" fullWidth onClick={actions.beginClues}>
                Open the clue round
              </Button>
            ) : (
              <p className="text-center text-[12px] text-violet-200/55">Waiting for the host to open the round…</p>
            )}
          </div>
        </div>
      </>
    )
  }

  /* ---------------- clues ---------------- */
  if (view?.screen === 'clues') {
    const running = Boolean(room.game.timer?.running)
    const secondsLeft = timerRemaining ?? room.config.turnSeconds
    return (
      <>
        {header('clues', <Badge tone={view.isMyTurn ? 'magenta' : 'muted'}>{view.isMyTurn ? 'your turn' : 'waiting'}</Badge>)}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />
          <StatusStrip
            round={room.game.round}
            phase="clues"
            alive={alive.length}
            total={room.players.length}
            right={<span className="font-mono text-[10.5px] tabular text-violet-200/60">clue {view.index}/{view.total}</span>}
          />

          <div className="glass clip-hud px-4 py-4 text-center">
            <p className="label text-[9px]">clue turn</p>
            <motion.p
              key={view.turn?.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1.5 font-display text-[clamp(20px,7vw,28px)] tracking-[.1em] text-white text-neon"
            >
              {view.turn?.name || '—'}
            </motion.p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <ProgressDots total={view.total} current={view.index - 1} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-4">
            <CountdownRing
              secondsLeft={secondsLeft}
              duration={room.config.turnSeconds}
              running={running}
              muted={!view.isMyTurn}
              label={running ? 'seconds' : 'ready'}
            />
            {view.isMyTurn ? (
              <div className="flex flex-wrap justify-center gap-2">
                {!running && (
                  <Button variant="primary" size="sm" onClick={actions.startTimer}>
                    Start timer
                  </Button>
                )}
                {running && (
                  <Button variant="ghost" size="sm" onClick={actions.stopTimer}>
                    Stop timer
                  </Button>
                )}
                <Button
                  variant={view.isLastClue ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => {
                    playSfx('swipe')
                    actions.nextClue()
                  }}
                >
                  {view.isLastClue ? 'Clues done — vote' : 'Clue given, next'}
                </Button>
              </div>
            ) : (
              <InlineNotice tone="info" className="max-w-md">
                {view.turn?.name} is giving their clue. Listen for the detail only the crew would know.
              </InlineNotice>
            )}
          </div>

          <div className="mt-auto">
            {view.canAdvance && !view.isMyTurn && (
              <Button variant="quiet" size="sm" fullWidth onClick={actions.nextClue}>
                Skip {view.turn?.name}'s turn (host override)
              </Button>
            )}
          </div>
        </div>
      </>
    )
  }

  /* ---------------- voting ---------------- */
  if (view?.screen === 'voting') {
    const candidates = view.alive.filter((p) => p.id !== session.playerId)
    const mine = view.mine
    const progress = view.progress
    return (
      <>
        {header('voting', <Badge tone={progress.complete ? 'emerald' : 'amber'}>{`${progress.cast}/${progress.total} voted`}</Badge>)}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />

          {!view.amAlive ? (
            <InlineNotice tone="warn">You are out of the game — you can watch, but only living players vote.</InlineNotice>
          ) : (
            <>
              <div className="text-center">
                <p className="label text-[9px]">secret ballot</p>
                <h2 className="mt-1 font-display text-[clamp(18px,6.5vw,24px)] tracking-[.12em] text-white text-neon">WHO IS THE IMPOSTER?</h2>
                <p className="mt-1.5 text-[11.5px] text-violet-200/55">
                  {mine ? 'Your vote is locked. Counts stay hidden until every ballot is in.' : 'Tap a name, then lock your vote. Nobody sees it until the tally.'}
                </p>
              </div>

              <VoteGrid
                players={candidates}
                selected={mine}
                myId={session.playerId}
                disabledIds={mine ? candidates.map((p) => p.id) : []}
                onSelect={async (id) => {
                  const result = await actions.submitVote(id)
                  if (!result.ok) return
                  playSfx('vote')
                  haptic('voteSubmitted', vibrate)
                }}
              />

              <Panel className="px-4 py-3">
                <p className="label mb-2 text-[9px]">ballots received</p>
                <ul className="flex flex-wrap gap-1.5">
                  {view.alive.map((player) => (
                    <li key={player.id}>
                      <Badge tone={view.votes[player.id] ? 'emerald' : 'muted'}>
                        {view.votes[player.id] ? '✓ ' : '· '}
                        {player.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Panel>

              {progress.complete && <InlineNotice tone="cyan">All ballots in — revealing the tally…</InlineNotice>}
            </>
          )}
        </div>
      </>
    )
  }

  /* ---------------- the caught imposter's final guess ---------------- */
  if (view?.screen === 'guess') {
    const pending = view.pending || {}
    const waiting = !view.isMine
    return (
      <>
        {header('final guess', <Badge tone="magenta">one guess</Badge>)}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />
          <GuessPanel
            pending={pending}
            waiting={waiting}
            submitted={view.submitted}
            onGuess={(text) => online.submitGuess(text)}
          />
          <div className="mt-auto">
            <Button variant="quiet" size="sm" fullWidth onClick={() => setConfirm(isHost ? 'close' : 'leave')}>
              {isHost ? 'Close room' : 'Leave room'}
            </Button>
          </div>
        </div>
      </>
    )
  }

  /* ---------------- result (mid-game) ---------------- */
  if (view?.screen === 'result') {
    const result = room.game.lastResult
    const tally = Object.entries(result?.counts || {}).map(([id, count]) => ({
      id,
      name: room.players.find((p) => p.id === id)?.name || 'Unknown',
      count,
      /* Roles appear in the tally only when the game is over (revealedRoles). */
      wasImposter: (room.game.revealedRoles || {})[id] === ROLES.IMPOSTER,
    }))
    const max = Math.max(1, ...Object.values(result?.counts || { 0: 1 }))

    return (
      <>
        {header('result', <Badge tone={result?.tie ? 'amber' : 'magenta'}>{result?.tie ? 'tied' : 'eliminated'}</Badge>)}
        <div className="shell-narrow flex flex-1 flex-col gap-3 pb-5">
          <ConnectionBanner connection={connection} onRetry={actions.refresh} />

          <div className="text-center">
            <p className="label text-[9px]">the table accused</p>
            <motion.h2
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
              className="mt-1.5 font-display text-[clamp(22px,8vw,32px)] tracking-[.1em] text-white text-neon"
            >
              {result?.eliminatedName || 'Nobody'}
            </motion.h2>
            {/* Nobody learns a role from a single vote — not even the table. */}
            <p className="mt-2 font-display text-[12.5px] tracking-[.18em] text-magenta-glow">
              {result?.noImposter
                ? 'EVERY PLAYER WAS CREW THIS ROUND'
                : result?.tie
                  ? 'THE VOTE WAS SPLIT — NOBODY LEAVES'
                  : 'OUT OF THE GAME — THE HUNT CONTINUES'}
            </p>
          </div>

          <Panel className="px-4 py-3">
            <p className="label mb-2.5 text-[9px]">vote breakdown</p>
            <VoteTally tally={tally} max={max} />
          </Panel>

          <div className="grid grid-cols-3 gap-2">
            <StatBlock label="round" value={room.game.round} />
            <StatBlock label="alive" value={alive.length} tone="violet" />
            <StatBlock label="imposters left" value="?" tone="magenta" />
          </div>

          <InlineNotice tone={result?.noImposter || result?.tie ? 'warn' : 'error'}>
            {result?.noImposter
              ? chaosNoImposterLine()
              : result?.tie
                ? 'A split vote means nobody leaves the ship. Talk it through and go again.'
                : result?.guess === 'wrong'
                  ? 'The word went unguessed. That player is out — the game continues.'
                  : 'One player is out of the game. Nobody is told what they were.'}
          </InlineNotice>

          <div className="mt-auto space-y-2">
            {view.isDriver ? (
              <Button variant="primary" size="lg" fullWidth onClick={actions.nextRound} disabled={busy === 'starting'}>
                Next round
              </Button>
            ) : (
              <p className="text-center text-[12px] text-violet-200/55">Waiting for the host to open the next round…</p>
            )}
            <Button variant="quiet" size="sm" fullWidth onClick={() => setConfirm(isHost ? 'close' : 'leave')}>
              {isHost ? 'Close room' : 'Leave room'}
            </Button>
          </div>
        </div>
      </>
    )
  }

  /* ---------------- fallback ---------------- */
  return (
    <>
      {header('syncing')}
      <div className="shell-narrow flex-1 py-6">
        <ConnectionBanner connection={connection} onRetry={actions.refresh} />
        <p className="mt-4 text-center text-[12.5px] text-violet-200/60">Syncing the room…</p>
      </div>
    </>
  )
}

export default OnlineGamePhases
