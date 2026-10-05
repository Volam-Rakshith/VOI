/**
 * GAME ENGINE — all rules live here, none of them in the UI.
 *
 * Every exported function is pure: it takes state, returns new state.
 * That makes local pass & play trivially testable and lets the online mode
 * reuse the exact same rules with an authoritative host.
 *
 * State shape
 * -----------
 * {
 *   id, createdAt, round, totalRounds, phase, revealIndex, cardVisible,
 *   config, players[], secret, clueOrder[], clueIndex, timer{},
 *   votes{}, voteIndex, lastResult, winner, history[]
 * }
 */

import { GAME_PHASES, ROLES, WIN_RULES } from '../data/constants.js'
import { uid, shuffle, randomInt, randomPick } from '../utils/random.js'
import { validateGameConfig, normalizeName } from '../utils/validate.js'

export const PHASE = GAME_PHASES

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export const alivePlayers = (state) => state.players.filter((p) => p.alive)
export const aliveImposters = (state) => state.players.filter((p) => p.alive && p.role === ROLES.IMPOSTER)
export const aliveCrew = (state) => state.players.filter((p) => p.alive && p.role === ROLES.CREW)
export const playerById = (state, id) => state.players.find((p) => p.id === id) || null
export const imposterNames = (state) => state.players.filter((p) => p.role === ROLES.IMPOSTER).map((p) => p.name)

export function currentRevealPlayer(state) {
  const roster = alivePlayers(state)
  return roster[state.revealIndex] || null
}

export function currentCluePlayer(state) {
  const order = state.clueOrder.filter((id) => playerById(state, id)?.alive)
  return playerById(state, order[Math.min(state.clueIndex, order.length - 1)]) || null
}

export function currentVoter(state) {
  const voters = alivePlayers(state)
  return voters[state.voteIndex] || null
}

export const isImposter = (player) => player?.role === ROLES.IMPOSTER

/** Human-readable win condition text used across briefing / rules screens. */
export function winConditionText(winRule) {
  return winRule === 'survival'
    ? 'Crew wins by removing every imposter. Imposters win the moment they equal the crew.'
    : 'One vote decides it: catch an imposter and the crew wins — accuse the wrong player and the imposters take it.'
}

/* -------------------------------------------------------------------------- */
/* Role assignment                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Assign roles with cryptographically strong Fisher–Yates shuffling.
 * Imposters are always a strict minority, and at least one crew remains.
 */
export function assignRoles(playerCount, imposterCount) {
  const total = Math.max(2, Math.floor(playerCount) || 0)
  const maxImposters = Math.max(1, Math.floor((total - 1) / 2))
  const imp = Math.min(Math.max(1, Math.floor(imposterCount) || 1), maxImposters)
  const roles = Array(total).fill(ROLES.CREW)
  // Fill from the end of a shuffled seat index list so imposters are spatially random.
  const seats = shuffle(Array.from({ length: total }, (_, i) => i))
  for (let i = 0; i < imp; i += 1) roles[seats[i]] = ROLES.IMPOSTER
  return { roles, imposterCount: imp, seats: seats.slice(0, imp) }
}

/* -------------------------------------------------------------------------- */
/* Game lifecycle                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Unwrap the secret argument.
 * Accepts both shapes so callers cannot accidentally double-wrap:
 *   createGame(cfg, names, { word: payload })   // preferred
 *   createGame(cfg, names, payload)             // tolerated
 * where payload = { word: 'Umbrella', categoryName, difficulty, decoy? }
 */
function secretPayload(secret) {
  if (!secret || typeof secret !== 'object') return null
  if (secret.word && typeof secret.word === 'object') return secret.word
  if (typeof secret.word === 'string') return secret
  return null
}

/**
 * Build a fresh game.
 * @param {object} config raw configuration (validated here)
 * @param {string[]} names player display names
 * @param {object} secret { word: payload } or payload directly
 */
export function createGame(config, names, secret) {
  const { config: safeConfig } = validateGameConfig({ ...config, playerCount: names.length })
  const { roles } = assignRoles(names.length, safeConfig.imposterCount)

  const players = names.map((raw, index) => ({
    id: uid('p'),
    name: normalizeName(raw) || `Player ${index + 1}`,
    seat: index,
    role: roles[index],
    alive: true,
    eliminatedRound: null,
    revealed: false,
  }))

  return normalizeState({
    id: uid('game'),
    createdAt: Date.now(),
    startedAt: Date.now(),
    round: 1,
    totalRounds: safeConfig.rounds,
    config: safeConfig,
    players,
    secret: secretPayload(secret),
    phase: GAME_PHASES.HANDOFF,
    revealIndex: 0,
    cardVisible: false,
    clueOrder: rollClueOrder(players, safeConfig.clueOrder),
    clueIndex: 0,
    timer: { running: false, secondsLeft: safeConfig.turnSeconds, duration: safeConfig.turnSeconds },
    votes: {},
    voteIndex: 0,
    lastResult: null,
    winner: null,
    history: [],
  })
}

