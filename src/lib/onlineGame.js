/**
 * ONLINE GAME RULES
 *
 * Pure helpers that turn the shared room document (+ the host's role map) into
 * the same kind of answer the local engine produces. Keeping them pure means
 * the host is the only writer of derived truth, and every client can verify.
 */

import { ONLINE_PHASES, ROOM_STATUS, ROLES } from '../data/constants.js'
import { calculateVotes, determineWinner, isVoteStalemate, voteStalemateReason, winConditionText } from './gameEngine.js'
import { shuffle } from '../utils/random.js'

export const OA = ONLINE_PHASES

export const roomAlive = (room) => room.players.filter((p) => !(room.game?.eliminated || []).includes(p.id))
export const roomImposterIds = (roles = {}) => Object.keys(roles).filter((id) => roles[id] === ROLES.IMPOSTER)

export const isPlayerOnline = (player, graceMs = 45000) => player.online !== false && Date.now() - (player.lastSeen || 0) < graceMs

/*
 * THE FROZEN TABLE
 * ----------------
 * A party game dies when one phone goes dark: the round waits for a card that
 * is never flipped, a clue that is never given, a ballot that never lands, or
 * for a host who is never coming back. The grace below is how long a player may
 * go quiet before the table treats them as gone; the host gets longer, because
 * handing the room over is a bigger deal than skipping one turn.
 */
export const OFFLINE_GRACE_MS = 45000
export const HOST_VANISH_MS = 60000

/** Living players, in the order the clue round walks through them. */
export function clueOrderFor(room) {
  const eliminated = room?.game?.eliminated || []
  const aliveIds = new Set((room?.players || []).filter((p) => !eliminated.includes(p.id)).map((p) => p.id))
  return (room?.game?.clueOrder || []).filter((id) => aliveIds.has(id))
}

/** Players who stopped answering heartbeats. */
export function offlinePlayers(room, graceMs = OFFLINE_GRACE_MS) {
  return (room?.players || []).filter((p) => !isPlayerOnline(p, graceMs))
}

/** The longest-standing player still online — the one who inherits the room. */
export function nextHostId(room, graceMs = OFFLINE_GRACE_MS) {
  const online = (room?.players || []).filter((p) => isPlayerOnline(p, graceMs)).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
  return online[0]?.id || null
}

/**
 * Who should take the room over because the host went quiet, or null.
 * The host is measured against the longer vanish window — a phone that was
 * checked for ten seconds must not cost anyone the room.
 */
export function vanishSuccessor(room, now = Date.now(), vanishMs = HOST_VANISH_MS) {
  if (!room?.players?.length) return null
  if (room.status === ROOM_STATUS.TERMINATED) return null
  const host = room.players.find((p) => p.isHost || p.id === room.hostId) || null
  /* No host at all (they were removed): any online player can take the job. */
  if (!host) return nextHostId(room, vanishMs)
  const quietFor = now - (host.lastSeen || 0)
  if (host.online !== false && quietFor < vanishMs) return null
  const successor = room.players.filter((p) => p.id !== host.id && isPlayerOnline(p, vanishMs)).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0]
  return successor?.id || null
}

/**
 * The winner the roster implies right now.
 *
 * A caught imposter's wrong guess does not settle anything by itself: with the
 * last imposter gone the crew has won, and the room must say so instead of
 * dealing another round with nobody left to catch.
 */
export function settleWinner(room, roles = {}) {
  return determineWinner(pseudoState(room, roles)) || null
}

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
  return {
    cast: Object.keys(votes).length,
    total: voters.length,
    complete: voters.length > 0 && Object.keys(votes).length >= voters.length,
  }
}

