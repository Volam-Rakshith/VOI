/**
 * ONLINE GAME RULES
 *
 * Pure helpers that turn the shared room document (+ the host's role map) into
 * the same kind of answer the local engine produces. Keeping them pure means
 * the host is the only writer of derived truth, and every client can verify.
 */

import { ONLINE_PHASES, ROOM_STATUS, ROLES } from '../data/constants.js'
import { calculateVotes, determineWinner, winConditionText } from './gameEngine.js'
import { shuffle } from '../utils/random.js'

export const OA = ONLINE_PHASES

export const roomAlive = (room) => room.players.filter((p) => !(room.game?.eliminated || []).includes(p.id))
export const roomImposterIds = (roles = {}) => Object.keys(roles).filter((id) => roles[id] === ROLES.IMPOSTER)

export const isPlayerOnline = (player, graceMs = 45000) =>
  player.online !== false && Date.now() - (player.lastSeen || 0) < graceMs

export const onlineVoters = (room) => roomAlive(room)

/** Votes cast in the current round, ignoring any from previous rounds. */
export function currentVotes(room) {
  const votes = room.game?.votes || {}
  const aliveIds = new Set(roomAlive(room).map((p) => p.id))
  return Object.fromEntries(Object.entries(votes).filter(([voterId]) => aliveIds.has(voterId)))
}

export function voteProgress(room) {
  const voters = onlineVoters(room)
  const votes = currentVotes(room)
  return { cast: Object.keys(votes).length, total: voters.length, complete: voters.length > 0 && Object.keys(votes).length >= voters.length }
}

/** Everyone who has confirmed seeing their card. */
export function revealProgress(room) {
  const alive = roomAlive(room)
  const seen = new Set(room.game?.revealedBy || [])
  return { cast: alive.filter((p) => seen.has(p.id)).length, total: alive.length, complete: alive.every((p) => seen.has(p.id)) }
}

/** Build a state object the local engine helpers understand. */
export function pseudoState(room, roles = {}) {
  const eliminated = room.game?.eliminated || []
  return {
    config: {
      winRule: room.config?.winRule || 'classic',
      rounds: room.config?.rounds || 2,
      voteMode: 'secret',
      turnSeconds: room.config?.turnSeconds || 30,
      ...room.config,
    },
    round: room.game?.round || 1,
    totalRounds: room.config?.rounds || 2,
    /** Round history, so verdict copy can tell a tie from a wrong accusation. */
    history: room.game?.history || [],
    players: room.players.map((p) => ({
      ...p,
      role: roles[p.id] || ROLES.CREW,
      alive: !eliminated.includes(p.id),
    })),
    votes: currentVotes(room),
  }
}

/**
 * Host-only: resolve the round from the shared votes.
 * @returns {{ counts, order, tie, eliminatedId, eliminatedName, wasImposter, total, winner, reason }}
 */
export function computeResult(room, roles = {}) {
  const state = pseudoState(room, roles)
  const tally = calculateVotes(state)
  const targetId = tally.tie ? null : tally.leaders[0] || null
  const target = targetId ? state.players.find((p) => p.id === targetId) : null
  const wasImposter = Boolean(target && roles[targetId] === ROLES.IMPOSTER)

  const afterElimination = {
    ...state,
    players: state.players.map((p) => (p.id === targetId ? { ...p, alive: false } : p)),
  }
  // Classic never returns null (one vote always decides), and a caught imposter
  // now takes the round however many are in play — see determineWinner.
  const eliminated = targetId ? [...(room.game?.eliminated || []), targetId] : room.game?.eliminated || []
  const winner = determineWinner({
    ...afterElimination,
    history: [...(state.history || []), { round: state.round, tie: tally.tie, eliminatedId: targetId, wasImposter }],
    eliminated,
  })

  return {
    round: state.round,
    counts: tally.counts,
    order: tally.order,
    tie: tally.tie,
    total: tally.total,
    eliminatedId: targetId,
    eliminatedName: target?.name || null,
    wasImposter,
    winner: winner?.team || null,
    reason: winner?.reason || '',
  }
}

/** Only the host (or a delegate if the host dropped) drives automatic steps. */
export function isHostDriver(room, playerId) {
  if (!room) return false
  const host = room.players.find((p) => p.id === room.hostId)
  if (host && isPlayerOnline(host)) return host.id === playerId
  const fallback = room.players.filter((p) => isPlayerOnline(p)).sort((a, b) => a.joinedAt - b.joinedAt)[0]
  return fallback?.id === playerId
}

/** Who is allowed to advance the clue turn right now. */
export function canAdvanceClue(room, playerId) {
  const game = room.game
  if (!game || game.phase !== OA.CLUES) return false
  if (game.turnPlayerId === playerId) return true
  return isHostDriver(room, playerId)
}

/** Current turn player object (falls back to the clue order when stale). */
export function turnPlayer(room) {
  const game = room.game
  if (!game) return null
  const order = (game.clueOrder || []).filter((id) => roomAlive(room).some((p) => p.id === id))
  if (!order.length) return null
  const id = game.turnPlayerId && order.includes(game.turnPlayerId) ? game.turnPlayerId : order[Math.min(game.clueIndex || 0, order.length - 1)]
  return room.players.find((p) => p.id === id) || null
}

/** Live countdown for a shared timer payload. */
export function timerRemaining(timer) {
  if (!timer?.running || !timer.startedAt) return timer?.duration ?? 0
  const elapsed = (Date.now() - timer.startedAt) / 1000
  return Math.max(0, Math.round((timer.duration ?? 0) - elapsed))
}

/** Fresh clue order for a round (alive players only). */
export const buildClueOrder = (aliveIds) => shuffle(aliveIds)

/** The single source of truth for "what should this client see right now". */
export function phaseView(room, playerId, secret) {
  const game = room.game
  const me = room.players.find((p) => p.id === playerId) || null
  const alive = roomAlive(room)
  const amAlive = Boolean(me && alive.some((p) => p.id === me.id))

  if (room.status === ROOM_STATUS.TERMINATED) return { screen: 'terminated' }
  if (!game) return { screen: 'lobby' }

  switch (game.phase) {
    case OA.REVEAL: {
      const seen = (game.revealedBy || []).includes(playerId)
      return {
        screen: 'card',
        seen,
        progress: revealProgress(room),
        secret,
        alive,
      }
    }
    case OA.BRIEFING:
      return { screen: 'briefing', amAlive, alive, secret }
    case OA.CLUES: {
      const turn = turnPlayer(room)
      return {
        screen: 'clues',
        turn,
        isMyTurn: turn?.id === playerId,
        amAlive,
        alive,
        canAdvance: canAdvanceClue(room, playerId),
        isLastClue: (game.clueIndex || 0) >= (game.clueOrder || []).length - 1,
        index: (game.clueIndex || 0) + 1,
        total: (game.clueOrder || []).length,
        secret,
        timer: game.timer,
      }
    }
    case OA.VOTING: {
      const votes = currentVotes(room)
      const mine = votes[playerId] || null
      return { screen: 'voting', votes, mine, progress: voteProgress(room), alive, amAlive, secret }
    }
    case OA.TALLY:
    case OA.RESULT: {
      const votes = currentVotes(room)
      return {
        screen: 'result',
        result: game.lastResult,
        winner: game.winner || game.lastResult?.winner || null,
        votes,
        alive,
        roles: game.revealedRoles || null,
        aliveOnly: amAlive,
      }
    }
    default:
      return { screen: 'lobby' }
  }
}

export const onlineWinText = (winRule) => winConditionText(winRule)