/** Decide the order players give clues in. */
export function rollClueOrder(players, mode = 'random') {
  const ids = players.map((p) => p.id)
  if (mode === 'seat') return ids
  return shuffle(ids)
}

/** Guarantee derived fields are consistent after any mutation. */
function normalizeState(state) {
  const order = state.clueOrder?.length ? state.clueOrder : state.players.map((p) => p.id)
  return {
    ...state,
    clueOrder: order,
    timer: state.timer || { running: false, secondsLeft: state.config?.turnSeconds ?? 30, duration: state.config?.turnSeconds ?? 30 },
    votes: state.votes || {},
    history: state.history || [],
  }
}

/* -------------------------------------------------------------------------- */
/* Phase transitions                                                          */
/* -------------------------------------------------------------------------- */

/** Tap "reveal" on the current card. */
export function revealCard(state) {
  if (state.phase !== GAME_PHASES.HANDOFF) return state
  return { ...state, phase: GAME_PHASES.REVEAL, cardVisible: true }
}

/** Tap "hide" — the secret must never stay visible while the phone moves on. */
export function hideCard(state) {
  if (state.phase !== GAME_PHASES.REVEAL) return state
  return { ...state, phase: GAME_PHASES.HANDOFF, cardVisible: false }
}

/** Move to the next player's card, or on to the briefing once everyone looked. */
export function advanceReveal(state) {
  const roster = alivePlayers(state)
  const nextIndex = state.revealIndex + 1
  const players = state.players.map((p) =>
    p.id === roster[state.revealIndex]?.id ? { ...p, revealed: true } : p,
  )
  if (nextIndex >= roster.length) {
    return { ...state, players, revealIndex: 0, cardVisible: false, phase: GAME_PHASES.BRIEFING }
  }
  return { ...state, players, revealIndex: nextIndex, cardVisible: false, phase: GAME_PHASES.HANDOFF }
}

/** Begin a clue round (clue order is re-rolled for players eliminated mid-game). */
export function startRound(state) {
  const alive = alivePlayers(state)
  return {
    ...state,
    phase: GAME_PHASES.CLUES,
    clueOrder: rollClueOrder(alive, state.config.clueOrder),
    clueIndex: 0,
    votes: {},
    voteIndex: 0,
    timer: { running: false, secondsLeft: state.config.turnSeconds, duration: state.config.turnSeconds },
  }
}

export function startTimer(state) {
  return { ...state, timer: { ...state.timer, running: true, secondsLeft: state.config.turnSeconds } }
}

export function pauseTimer(state) {
  return { ...state, timer: { ...state.timer, running: false } }
}

export function resetTimer(state) {
  return {
    ...state,
    timer: { running: false, secondsLeft: state.config.turnSeconds, duration: state.config.turnSeconds },
  }
}

export function tickTimer(state, deltaSeconds = 1) {
  if (!state.timer.running) return state
  const secondsLeft = Math.max(0, state.timer.secondsLeft - deltaSeconds)
  return { ...state, timer: { ...state.timer, secondsLeft, running: secondsLeft > 0 } }
}

/** Next player's clue. */
export function nextClue(state) {
  const order = state.clueOrder.filter((id) => playerById(state, id)?.alive)
  const nextIndex = state.clueIndex + 1
  if (nextIndex >= order.length) {
    return { ...state, phase: GAME_PHASES.VOTE_INTRO, timer: { ...state.timer, running: false } }
  }
  return {
    ...state,
    clueIndex: nextIndex,
    timer: { ...state.timer, running: false, secondsLeft: state.config.turnSeconds },
  }
}

export function beginVoting(state) {
  if (state.config.voteMode === 'open') {
    return { ...state, phase: GAME_PHASES.VOTE_CAST, votes: {} }
  }
  return { ...state, phase: GAME_PHASES.VOTE_HANDOFF, voteIndex: 0, votes: {} }
}

/** Move from the pass-the-device hand-off screen into the actual ballot. */
export function openBallot(state) {
  if (state.phase !== GAME_PHASES.VOTE_HANDOFF && state.phase !== GAME_PHASES.VOTE_CAST) return state
  return { ...state, phase: GAME_PHASES.VOTE_CAST }
}

/**
 * Legal-move guard used by both local UI and the online host.
 * A vote is legal when the voter is alive, the target is alive, differs from
 * the voter (unless it is the single open-vote accusation), and both exist.
 */
