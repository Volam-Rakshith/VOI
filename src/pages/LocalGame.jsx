/**
 * LocalGame — pass & play orchestration.
 * Setup → reveal → briefing → clues → vote → tally → result → winner.
 * All transitions come from the engine; this page only routes phases.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { GAME_PHASES, ROUTES } from '../data/constants.js'
import { useWordBank } from '../context/WordBankContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useLocalGame } from '../hooks/useLocalGame.js'
import { briefLine } from '../lib/gameEngine.js'
import { SetupScreen } from '../components/game/SetupScreen.jsx'
import {
  BriefingPhase,
  CluesPhase,
  HandoffPhase,
  ResultPhase,
  TallyPhase,
  VoteCastPhase,
  VoteHandoffPhase,
  VoteIntroPhase,
} from '../components/game/LocalPhases.jsx'
import { ScreenHeader, ScreenShell } from '../components/ui/Layout.jsx'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { normalizeName } from '../utils/validate.js'
import { DEFAULT_CONFIG } from '../data/defaults.js'

export function LocalGame({ onNavigate }) {
  const bank = useWordBank()
  const toast = useToast()
  const { settings } = useSettings()
  const { state, view, startGame, actions, error, lastConfig } = useLocalGame(bank)
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [names, setNames] = useState(() => (lastConfig?.names || []).map((n) => normalizeName(n) || ''))
  const [line, setLine] = useState('')

  /* Fresh flavour line per round. */
  useEffect(() => {
    if (state) setLine(briefLine(state))
  }, [state?.round, state?.id])

  useEffect(() => {
    if (state && !state.players.length) actions.quit()
  }, [state, actions])

  useEffect(() => {
    if (error) toast.error(error)
  }, [error, toast])

  const handleStart = useCallback(
    (config, roster) => {
      setNames(roster)
      const result = startGame(config, roster)
      if (result.ok) {
        toast.info('Secrets dealt. Pass the device around.')
      }
    },
    [startGame, toast],
  )

  const requestQuit = () => {
    if (state) setConfirmQuit(true)
    else onNavigate(ROUTES.home)
  }

  const exitNow = () => {
    setConfirmQuit(false)
    actions.quit()
    onNavigate(ROUTES.home)
  }

  const renderPhase = () => {
    if (!state || !view) return null
    switch (state.phase) {
      case GAME_PHASES.HANDOFF:
      case GAME_PHASES.REVEAL:
        return <HandoffPhase key="handoff" state={state} view={view} actions={actions} showDecoy={settings.showDecoy} />
      case GAME_PHASES.BRIEFING:
        return <BriefingPhase key="briefing" state={state} view={view} actions={actions} briefLine={line} />
      case GAME_PHASES.CLUES:
        return <CluesPhase key="clues" state={state} view={view} actions={actions}  />
      case GAME_PHASES.VOTE_INTRO:
        return <VoteIntroPhase key="vote-intro" state={state} view={view} actions={actions} />
      case GAME_PHASES.VOTE_HANDOFF:
        return <VoteHandoffPhase key="vote-handoff" state={state} view={view} actions={actions} />
      case GAME_PHASES.VOTE_CAST:
        return <VoteCastPhase key="vote-cast" state={state} view={view} actions={actions} open={state.config.voteMode === 'open'} />
      case GAME_PHASES.TALLY:
        return <TallyPhase key="tally" state={state} view={view} actions={actions} />
      case GAME_PHASES.RESULT:
        return <ResultPhase key={`result-${state.round}`} state={state} view={view} actions={actions} onExit={exitNow} />
      default:
        return null
    }
  }

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */
  if (!state) {
    return (
      <>
        <SetupScreen
          onStart={handleStart}
          onBack={() => onNavigate(ROUTES.home)}
          initialConfig={{ ...DEFAULT_CONFIG, ...(lastConfig || {}), playerCount: names.length || lastConfig?.playerCount || 6 }}
          initialNames={names}
        />
      </>
    )
  }

  /* ---------------------------------------------------------------- */
  /* In-game                                                           */
  /* ---------------------------------------------------------------- */
  const stepKey = (() => {
    if (!state) return 'none'
    switch (state.phase) {
      case GAME_PHASES.REVEAL:
      case GAME_PHASES.HANDOFF:
        return `card-${state.revealIndex}`
      case GAME_PHASES.CLUES:
        return `clue-${state.clueIndex}`
      case GAME_PHASES.VOTE_HANDOFF:
      case GAME_PHASES.VOTE_CAST:
        return `vote-${state.voteIndex}`
      case GAME_PHASES.RESULT:
        return `result-${state.round}`
      default:
        return state.phase
    }
  })()

  return (
    <ScreenShell withFooter={false}>
      <ScreenHeader
        title={`Round ${state.round}`}
        eyebrow={`pass & play · ${view?.alive.length ?? 0} playing`}
        onBack={requestQuit}
        right={
          <span className="hidden font-mono text-[10.5px] text-violet-200/50 sm:inline">
            {state.config.winRule === 'classic' ? 'classic' : `manhunt ${state.round}/${state.totalRounds}`}
          </span>
        }
      />

      {/* Keyed by *step* rather than phase, so revealing/hiding a secret card
          does not remount the screen (that would drop the local UI state behind
          the "hand to next player" control).

          Deliberately no AnimatePresence here: phase swaps must be instantaneous
          and unconditional. Animating an exit that contains layout-animated
          children can stall the swap, which would leave a stale screen on
          screen. Screens animate in instead — no dependency on exit timing. */}
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-1 flex-col"
      >
        {renderPhase()}
      </motion.div>

      <ConfirmDialog
        open={confirmQuit}
        title="Leave this game?"
        message="The current round, secrets and votes will be lost."
        confirmLabel="Leave game"
        onCancel={() => setConfirmQuit(false)}
        onConfirm={exitNow}
      />
    </ScreenShell>
  )
}

export default LocalGame