/** Everyone who has confirmed seeing their card. */
export function revealProgress(room) {
  const alive = roomAlive(room)
  const seen = new Set(room.game?.revealedBy || [])
  return {
    cast: alive.filter((p) => seen.has(p.id)).length,
    total: alive.length,
    complete: alive.every((p) => seen.has(p.id)),
  }
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
    history: [
      ...(state.history || []),
      {
        round: state.round,
        tie: tally.tie,
        eliminatedId: targetId,
        wasImposter,
      },
    ],
    eliminated,
  })

  /*
   * A caught imposter is never settled by the vote: they get one guess at the
   * crew's word first. The room moves to the guess phase, and the guess itself
   * is judged by the host (see `resolveGuess`).
   */
  const needsGuess = Boolean(wasImposter && targetId)

  /*
   * Two players left: the split vote can never be broken, so the round resolves
   * instead of repeating forever (see isVoteStalemate in the game engine).
   */
  const stalemate = isVoteStalemate(state, tally)

  return {
    round: state.round,
    counts: tally.counts,
    order: tally.order,
    tie: tally.tie,
    total: tally.total,
    eliminatedId: targetId,
    eliminatedName: target?.name || null,
    wasImposter,
    needsGuess,
    stalemate,
    winner: needsGuess ? null : stalemate ? 'imposter' : winner?.team || null,
    reason: needsGuess ? '' : stalemate ? voteStalemateReason() : winner?.reason || '',
  }
}

/**
 * The result as every player may see it.
 *
 * The room document is shared with the whole table, so a role never travels in
 * it: `wasImposter` is used by the host alone (it decides whether the guess
 * screen opens) and is dropped before anything is published. Roles only reach
 * the room inside `revealedRoles`, and only once the game is over.
 */
export function publicResult(result) {
  if (!result) return result
  const { wasImposter, ...rest } = result
  return {
    ...rest,
    /*
     * Whether the vote removed a crewmate or an imposter is now shown to the
     * whole table ("you voted out a crewmate !"), so it travels with the public
     * result. Only the outcome of a vote that actually removed someone — a tie
     * or a chaos round removes nobody and carries no role.
     */
    role: result.eliminatedId ? (wasImposter ? 'imposter' : 'crew') : null,
  }
}

/**
 * Judge the caught imposter's one guess. `word` is the round's private word,
 * read by the host from the reserved secret entry — never from public state.
 */
export function resolveGuess({ guess, word }) {
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const truth = normalize(word)
  const attempt = normalize(guess)
  const correct = Boolean(truth && attempt && truth === attempt)

  return {
    correct,
    winner: correct ? 'imposter' : null,
    reason: correct ? 'The caught imposter named the secret word — the imposters take the game.' : '',
  }
}

/**
 * Whose device drives the derived truth right now: the host while their phone
 * answers, otherwise the longest-standing online player. One definition, used
 * by every gate and shown on screen so the table knows who to wait for.
 */
export function driverFor(room) {
  if (!room) return null
  const host = room.players.find((p) => p.id === room.hostId) || room.players.find((p) => p.isHost)
  if (host && isPlayerOnline(host)) return host
  return room.players.filter((p) => isPlayerOnline(p)).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0] || null
}

