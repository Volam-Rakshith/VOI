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

import { GAME_MODES, GAME_PHASES, ROLES, WIN_RULES } from '../data/constants.js'
import { uid, shuffle, randomInt, randomPick } from '../utils/random.js'
import { validateGameConfig, normalizeName } from '../utils/validate.js'

export const PHASE = GAME_PHASES

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export const alivePlayers = (state) => state.players.filter((p) => p.alive)

/**
 * A split vote normally removes nobody and the game simply plays on. With
 * exactly two players still in it that tie can never be broken — each of them
 * may only vote for the other — so the round would repeat forever. A vote only
 * ever runs when at least one imposter and one crew member are alive, so those
 * two players are one of each and the round resolves: the imposter was never
 * caught, and takes it.
 */
export function isVoteStalemate(state, tally) {
  if (!tally?.tie) return false
  if (alivePlayers(state).length !== 2) return false
  return aliveImposters(state).length >= 1 && aliveCrew(state).length >= 1
}

/**
 * The line the table reads after a vote.
 *
 * The user asked for the outcome to be spelled out, so it is: the player who
 * left is named, whether a crewmate or an imposter was removed, and how many
 * players are still in the game. (This deliberately replaces the older
 * "nobody is told what they were" wording.)
 */
export function voteOutcomeLine({ name, wasImposter = false, alive = null, guess = null, chaosNoImposter = false } = {}) {
  const who = name || 'That player'
  const left =
    Number.isFinite(alive) && alive > 0
      ? alive === 1
        ? '1 player remains.'
        : `${alive} players remain.`
      : 'The hunt continues.'
  if (chaosNoImposter) return chaosNoImposterLine()
  if (wasImposter) {
    return guess === 'wrong'
      ? `${who} was an imposter ! The word went unguessed — ${left}`
      : `${who} is out of the game. You caught an imposter ! ${left}`
  }
  return `${who} is out of the game. You voted out a crewmate ! ${left}`
}

/** Copy for the round a two-player tie can no longer be broken in. */
export function voteStalemateReason() {
  return 'The last two players split the vote and neither could break it — with nobody able to catch them, the imposters take the game.'
}
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
/**
 * The single win condition, in one sentence, for whatever mode is in play.
 * `winRule` is still accepted so older saved configurations keep loading.
 */
