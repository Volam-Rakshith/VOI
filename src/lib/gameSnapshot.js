/**
 * Pass & play survival — the table on this device survives a page refresh.
 *
 * The local game lives in memory, so a refresh used to wipe it instantly. It is
 * now mirrored into per-tab sessionStorage on every change and restored on the
 * next load, which is what makes "CONTINUE GAME" on the refresh warning real.
 *
 * Two things are deliberately NOT stored as they were:
 *   • an open secret card is closed (a reload must never leave a word on screen)
 *   • the countdown is paused (a refresh should not eat a player's turn)
 *
 * sessionStorage — not localStorage — so the snapshot dies with the tab: close
 * the browser and the table is gone, exactly as before.
 */

import { GAME_PHASES, STORAGE_KEYS } from '../data/constants.js'
import { readSession, removeSession, writeSession } from '../utils/storage.js'

const SNAPSHOT_VERSION = 1
const PHASES = new Set(Object.values(GAME_PHASES))

/** Write the current table (or clear it when there is none). */
export function saveGameSnapshot(state) {
  if (!state) {
    removeSession(STORAGE_KEYS.localGame)
    return null
  }
  const snapshot = { v: SNAPSHOT_VERSION, at: Date.now(), state }
  writeSession(STORAGE_KEYS.localGame, snapshot)
  return snapshot
}

export function clearGameSnapshot() {
  removeSession(STORAGE_KEYS.localGame)
}

/**
 * The table to resume, or null.
 *
 * Anything that does not look like a real game is thrown away rather than
 * half-restored — a broken snapshot must never wedge the app on a screen it
 * cannot render.
 */
export function loadGameSnapshot() {
  const snapshot = readSession(STORAGE_KEYS.localGame, null)
  if (!snapshot || typeof snapshot !== 'object') return null
  if (snapshot.v !== SNAPSHOT_VERSION) return null
  const state = snapshot.state
  if (!state || typeof state !== 'object') return null
  if (!Array.isArray(state.players) || state.players.length < 2) return null
  if (!state.config || typeof state.config !== 'object') return null
  if (!PHASES.has(state.phase)) return null
  if (!state.secret || typeof state.secret.word !== 'string' || !state.secret.word) return null

  return {
    ...state,
    /* Never restore straight onto an open card, and never with the clock running. */
    cardVisible: false,
    phase: state.cardVisible && state.phase === GAME_PHASES.REVEAL ? GAME_PHASES.HANDOFF : state.phase,
    timer: state.timer ? { ...state.timer, running: false } : state.timer,
  }
}

/** True when this tab is holding a table it could pick back up. */
export const hasGameSnapshot = () => Boolean(loadGameSnapshot())