/** Only the host (or a delegate if the host dropped) drives automatic steps. */
export function isHostDriver(room, playerId) {
  const driver = driverFor(room)
  return Boolean(driver && driver.id === playerId)
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

/**
 * Turn clocks auto-start: every clue turn opens with a fresh, running timer so
 * nobody has to hunt for a Start button. The host's controls then move the
 * same clock between four stances — running, paused (frozen remainder), ready
 * (a full clock waiting), and stopped (no limit for the rest of this turn).
 */
export function freshTimer(duration) {
  const full = Math.max(1, Number(duration) || 30)
  return { running: true, duration: full, startedAt: Date.now() }
}

export function timerStance(timer, turnSeconds) {
  if (timer?.running && timer.startedAt) return 'running'
  if (!timer) return 'ready'
  const full = Math.max(1, Number(turnSeconds) || 30)
  const frozen = timer?.duration ?? 0
  if (frozen <= 0) return 'stopped'
  /* `paused` is a flag, not a guess from the number: pausing a heartbeat after
     a turn opens freezes a full clock, and "a full frozen clock" would
     otherwise be indistinguishable from "nobody has started it". */
  return timer.paused || frozen < full ? 'paused' : 'ready'
}

/** The one place the pause / resume / stop rules live — host action dispatch. */
export function applyTimerAction(timer, action, turnSeconds) {
  const full = Math.max(1, Number(turnSeconds) || 30)
  const stance = timerStance(timer, full)
  switch (action) {
    case 'pause':
      /* Freeze what is left; resume carries on from exactly there. */
      return stance === 'running' ? { running: false, duration: timerRemaining(timer), startedAt: null, paused: true } : timer
    case 'stop':
      /* The rest of this turn runs open-ended — the next turn auto-starts. */
      return { running: false, duration: 0, startedAt: null }
    case 'resume':
      if (stance === 'paused') return { running: true, duration: Math.max(1, timerRemaining(timer)), startedAt: Date.now() }
      return freshTimer(full)
    default:
      return timer
  }
}

/** Fresh clue order for a round (alive players only). */
export const buildClueOrder = (aliveIds) => shuffle(aliveIds)

/** The single source of truth for "what should this client see right now". */
export function phaseView(room, playerId, secret) {
  const game = room.game
  const me = room.players.find((p) => p.id === playerId) || null
  const alive = roomAlive(room)
  const amAlive = Boolean(me && alive.some((p) => p.id === me.id))
  const host = room.players.find((p) => p.isHost || p.id === room.hostId) || null
  /* Every in-game screen can say when the host has gone quiet — see the
     automatic takeover in useOnlineRoom. */
  const hostOffline = Boolean(host && !isPlayerOnline(host))
  const offline = offlinePlayers(room).map((p) => p.id)

  if (room.status === ROOM_STATUS.TERMINATED) return { screen: 'terminated' }
  if (!game) return { screen: 'lobby' }

  switch (game.phase) {
    case OA.REVEAL: {
      const seen = (game.revealedBy || []).includes(playerId)
      return {
        screen: 'card',
        seen,
        progress: revealProgress(room),
        /* Who the table is still waiting for, and whether their phone is dark. */
        waitingOn: alive.filter((p) => !(game.revealedBy || []).includes(p.id)).map((p) => p.name),
        offlineNames: alive.filter((p) => offline.includes(p.id)).map((p) => p.name),
        hostOffline,
        secret,
        alive,
      }
    }
    case OA.BRIEFING:
      return { screen: 'briefing', amAlive, alive, secret, hostOffline }
    case OA.CLUES: {
      const turn = turnPlayer(room)
      const order = clueOrderFor(room)
      return {
        screen: 'clues',
        turn,
        isMyTurn: turn?.id === playerId,
        turnOffline: Boolean(turn && !isPlayerOnline(turn)),
        amAlive,
        alive,
        canAdvance: canAdvanceClue(room, playerId),
        isLastClue: (game.clueIndex || 0) >= order.length - 1,
        index: Math.min((game.clueIndex || 0) + 1, order.length),
        total: order.length,
        secret,
        timer: game.timer,
        hostOffline,
      }
    }
    case OA.VOTING: {
      const votes = currentVotes(room)
      const mine = votes[playerId] || null
      return {
        screen: 'voting',
        votes,
        mine,
        progress: voteProgress(room),
        /* Still to vote — the host can count the round without them. */
        waitingOn: alive
          .filter((p) => !votes[p.id])
          .map((p) => ({
            id: p.id,
            name: p.name,
            offline: offline.includes(p.id),
          })),
        offlineNames: alive.filter((p) => offline.includes(p.id)).map((p) => p.name),
        alive,
        amAlive,
        secret,
        hostOffline,
      }
    }
    case OA.GUESS: {
      const pending = game.pendingGuess || null
      const isMine = pending?.playerId === playerId
      const accused = room.players.find((p) => p.id === pending?.playerId) || null
      return {
        screen: 'guess',
        pending,
        isMine,
        /* The accused has gone quiet: the host can wave the guess through. */
        accusedOffline: Boolean(accused && !isPlayerOnline(accused)),
        /* The guess itself is public the moment it is made, so late joiners and
           the waiting table see the same thing. Only the accused may type one. */
        submitted: game.guess?.text || null,
        guessedBy: game.guess?.playerId || null,
        result: game.lastResult,
        alive,
        hostOffline,
      }
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
        hostOffline,
      }
    }
    default:
      return { screen: 'lobby' }
  }
}

export const onlineWinText = (winRule) => winConditionText(winRule)