export function winConditionText(winRule, mode) {
  if (mode === 'chaos') {
    return 'Chaos rounds re-roll who the imposters are every few rounds — sometimes nobody, sometimes everyone. Crew wins by removing the last imposter. Imposters win as soon as they match the crew (no vote can remove them then), by outlasting the crew, or by naming the word after being caught.'
  }
  return 'Crew wins by removing the last imposter. Imposters win the moment they match the crew — once as many imposters are alive as crew, no vote can remove them — or by outlasting the crew, or by naming the secret word after being caught.'
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

/**
 * CHAOS MODE — the imposter count is re-rolled every round.
 *
 * Outcomes are weighted so all four flavours show up often enough to be felt:
 * exactly one, a few, many, or the entire table (no crew at all — the spec is
 * explicit that a normal player is never forced).
 *
 * Every player has the same chance of being chosen: the count is random AND the
 * seats are shuffled with `crypto`-backed randomness.
 */
export const CHAOS_TIERS = [
  { id: 'none', label: 'nobody', weight: 12 },
  { id: 'single', label: 'one', weight: 30 },
  { id: 'few', label: 'several', weight: 22 },
  { id: 'many', label: 'many', weight: 21 },
  { id: 'all', label: 'everyone', weight: 15 },
]

/**
 * Chaos is an EVENT, not a permanent state: it fires every 3–5 rounds and the
 * rounds in between play out normally with the configured imposter count.
 */
export const CHAOS_GAP_MIN = 3
export const CHAOS_GAP_MAX = 5

/**
 * The next round a chaos event is due: this one plus 3–5 rounds. The online
 * host schedules rounds with the same gap so both modes keep the same cadence.
 */
export function scheduleNextChaosRound(round) {
  return round + CHAOS_GAP_MIN + randomInt(CHAOS_GAP_MAX - CHAOS_GAP_MIN + 1)
}

/** True when `round` is one of this game's chaos rounds. */
export function isChaosRound(state, round = state.round) {
  return isChaosMode(state.config) && Number.isFinite(state.nextChaosRound) && round >= state.nextChaosRound
}

/** Which flavour a given imposter count represents, for copy + tests. */
export function chaosTierFor(total, imposterCount) {
  if (imposterCount <= 0) return 'none'
  if (imposterCount >= total) return 'all'
  if (imposterCount === 1) return 'single'
  if (imposterCount <= Math.max(2, Math.ceil(total / 3))) return 'few'
  return 'many'
}

/**
 * Roll an imposter count for `playerCount` players.
 * Returns a number in 1..playerCount — `playerCount` means everyone.
 */
export function rollChaosImposterCount(playerCount) {
  const total = Math.max(2, Math.floor(playerCount) || 0)
  const tierOf = (count) => chaosTierFor(total, count)
  const weights = CHAOS_TIERS.map((tier) => tier.weight)

  // Weighted draw over the tiers, then a uniform count inside the tier's range.
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  let roll = randomInt(totalWeight)
  let chosen = CHAOS_TIERS[CHAOS_TIERS.length - 1].id
  for (let i = 0; i < CHAOS_TIERS.length; i += 1) {
    if (roll < weights[i]) {
      chosen = CHAOS_TIERS[i].id
      break
    }
    roll -= weights[i]
  }

  // 0 is a legitimate chaos outcome: a round where nobody is an imposter.
  const counts = Array.from({ length: total + 1 }, (_, i) => i).filter((count) => tierOf(count) === chosen)
  // Degenerate tables (2 players) can leave a tier empty — fall back to any count.
  const pool = counts.length ? counts : Array.from({ length: total + 1 }, (_, i) => i)
  return pool[randomInt(pool.length)]
}

/**
 * Chaos role assignment.
 * Unlike `assignRoles` this does NOT clamp to a minority: everyone can be an
 * imposter, including all players at once.
 */
export function assignChaosRoles(playerCount, forcedCount = null) {
  const total = Math.max(2, Math.floor(playerCount) || 0)
  const count = forcedCount === null
    ? rollChaosImposterCount(total)
    : Math.max(0, Math.min(total, Math.floor(forcedCount) || 0))
  const roles = Array(total).fill(ROLES.CREW)
  const seats = shuffle(Array.from({ length: total }, (_, i) => i))
  for (let i = 0; i < count; i += 1) roles[seats[i]] = ROLES.IMPOSTER
  return {
    roles,
    imposterCount: count,
    seats: seats.slice(0, count),
    chaos: true,
    tier: chaosTierFor(total, count),
  }
}

/** True when a configuration asks for randomised (chaos) role assignment. */
export const isChaosMode = (config) => config?.mode === 'chaos'

/**
 * Single entry point for role assignment, so local and online can never drift.
 * Normal mode is untouched: it still goes through `assignRoles` exactly as before.
 */
export function assignRolesFor(config, playerCount) {
  if (isChaosMode(config)) {
    const assignment = assignChaosRoles(playerCount)
    return { ...assignment, imposterCount: assignment.imposterCount }
  }
  const assignment = assignRoles(playerCount, config?.imposterCount)
  return { ...assignment, chaos: false, tier: null }
}

/**
 * The deal a game opens on.
 *
 * Chaos is an event that lands every few rounds, so a chaos game still opens
 * with the ordinary configured deal — the first re-roll waits for
 * `nextChaosRound`. Anything else would let round one be an all-imposter table
 * that ends the game before it starts.
 */
export function assignOpeningRoles(config, playerCount) {
  if (!isChaosMode(config)) return assignRolesFor(config, playerCount)
  const assignment = assignRoles(playerCount, config?.imposterCount)
  return { ...assignment, chaos: false, tier: null }
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
  const { roles, imposterCount, chaos, tier } = assignOpeningRoles(safeConfig, names.length)

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
    pendingGuess: null,
    history: [],
    /* Chaos bookkeeping. Kept out of the UI during play so the count stays secret. */
    chaos: Boolean(chaos),
    chaosTier: tier,
    imposterCount: imposterCount,
    /* The first chaos round lands 3–5 rounds in; the rounds before it play
       normally. Unused (null) in normal mode. */
    nextChaosRound: isChaosMode(safeConfig) ? CHAOS_GAP_MIN + randomInt(CHAOS_GAP_MAX - CHAOS_GAP_MIN + 1) : null,
    chaosRound: false,
  })
}

