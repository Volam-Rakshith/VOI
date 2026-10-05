/**
 * useLocalGame — drives a pass & play game on a single device.
 * Owns the reducer, the countdown ticker and every user intent, so pages stay
 * presentational. The secret exists only in memory for the duration of a game.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { GAME_PHASES, STORAGE_KEYS } from '../data/constants.js'
import {
  PHASE,
  alivePlayers,
  createGame,
  currentCluePlayer,
  currentRevealPlayer,
  currentVoter,
  fullReveal,
  gameReducer,
  roundObjective,
  roundSummary,
  winConditionText,
} from '../lib/gameEngine.js'
import { readJSON, writeJSON } from '../utils/storage.js'
import { validateGameConfig, validateRoster } from '../utils/validate.js'
import { DEFAULT_CONFIG } from '../data/defaults.js'

const TICK_MS = 250

/** Reducer wrapper adding lifecycle actions that only the hook uses. */
export function localGameReducer(state, action) {
  if (action.type === '__INIT__') return createGame(action.config, action.names, { word: action.secret })
  if (action.type === '__RESET__') return null
  return gameReducer(state, action)
}

export function useLocalGame(bank) {
  const [state, dispatch] = useReducer(localGameReducer, null)
  const [error, setError] = useState(null)
  const lastTick = useRef(Date.now())

  /* ------------------------------------------------------------------ */
  /* Countdown — wall-clock based so throttled tabs stay accurate        */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!state?.timer?.running) return () => {}
    lastTick.current = Date.now()
    const id = setInterval(() => {
      const now = Date.now()
      const delta = (now - lastTick.current) / 1000
      if (delta >= 1) {
        const whole = Math.floor(delta)
        lastTick.current = now
        dispatch({ type: 'TICK', delta: whole })
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [state?.timer?.running])

  /* ------------------------------------------------------------------ */
  /* Start / restart                                                     */
  /* ------------------------------------------------------------------ */
  const startGame = useCallback(
    (config, names) => {
      const roster = validateRoster(names)
      if (!roster.ok) {
        const message = roster.formError || 'Check the player names.'
        setError(message)
        return { ok: false, error: message, fieldErrors: roster.errors }
      }
      const { config: safeConfig } = validateGameConfig({ ...config, playerCount: roster.names.length })
      const word = bank?.pick ? bank.pick(safeConfig) : null
      if (!word) {
        const message = 'Your word database is empty. Add words in BLACK BOX or reset to defaults.'
        setError(message)
        return { ok: false, error: message }
      }
      setError(null)
      writeJSON(STORAGE_KEYS.lastConfig, safeConfig)
      dispatch({ type: '__INIT__', config: safeConfig, names: roster.names, secret: word })
      return { ok: true }
    },
    [bank],
  )

  const actions = useMemo(
    () => ({
      reveal: () => dispatch({ type: 'REVEAL_CARD' }),
      hide: () => dispatch({ type: 'HIDE_CARD' }),
      nextCard: () => dispatch({ type: 'ADVANCE_REVEAL' }),
      startRound: () => dispatch({ type: 'START_ROUND' }),
      startTimer: () => dispatch({ type: 'START_TIMER' }),
      pauseTimer: () => dispatch({ type: 'PAUSE_TIMER' }),
      resetTimer: () => dispatch({ type: 'RESET_TIMER' }),
      nextClue: () => dispatch({ type: 'NEXT_CLUE' }),
      beginVoting: () => dispatch({ type: 'BEGIN_VOTING' }),
      openBallot: () => dispatch({ type: 'OPEN_BALLOT' }),
      castVote: (voterId, targetId) => dispatch({ type: 'CAST_VOTE', voterId, targetId }),
      openVote: (targetId) => dispatch({ type: 'OPEN_VOTE', targetId }),
      resolve: () => dispatch({ type: 'RESOLVE_ROUND' }),
      nextRound: () => dispatch({ type: 'NEXT_ROUND' }),
      replay: () => {
        const picked = bank?.pick && state?.config ? bank.pick(state.config) : state?.secret
        dispatch({ type: 'REPLAY', secret: picked })
      },
      quit: () => {
        setError(null)
        dispatch({ type: '__RESET__' })
      },
    }),
    [bank, state?.config, state?.secret],
  )

  /* ------------------------------------------------------------------ */
  /* Derived view model                                                  */
  /* ------------------------------------------------------------------ */
  const view = useMemo(() => {
    if (!state) return null
    const alive = alivePlayers(state)
    const clueRoster = state.clueOrder.map((id) => state.players.find((p) => p.id === id)).filter((p) => p?.alive)
    return {
      alive,
      revealPlayer: currentRevealPlayer(state),
      revealProgress: { index: state.revealIndex, total: alive.length },
      cluePlayer: currentCluePlayer(state),
      clueProgress: { index: state.clueIndex, total: clueRoster.length },
      voter: currentVoter(state),
      voteProgress: { index: state.voteIndex, total: alive.length },
      objective: roundObjective(state),
      winText: winConditionText(state.config.winRule),
      summary: roundSummary(state),
      reveal: fullReveal(state),
      isLastRound: state.round >= state.totalRounds,
      secondsLeft: state.timer.secondsLeft,
      timerRunning: state.timer.running,
      canResolve: state.config.voteMode === 'open' ? Boolean(state.votes.__open__) : Object.keys(state.votes).length > 0,
      round: state.round,
      totalRounds: state.totalRounds,
      phase: state.phase,
      cardVisible: state.cardVisible,
    }
  }, [state])

  const lastConfig = useMemo(() => readJSON(STORAGE_KEYS.lastConfig, DEFAULT_CONFIG), [])

  return { state, view, error, startGame, actions, phases: PHASE, setError, lastConfig }
}

export { GAME_PHASES }
export default useLocalGame