export function validateMove(state, move) {
  if (!move) return { ok: false, error: 'Nothing to submit.' }
  const { type } = move
  if (type === 'castVote') {
    const voter = playerById(state, move.voterId)
    const target = playerById(state, move.targetId)
    if (!voter || !target) return { ok: false, error: 'Unknown player.' }
    if (!voter.alive) return { ok: false, error: 'Eliminated players cannot vote.' }
    if (!target.alive) return { ok: false, error: 'That player is already out of the game.' }
    if (voter.id === target.id) return { ok: false, error: 'You cannot vote for yourself.' }
    if (state.votes[voter.id]) return { ok: false, error: 'Vote already locked.' }
    return { ok: true }
  }
  if (type === 'openVote') {
    const target = playerById(state, move.targetId)
    if (!target?.alive) return { ok: false, error: 'Pick a player who is still in the game.' }
    return { ok: true }
  }
  return { ok: false, error: 'Unsupported move.' }
}

/** Record a secret ballot vote and advance the pass-the-device pointer. */
export function castVote(state, voterId, targetId) {
  const check = validateMove(state, { type: 'castVote', voterId, targetId })
  if (!check.ok) return state
  const votes = { ...state.votes, [voterId]: targetId }
  const voters = alivePlayers(state)
  const nextIndex = state.voteIndex + 1
  if (nextIndex >= voters.length) {
    return { ...state, votes, phase: GAME_PHASES.TALLY }
  }
  return { ...state, votes, voteIndex: nextIndex, phase: GAME_PHASES.VOTE_HANDOFF }
}

/* -------------------------------------------------------------------------- */
/* Tallies & outcomes                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Count the votes.
 * @returns {{ counts: Record<string, number>, order: string[], max: number, leaders: string[], tie: boolean, total: number }}
 */
export function calculateVotes(state, votes = state.votes) {
  const counts = {}
  Object.values(votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1
  })
  const order = Object.keys(counts)
    .map((id) => ({ id, count: counts[id] }))
    .sort((a, b) => b.count - a.count || String(playerById(state, a.id)?.name).localeCompare(String(playerById(state, b.id)?.name)))
    .map((entry) => entry.id)
  const max = order.length ? counts[order[0]] : 0
  const leaders = order.filter((id) => counts[id] === max)
  const total = Object.keys(votes).length
  return { counts, order, max, leaders, tie: leaders.length > 1, total }
}

/** Resolve the current round: who goes out, and did anybody win. */
export function resolveRound(state) {
  if (state.config.voteMode === 'open') {
    const targetId = state.votes.__open__ || null
    const target = targetId ? playerById(state, targetId) : null
    const wasImposter = Boolean(target && isImposter(target))
    const next = eliminate(state, targetId)
    return finalize(next, {
      round: state.round,
      eliminatedId: targetId,
      eliminatedName: target?.name || null,
      wasImposter,
      tie: false,
      counts: targetId ? { [targetId]: 1 } : {},
      order: targetId ? [targetId] : [],
      total: targetId ? 1 : 0,
      autoEliminated: false,
    })
  }

  const tally = calculateVotes(state)
  const targetId = tally.tie ? null : tally.leaders[0] || null
  const target = targetId ? playerById(state, targetId) : null
  const wasImposter = Boolean(target && isImposter(target))
  const next = eliminate(state, targetId)
  return finalize(next, {
    round: state.round,
    eliminatedId: targetId,
    eliminatedName: target?.name || null,
    wasImposter,
    tie: tally.tie,
    counts: tally.counts,
    order: tally.order,
    total: tally.total,
    autoEliminated: false,
  })
}

function eliminate(state, targetId) {
  if (!targetId) return state
  return {
    ...state,
    players: state.players.map((p) => (p.id === targetId ? { ...p, alive: false, eliminatedRound: state.round } : p)),
  }
}

/**
 * Decide who won, freeze the round result and set the phase.
 * Crew wins when every imposter is gone; imposters win on survival rules.
 */
export function determineWinner(state) {
  const remainingImposters = aliveImposters(state).length
  const remainingCrew = aliveCrew(state).length

  if (remainingImposters === 0) {
    return { team: 'crew', reason: 'Every imposter was removed from the ship.' }
  }
  if (state.config.winRule === 'survival') {
    if (remainingImposters >= remainingCrew) {
      return { team: 'imposter', reason: 'The imposters now match the crew — they cannot be outvoted.' }
    }
    if (state.round >= state.totalRounds) {
      return { team: 'imposter', reason: 'The imposters survived every round.' }
    }
    return null
  }
  return { team: 'imposter', reason: 'The wrong player was accused and the imposters walked free.' }
}