/**
 * Re-roll roles for everyone still in play (chaos rounds do this every round).
 * Eliminated players keep the role they were judged on — their history stands.
 */
export function rerollChaosRoles(state) {
  if (!isChaosMode(state.config)) return state
  const living = state.players.filter((p) => p.alive)
  if (!living.length) return state

  const { roles, imposterCount, tier } = assignChaosRoles(living.length)
  const roleByPlayer = new Map(living.map((player, index) => [player.id, roles[index]]))

  return {
    ...state,
    players: state.players.map((p) =>
      roleByPlayer.has(p.id)
        ? { ...p, role: roleByPlayer.get(p.id), revealed: false }
        : { ...p, revealed: false },
    ),
    chaos: true,
    chaosTier: tier,
    imposterCount,
  }
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
  /*
   * A chaos round can deal nobody an imposter card, or everybody one. Neither
   * has a useful vote, so the round ends here with an honest announcement
   * instead of asking the table to accuse somebody.
   */
  const dealtImposters = state.players.filter(isImposter).length
  const livingImposters = aliveImposters(state).length
  const livingCrew = aliveCrew(state).length

  if (dealtImposters === 0) {
    return {
      ...state,
      phase: GAME_PHASES.RESULT,
      lastResult: { round: state.round, noImposter: true, winner: null, tie: false, counts: {}, order: [], total: 0 },
      winner: null,
    }
  }

  if (livingCrew === 0) {
    const winner = determineWinner(state)
    return {
      ...state,
      phase: GAME_PHASES.RESULT,
      winner,
      lastResult: { round: state.round, allImposters: true, winner: winner?.team || null, tie: false, counts: {}, order: [], total: 0 },
    }
  }

  if (livingImposters === 0) {
    const winner = determineWinner(state)
    return {
      ...state,
      phase: GAME_PHASES.RESULT,
      winner,
      lastResult: { round: state.round, winner: winner?.team || null, tie: false, counts: {}, order: [], total: 0 },
    }
  }

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
  if (type === 'submitGuess') {
    if (state.phase !== GAME_PHASES.GUESS) return { ok: false, error: 'No guess is being taken right now.' }
    const guess = String(move.guess || '').trim()
    if (!guess) return { ok: false, error: 'Type the word you think the crew had.' }
    if (guess.length > 40) return { ok: false, error: 'That is longer than any word in the bank.' }
    return { ok: true }
  }
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

  /* Two players left means the split can never be broken — see isVoteStalemate. */
  if (isVoteStalemate(state, tally)) {
    const stalemateResult = {
      round: state.round,
      eliminatedId: null,
      eliminatedName: null,
      wasImposter: false,
      tie: true,
      stalemate: true,
      counts: tally.counts,
      order: tally.order,
      total: tally.total,
      autoEliminated: false,
      guess: null,
      winner: 'imposter',
    }
    return {
      ...state,
      history: [...state.history, stalemateResult],
      lastResult: stalemateResult,
      winner: { team: 'imposter', reason: voteStalemateReason(), chaos: false },
      phase: GAME_PHASES.RESULT,
    }
  }

  /* A split vote removes nobody: the game simply continues to the next round. */
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
 * The game runs until one side has nobody left.
 *
 *   • Every imposter removed  → crew wins.
 *   • Every crew member removed → imposters win.
 *   • Anything else → the game continues, however many votes that takes.
 *
 * There is no round limit and no "one vote decides" shortcut. A round where
 * chaos dealt nobody an imposter card has nothing to catch, so it can never end
 * the game — it just plays out and moves on.
 *
 * A correct last guess by a caught imposter is handled in `submitGuess`; this
 * function only judges the roster.
 */
export function determineWinner(state) {
  const totalImposters = state.players.filter(isImposter).length
  const remainingImposters = aliveImposters(state).length
  const remainingCrew = aliveCrew(state).length

  if (remainingCrew === 0 && state.players.length) {
    return {
      team: 'imposter',
      reason:
        totalImposters === state.players.length
          ? 'Every single player was an imposter — there was no crew to catch anyone.'
          : 'The last crew member is gone — the imposters have the ship.',
      chaos: totalImposters === state.players.length,
    }
  }

  if (totalImposters > 0 && remainingImposters === 0) {
    return {
      team: 'crew',
      reason:
        totalImposters > 1
          ? `All ${totalImposters} imposters were rooted out.`
          : 'The imposter was caught and removed — the crew takes the ship.',
    }
  }

  /*
   * PARITY — the imposters have won without another round being played.
   *
   * Once as many imposters are alive as there are crew, no vote can ever remove
   * them: they can tie every ballot, and any crewmate who pushes is the one
   * voted out. With two players left (one crew, one imposter) the split can
   * never be broken at all. The table used to be made to play out those rounds
   * anyway, which is the "it still continues??" complaint — the game now ends
   * the moment parity is reached.
   */
  if (remainingImposters > 0 && remainingImposters >= remainingCrew) {
    return {
      team: 'imposter',
      reason:
        remainingCrew === 1
          ? 'Only two players are left — one crewmate and one imposter — and no vote can remove an imposter. The imposters take the game.'
          : `The imposters now match the crew (${remainingImposters} vs ${remainingCrew}) — every vote can be tied and no imposter can be removed. The imposters take the game.`,
      chaos: false,
    }
  }

  return null
}

/** True when the living roster contains no imposter at all (a chaos round). */
export function isImposterFreeRound(state) {
  return aliveImposters(state).length === 0 && state.players.filter(isImposter).length === 0
}

function finalize(state, result) {
  const withHistory = {
    ...state,
    history: [...state.history, { ...result, eliminatedId: result.eliminatedId, wasImposter: result.wasImposter }],
  }

  /*
   * Caught imposter, always — even the last one. They get one attempt at the
   * crew's word, and only then is anything settled: right hands the game to the
   * imposters, wrong settles it on the roster. Nobody is told which role was
   * removed, because the guess screen belongs to the accused player's own device.
   */
  if (result.wasImposter && result.eliminatedId) {
    const accused = playerById(withHistory, result.eliminatedId)
    return {
      ...withHistory,
      lastResult: { ...result, winner: null, guess: null },
      winner: null,
      pendingGuess: { playerId: result.eliminatedId, name: accused?.name || 'The accused' },
      phase: GAME_PHASES.GUESS,
    }
  }

  const winner = determineWinner(withHistory)
  const lastResult = { ...result, winner: winner?.team || null, guess: null }
  return { ...withHistory, lastResult, winner, phase: GAME_PHASES.RESULT }
}

/**
 * The caught imposter names the crew's word.
 * Right → the imposters take the game outright. Wrong → they are simply gone.
 */
export function submitGuess(state, guessText) {
  if (state.phase !== GAME_PHASES.GUESS) return state
  const truth = normalizeGuess(state.secret?.word)
  const attempt = normalizeGuess(guessText)
  const correct = Boolean(truth && attempt && truth === attempt)

  const base = {
    ...state,
    pendingGuess: null,
    history: state.history.map((entry, index) =>
      index === state.history.length - 1 ? { ...entry, guess: correct ? 'correct' : 'wrong' } : entry,
    ),
  }

  if (correct) {
    const winner = {
      team: 'imposter',
      reason: 'The caught imposter named the secret word — the imposters take the game.',
    }
    return {
      ...base,
      winner,
      lastResult: { ...(base.lastResult || {}), winner: 'imposter', guess: 'correct', guessText: String(guessText || '').trim() },
      phase: GAME_PHASES.RESULT,
    }
  }

  const winner = determineWinner(base)
  return {
    ...base,
    winner,
    lastResult: { ...(base.lastResult || {}), winner: winner?.team || null, guess: 'wrong', guessText: String(guessText || '').trim() },
    phase: GAME_PHASES.RESULT,
  }
}

/** Compare guesses forgivingly: case, spacing and punctuation never matter. */
function normalizeGuess(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Advance to the next round of clues (survival mode). */
export function nextRound(state) {
  if (state.winner) return state
  const round = state.round + 1

  /*
   * Chaos fires every 3–5 rounds. On a chaos round the roles are re-rolled —
   * sometimes nobody gets the card, sometimes everybody does. Between chaos
   * rounds the base assignment stands, and a round that dealt no imposter at
   * all puts the configured count back so the game can be won again.
   */
  const chaosNow = isChaosRound(state, round)
  const needsBase = !chaosNow && isImposterFreeRound(state)
  const assigned = chaosNow ? rerollChaosRoles(state) : needsBase ? restoreBaseRoles(state) : state

  /*
   * Cards are only dealt again when something actually changed: a chaos round
   * re-rolls every role, and a round that restored the base assignment changes
   * roles too. Otherwise nobody learns anything new from a second look, so the
   * round opens straight into the briefing (the table asked for exactly this).
   */
  const redeal = chaosNow || needsBase

  return {
    ...assigned,
    round,
    phase: redeal ? GAME_PHASES.HANDOFF : GAME_PHASES.BRIEFING,
    players: redeal ? assigned.players : assigned.players.map((p) => (p.revealed ? p : { ...p, revealed: true })),
    revealIndex: 0,
    cardVisible: false,
    clueIndex: 0,
    votes: {},
    voteIndex: 0,
    lastResult: null,
    pendingGuess: null,
    chaosRound: chaosNow,
    nextChaosRound: chaosNow ? scheduleNextChaosRound(round) : assigned.nextChaosRound,
    timer: { running: false, secondsLeft: assigned.config.turnSeconds, duration: assigned.config.turnSeconds },
  }
}

/**
 * Put the configured imposter count back on the living roster. Used after a
 * chaos round that dealt nobody an imposter card — otherwise the table would be
 * stuck with nothing to hunt for the rest of the game.
 */
export function restoreBaseRoles(state) {
  const living = state.players.filter((p) => p.alive)
  if (!living.length) return state
  const { roles, imposterCount, tier } = assignRolesFor({ ...state.config, mode: 'normal' }, living.length)
  const roleByPlayer = new Map(living.map((player, index) => [player.id, roles[index]]))

  return {
    ...state,
    players: state.players.map((p) =>
      roleByPlayer.has(p.id) ? { ...p, role: roleByPlayer.get(p.id), revealed: false } : { ...p, revealed: false },
    ),
    chaos: false,
    chaosTier: tier,
    imposterCount,
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
    case 'SUBMIT_GUESS':
      return submitGuess(state, action.guess)
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
  if (isChaosRound(state)) {
    return `Round ${state.round} — CHAOS. Nobody knows how many imposters are among you.`
  }
  return `Round ${state.round} — vote someone out. The game runs until one side is gone.`
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
  const line = BRIEF_LINES[(state.round - 1 + randomInt(BRIEF_LINES.length)) % BRIEF_LINES.length]
  if (isChaosRound(state)) {
    return `CHAOS ROUND ${state.round} — roles were re-rolled. You may not be who you were. ${line}`
  }
  return line
}

/** Copy for the moment a chaos round turns out to hold no imposter at all. */
export function chaosNoImposterLine() {
  return 'NO IMPOSTER THIS ROUND — every single player was crew. There was nobody to catch, so the game moves on.'
}

/** Copy for the moment a chaos round deals an imposter card to everyone. */
export function chaosAllImposterLine() {
  return 'EVERY PLAYER WAS AN IMPOSTER — with no crew left, the deception simply wins.'
}

/**
 * Round summary used by the results screen.
 *
 * Vote counts only — a role is never attached to a player here, because a
 * single vote must not give the table away. Roles are revealed by
 * `fullReveal` once the game is actually over.
 */
export function roundSummary(state) {
  const r = state.lastResult
  if (!r) return null
  const tally = (r.order || []).map((id) => ({
    id,
    name: playerById(state, id)?.name || 'Unknown',
    count: r.counts[id] || 0,
    alive: Boolean(playerById(state, id)?.alive),
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
export { WIN_RULES }
export const RULE_PRESETS = WIN_RULES
export { randomPick }