function finalize(state, result) {
  const withHistory = {
    ...state,
    history: [...state.history, { ...result, eliminatedId: result.eliminatedId, wasImposter: result.wasImposter }],
  }
  let winner = determineWinner(withHistory)

  // Classic mode: a tie means nobody is accused, so the imposters escape.
  if (!winner && withHistory.config.winRule === 'classic') {
    winner = { team: 'imposter', reason: 'The vote was split, nobody was accused, and the imposters escaped.' }
  }

  const lastResult = { ...result, winner: winner?.team || null }
  return { ...withHistory, lastResult, winner, phase: GAME_PHASES.RESULT }
}

/** Advance to the next round of clues (survival mode). */
export function nextRound(state) {
  if (state.winner) return state
  return {
    ...state,
    round: state.round + 1,
    phase: GAME_PHASES.HANDOFF,
    revealIndex: 0,
    cardVisible: false,
    clueIndex: 0,
    votes: {},
    voteIndex: 0,
    timer: { running: false, secondsLeft: state.config.turnSeconds, duration: state.config.turnSeconds },
  }
}

/**
 * Fresh game, same players and configuration.
 * @param {object} state
 * @param {{ rotateSecret?: {word:object} }} [opts]
 */
export function resetGame(state, opts = {}) {
  const names = state.players.map((p) => p.name)
  return createGame(state.config, names, opts.rotateSecret ?? { word: state.secret })
}

/** Full "play again" that also swaps the secret word. */
export function replayGame(state, secret) {
  return resetGame(state, { rotateSecret: { word: secret } })
}

/** Boot a game straight from the player roster in one call (used by tests/UI). */
export function startGame(config, names, bank) {
  const { config: safe } = validateGameConfig({ ...config, playerCount: names.length })
  const picked = bank?.pick ? bank.pick(safe) : null
  return createGame(safe, names, picked ? { word: picked } : { word: null })
}

/* -------------------------------------------------------------------------- */
/* Reducer used by the local game hook                                        */
/* -------------------------------------------------------------------------- */

export function gameReducer(state, action) {
  if (!state) return state
  switch (action.type) {
    case 'REVEAL_CARD':
      return revealCard(state)
    case 'HIDE_CARD':
      return hideCard(state)
    case 'ADVANCE_REVEAL':
      return advanceReveal(state)
    case 'START_ROUND':
      return startRound(state)
    case 'START_TIMER':
      return startTimer(state)
    case 'PAUSE_TIMER':
      return pauseTimer(state)
    case 'RESET_TIMER':
      return resetTimer(state)
    case 'TICK':
      return tickTimer(state, action.delta ?? 1)
    case 'NEXT_CLUE':
      return nextClue(state)
    case 'BEGIN_VOTING':
      return beginVoting(state)
    case 'OPEN_BALLOT':
      return openBallot(state)
    case 'CAST_VOTE':
      return castVote(state, action.voterId, action.targetId)
    case 'OPEN_VOTE':
      return { ...state, votes: { __open__: action.targetId }, phase: GAME_PHASES.TALLY }
    case 'RESOLVE_ROUND':
      return resolveRound(state)
    case 'NEXT_ROUND':
      return nextRound(state)
    case 'REPLAY':
      return replayGame(state, action.secret ?? state.secret)
    default:
      return state
  }
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

/** A short rules line for the current round, shown during briefing. */
export function roundObjective(state) {
  if (state.config.winRule === 'survival') {
    return `Round ${state.round} of ${state.totalRounds} — remove an imposter before they outnumber you.`
  }
  return `Round ${state.round} — one vote decides everything.`
}

/** Ordered roster used by the reveal / clue screens. */
export function rosterOrder(state) {
  return state.players.slice().sort((a, b) => a.seat - b.seat)
}

/** Random flavour line for the briefing screen (no repeats within a round). */
const BRIEF_LINES = [
  'Say one word about the secret. Too obvious and the imposters learn it — too vague and you look guilty.',
  'Imposters can lean on the decoy. Stay sharp.',
  'No repeating someone else\'s clue. No spelling it out. No saying "it is a noun".',
  'Watch the faces, not just the words.',
  'The imposters are improvising. Pressure exposes improvisation.',
]
export function briefLine(state) {
  return BRIEF_LINES[(state.round - 1 + randomInt(BRIEF_LINES.length)) % BRIEF_LINES.length]
}

/** Round summary used by the results screen. */
export function roundSummary(state) {
  const r = state.lastResult
  if (!r) return null
  const tally = (r.order || []).map((id) => ({
    id,
    name: playerById(state, id)?.name || 'Unknown',
    count: r.counts[id] || 0,
    wasImposter: isImposter(playerById(state, id)),
  }))
  return { ...r, tally }
}

/** Everything the UI needs to render the "who was what" screen. */
export function fullReveal(state) {
  return state.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    alive: p.alive,
    eliminatedRound: p.eliminatedRound,
  }))
}

export const ROLE = ROLES
export const RULE_PRESETS = WIN_RULES
export { randomPick }
