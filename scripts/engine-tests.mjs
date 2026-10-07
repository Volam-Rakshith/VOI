#!/usr/bin/env node
/**
 * Engine + utility test suite.
 *   npm run test:engine
 *
 * The game rules are pure functions, so they can be verified without a browser.
 * These tests run in plain Node against the real source files — no bundler,
 * no mocks, no network.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/* ------------------------------------------------------------------ */
/* Tiny harness                                                        */
/* ------------------------------------------------------------------ */
let passed = 0
let failed = 0
const failures = []

const pending = []

function report(name, error) {
  if (!error) {
    passed += 1
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`)
    return
  }
  failed += 1
  failures.push({ name, error })
  process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n      ${error.message.split('\n')[0]}\n`)
}

/**
 * Async assertions are queued and awaited before the summary — otherwise a
 * rejected promise would slip through as a pass and hide a real failure.
 */
function test(name, fn) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      pending.push(result.then(() => report(name, null), (error) => report(name, error)))
      return
    }
    report(name, null)
  } catch (error) {
    report(name, error)
  }
}

function group(title) {
  process.stdout.write(`\n\x1b[36m${title}\x1b[0m\n`)
}

/* ------------------------------------------------------------------ */
/* Modules under test                                                  */
/* ------------------------------------------------------------------ */
const engine = await import('../src/lib/gameEngine.js')
const random = await import('../src/utils/random.js')
const validate = await import('../src/utils/validate.js')
const bank = await import('../src/lib/wordBank.js')
const onlineGame = await import('../src/lib/onlineGame.js')
const onlineService = await import('../src/lib/onlineService.js')
const runtimeConfig = await import('../src/lib/runtimeConfig.js')
const supabaseLib = await import('../src/lib/supabase.js')

const SECRET = { word: { word: 'Umbrella', categoryId: 'everyday', categoryName: 'Everyday', difficulty: 'easy', decoy: 'Raincoat' } }
/** The engine stores the payload unwrapped — this is the word players would guess. */
const SECRET_WORD = SECRET.word.word
const names = (n) => Array.from({ length: n }, (_, i) => `Player ${i + 1}`)
const config = (over = {}) => ({ playerCount: 6, imposterCount: 1, turnSeconds: 30, rounds: 2, winRule: 'classic', voteMode: 'secret', clueOrder: 'random', categoryIds: ['random'], difficulty: 'mixed', ...over })

/* ================================================================== */
group('ROLE ASSIGNMENT')

test('assigns exactly the requested number of imposters', () => {
  for (let run = 0; run < 200; run += 1) {
    const { roles } = engine.assignRoles(8, 2)
    assert.equal(roles.length, 8)
    assert.equal(roles.filter((r) => r === 'imposter').length, 2)
  }
})

test('never lets imposters reach half the table', () => {
  const { imposterCount } = engine.assignRoles(4, 9)
  assert.ok(imposterCount <= 1, `expected <=1, got ${imposterCount}`)
  const { imposterCount: c2 } = engine.assignRoles(2, 5)
  assert.equal(c2, 1)
})

test('roles are shuffled (not always the same seats)', () => {
  const signatures = new Set()
  for (let run = 0; run < 60; run += 1) {
    const { roles } = engine.assignRoles(6, 1)
    signatures.add(roles.join(','))
  }
  assert.ok(signatures.size > 2, 'expected positional variety')
})

test('strong RNG is available in this runtime', () => {
  assert.equal(typeof random.hasStrongRandom, 'boolean')
  assert.ok(random.randomUint32() >= 0)
})

test('room codes avoid ambiguous characters', () => {
  for (let i = 0; i < 400; i += 1) {
    const code = random.generateRoomCode()
    assert.equal(code.length, 4)
    assert.ok(!/[OIL01SZ25]/.test(code), `ambiguous character in ${code}`)
  }
})

/* ================================================================== */
group('GAME SETUP')

test('createGame builds a full roster with roles and a secret', () => {
  const game = engine.createGame(config(), names(6), SECRET)
  assert.equal(game.players.length, 6)
  assert.equal(game.round, 1)
  assert.equal(game.phase, engine.PHASE.HANDOFF)
  assert.equal(game.secret.word, 'Umbrella')
  assert.equal(game.players.filter((p) => p.role === 'imposter').length, 1)
  assert.ok(game.players.every((p) => p.alive))
  assert.equal(game.timer.secondsLeft, 30)
})

test('the imposter never receives the word (engine level)', () => {
  // The engine holds one shared secret; the per-player card decides what is
  // shown. This mirrors the online secrets payload construction.
  for (let run = 0; run < 50; run += 1) {
    const game = engine.createGame(config({ imposterCount: 2 }), names(9), SECRET)
    const imposter = game.players.find((p) => p.role === 'imposter')
    const payload = { role: imposter.role, word: imposter.role === 'imposter' ? null : game.secret.word, decoy: game.secret.decoy }
    assert.equal(payload.word, null)
    assert.equal(payload.decoy, 'Raincoat')
  }
})

test('setup rejects impossible configurations', () => {
  const { config: safe, errors } = validate.validateGameConfig({ ...config(), playerCount: 20, imposterCount: 12 })
  assert.ok(safe.imposterCount <= Math.floor((20 - 1) / 2))
  assert.deepEqual(errors, {})
})

test('turn length outside the offered values is flagged', () => {
  const { errors } = validate.validateGameConfig({ ...config(), turnSeconds: 17 })
  assert.ok(errors.turnSeconds)
})

test('createGame tolerates both secret shapes (no double wrapping)', () => {
  const payload = { word: 'Umbrella', categoryName: 'Everyday', difficulty: 'easy', decoy: 'Raincoat' }
  const wrapped = engine.createGame(config(), names(4), { word: payload })
  const direct = engine.createGame(config(), names(4), payload)
  assert.equal(wrapped.secret.word, 'Umbrella')
  assert.equal(direct.secret.word, 'Umbrella')
  assert.equal(direct.secret.categoryName, 'Everyday')
  assert.equal(typeof direct.secret, 'object')
})

/* ================================================================== */
group('REVEAL LIFECYCLE')

test('cards reveal, hide and only then advance', () => {
  let game = engine.createGame(config(), names(4), SECRET)
  assert.equal(game.phase, 'handoff')
  game = engine.revealCard(game)
  assert.equal(game.cardVisible, true)
  assert.equal(game.phase, 'reveal')
  game = engine.hideCard(game)
  assert.equal(game.cardVisible, false)
  assert.equal(game.phase, 'handoff')
  game = engine.advanceReveal(game)
  assert.equal(game.revealIndex, 1)
  assert.equal(game.players[0].revealed, true)
})

test('advancing past the last card opens the briefing', () => {
  let game = engine.createGame(config(), names(3), SECRET)
  for (let i = 0; i < 3; i += 1) {
    game = engine.advanceReveal(game)
  }
  assert.equal(game.phase, 'briefing')
  assert.ok(game.players.every((p) => p.revealed))
})

/* ================================================================== */
group('TIMER')

test('timer counts down, stops at zero and resets', () => {
  let game = engine.startRound(engine.createGame(config({ turnSeconds: 15 }), names(4), SECRET))
  game = engine.startTimer(game)
  assert.equal(game.timer.running, true)
  for (let i = 0; i < 15; i += 1) game = engine.tickTimer(game, 1)
  assert.equal(game.timer.secondsLeft, 0)
  assert.equal(game.timer.running, false)
  game = engine.resetTimer(game)
  assert.equal(game.timer.secondsLeft, 15)
})

test('clue order walks the roster then opens voting', () => {
  let game = engine.startRound(engine.createGame(config(), names(4), SECRET))
  assert.equal(game.clueIndex, 0)
  for (let i = 0; i < 3; i += 1) game = engine.nextClue(game)
  // The fourth player still has to give a clue.
  assert.equal(game.phase, 'clues')
  assert.equal(game.clueIndex, 3)
  game = engine.nextClue(game)
  assert.equal(game.phase, 'vote_intro')
})

/* ================================================================== */
group('VOTING & WIN CONDITIONS')

function voteSetup({ count = 5, imposters = 1, winRule = 'classic', voteMode = 'secret', rounds = 2 } = {}) {
  let game = engine.createGame(config({ imposterCount: imposters, winRule, voteMode, rounds }), names(count), SECRET)
  game = engine.beginVoting(engine.startRound(game))
  return game
}

test('a split vote removes nobody and keeps the game running', () => {
  let game = voteSetup({ count: 4 })
  const [a, b, c, d] = game.players.map((p) => p.id)
  game = engine.castVote(game, a, c)
  game = engine.castVote(game, b, c)
  game = engine.castVote(game, c, a)
  game = engine.castVote(game, d, a)
  assert.equal(game.phase, 'tally')
  game = engine.resolveRound(game)
  assert.equal(game.lastResult.tie, true)
  assert.equal(game.lastResult.eliminatedId, null)
  assert.equal(game.winner, null, 'a split vote can never end the game')
  assert.ok(game.players.every((p) => p.alive), 'nobody is removed on a split vote')
  assert.equal(game.phase, 'result')
})

test('a two-player tie ends the round instead of looping forever', () => {
  let game = voteSetup({ count: 2, imposters: 1 })
  const imposters = game.players.filter((p) => p.role === 'imposter')
  assert.equal(imposters.length, 1, 'the deal must leave one imposter on a two-player table')
  const crewId = game.players.find((p) => p.role === 'crew').id
  const imposterId = imposters[0].id

  /* Each of the last two players can only vote for the other — a 1-1 tie. */
  game = engine.castVote(game, crewId, imposterId)
  game = engine.castVote(game, imposterId, crewId)
  game = engine.resolveRound(game)

  assert.equal(game.lastResult.tie, true)
  assert.equal(game.lastResult.stalemate, true)
  assert.equal(game.lastResult.eliminatedId, null, 'nobody is removed by the stalemate')
  assert.equal(game.winner?.team, 'imposter', 'an unbreakable tie hands the game over')
  assert.equal(game.phase, 'result')
  assert.equal(game.players.filter((p) => p.alive).length, 2, 'both players stay on the roster')
})

test('a tie with three or more players still removes nobody', () => {
  const game = engine.resolveRound(((g) => {
    const [a, b, c] = g.players.map((p) => p.id)
    let next = engine.castVote(g, a, b)
    next = engine.castVote(next, b, c)
    next = engine.castVote(next, c, a)
    return next
  })(voteSetup({ count: 3 })))
  assert.equal(game.lastResult.tie, true)
  assert.equal(game.winner, null, 'only a two-player tie is a stalemate')
  assert.ok(game.players.every((p) => p.alive))
})

test('a caught imposter gets one guess before anything is decided', () => {
  let game = voteSetup({ count: 5 })
  const imposter = game.players.find((p) => p.role === 'imposter')
  game.players.filter((p) => p.id !== imposter.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, imposter.id)
  })
  game = engine.resolveRound(game)

  assert.equal(game.phase, 'guess', 'the accused is handed the device to guess')
  assert.equal(game.pendingGuess.playerId, imposter.id)
  assert.equal(game.winner, null, 'nothing is settled until the guess is made')
  assert.equal(game.players.find((p) => p.id === imposter.id).alive, false, 'they are still removed')
})

test('a correct final guess hands the whole game to the imposters', () => {
  let game = voteSetup({ count: 6, imposters: 2 })
  const target = game.players.find((p) => p.role === 'imposter')
  game.players.filter((p) => p.id !== target.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, target.id)
  })
  game = engine.resolveRound(game)
  const oneLeft = game.players.filter((p) => p.role === 'imposter' && p.alive).length
  assert.equal(oneLeft, 1, 'a second imposter is still in play')

  game = engine.submitGuess(game, SECRET_WORD)
  assert.equal(game.winner.team, 'imposter')
  assert.equal(game.lastResult.guess, 'correct')
  assert.match(game.winner.reason, /named the secret word/i)
  assert.equal(game.phase, 'result')
})

test('a wrong final guess just removes that imposter', () => {
  let game = voteSetup({ count: 6, imposters: 2 })
  const target = game.players.find((p) => p.role === 'imposter')
  game.players.filter((p) => p.id !== target.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, target.id)
  })
  game = engine.resolveRound(game)
  game = engine.submitGuess(game, 'definitely not the word')

  assert.equal(game.lastResult.guess, 'wrong')
  assert.equal(game.winner, null, 'one imposter is still hiding, so play continues')
  assert.equal(game.phase, 'result')
})

test('guessing the word when you are the last imposter wins it outright', () => {
  let game = voteSetup({ count: 5 })
  const target = game.players.find((p) => p.role === 'imposter')
  game.players.filter((p) => p.id !== target.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, target.id)
  })
  game = engine.resolveRound(game)
  assert.equal(game.winner, null)
  game = engine.submitGuess(game, SECRET_WORD.toUpperCase())
  assert.equal(game.winner.team, 'imposter', 'case and spacing never matter')
})

test('guesses are forgiving about case, spacing and punctuation', () => {
  const build = () => {
    let game = voteSetup({ count: 5 })
    const target = game.players.find((p) => p.role === 'imposter')
    game.players.filter((p) => p.id !== target.id).forEach((voter) => {
      game = engine.castVote(game, voter.id, target.id)
    })
    return engine.resolveRound(game)
  }
  const awkward = build()
  const cleaned = engine.submitGuess(awkward, `  ${SECRET_WORD.toLowerCase()}!! `)
  assert.equal(cleaned.lastResult.guess, 'correct', 'trailing punctuation and spacing are ignored')

  const empty = build()
  assert.equal(engine.submitGuess(empty, '   ').lastResult.guess, 'wrong', 'an empty guess is simply wrong')
})

test('the crew wins only when the last imposter is gone', () => {
  let game = voteSetup({ count: 7, imposters: 3 })
  const imposters = game.players.filter((p) => p.role === 'imposter')

  // First catch → guess phase → wrong guess → still playing.
  game.players.filter((p) => p.id !== imposters[0].id).forEach((voter) => {
    game = engine.castVote(game, voter.id, imposters[0].id)
  })
  game = engine.resolveRound(game)
  game = engine.submitGuess(game, 'nope')
  assert.equal(game.winner, null, 'two imposters are still in play')

  game = engine.nextRound(game)
  assert.equal(game.round, 2)
  assert.equal(game.phase, 'handoff')

  // Second catch → wrong guess → still playing.
  game = engine.beginVoting(engine.startRound(engine.advanceReveal(engine.advanceReveal(engine.advanceReveal(engine.advanceReveal(engine.advanceReveal(engine.advanceReveal(engine.advanceReveal(game)))))))))
  const target2 = game.players.find((p) => p.role === 'imposter' && p.alive)
  game.players.filter((p) => p.alive && p.id !== target2.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, target2.id)
  })
  game = engine.resolveRound(game)
  game = engine.submitGuess(game, 'nope')
  assert.equal(game.winner, null)

  // Third catch → the last imposter is gone → crew win.
  game = engine.nextRound(game)
  let guard = 0
  while (game.phase === 'reveal' && guard < 40) {
    game = engine.hideCard(engine.revealCard(game))
    game = engine.advanceReveal(game)
    guard += 1
  }
  game = engine.beginVoting(engine.startRound(game))
  const last = game.players.find((p) => p.role === 'imposter' && p.alive)
  game.players.filter((p) => p.alive && p.id !== last.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, last.id)
  })
  game = engine.resolveRound(game)
  game = engine.submitGuess(game, 'nope')
  assert.equal(game.winner.team, 'crew')
  assert.match(game.winner.reason, /all 3 imposters were rooted out/i)
})

test('the imposters win when the last crew member is removed', () => {
  let game = voteSetup({ count: 3 })
  const imposter = game.players.find((p) => p.role === 'imposter')
  const crew = game.players.filter((p) => p.role === 'crew')
  // Crew vote out one of their own; the imposter joins in.
  const victim = crew[0]
  game.players.filter((p) => p.id !== victim.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, victim.id)
  })
  game = engine.resolveRound(game)
  assert.equal(game.winner, null, 'the game continues while any crew remains')
  assert.equal(game.phase, 'result')

  game = engine.nextRound(game)
  let guard = 0
  while (game.phase === 'reveal' && guard < 40) {
    game = engine.hideCard(engine.revealCard(game))
    game = engine.advanceReveal(game)
    guard += 1
  }
  game = engine.beginVoting(engine.startRound(game))
  const lastCrew = game.players.find((p) => p.role === 'crew' && p.alive)
  game.players.filter((p) => p.alive && p.id !== lastCrew.id).forEach((voter) => {
    game = engine.castVote(game, voter.id, lastCrew.id)
  })
  game = engine.resolveRound(game)
  assert.equal(game.winner.team, 'imposter')
  assert.match(game.winner.reason, /last crew member is gone/i)
})

test('the rules copy matches what the engine actually does', () => {
  const copy = engine.winConditionText('lastStanding')
  assert.match(copy, /until one side has nobody left/i)
  assert.match(copy, /naming the secret word after being caught/i)
  assert.match(engine.winConditionText('classic', 'chaos'), /sometimes nobody, sometimes everyone/i)
  // The old rules are gone for good.
  assert.ok(!/wins instantly/i.test(copy), 'no instant-win shortcut survives')
  assert.ok(!/match the crew/i.test(copy), 'no outnumber rule survives')
})

test('there is no round limit any more', () => {
  assert.equal(engine.WIN_RULES.length, 1, 'one rule, one way to win')
  assert.equal(engine.WIN_RULES[0].id, 'lastStanding')
  const game = voteSetup({ count: 6, rounds: 1 })
  assert.equal(engine.determineWinner(game), null, 'a one-round config no longer ends anything')
})

test('illegal votes are rejected', () => {
  const game = voteSetup({ count: 4 })
  const [a, , c] = game.players
  assert.equal(engine.validateMove(game, { type: 'castVote', voterId: a.id, targetId: a.id }).ok, false)
  assert.equal(engine.validateMove(game, { type: 'castVote', voterId: a.id, targetId: c.id }).ok, true)
  const copied = engine.castVote(game, a.id, c.id)
  assert.equal(engine.validateMove(copied, { type: 'castVote', voterId: a.id, targetId: c.id }).ok, false)
})

test('eliminated players cannot vote', () => {
  let game = voteSetup({ count: 5, winRule: 'survival' })
  const victim = game.players.find((p) => p.role === 'crew').id
  game = { ...game, phase: engine.PHASE.VOTE_CAST }
  game.players
    .filter((p) => p.id !== victim)
    .forEach((voter) => {
      game = engine.castVote(game, voter.id, victim)
    })
  game = engine.resolveRound(game)
  game = engine.nextRound(game)
  game = { ...game, phase: engine.PHASE.VOTE_CAST }
  const dead = game.players.find((p) => p.id === victim)
  assert.equal(engine.validateMove(game, { type: 'castVote', voterId: dead.id, targetId: game.players[0].id }).ok, false)
})

test('secret ballots stay hidden until the tally', () => {
  let game = voteSetup({ count: 5 })
  const [a, b] = game.players
  game = engine.castVote(game, a.id, b.id)
  assert.equal(game.phase, 'vote_handoff')
  assert.equal(Object.keys(game.votes).length, 1)
  // No public surface exposes the count before TALLY.
  assert.equal(game.lastResult, null)
})

test('vote counting is accurate and ordered', () => {
  let game = voteSetup({ count: 6 })
  const [a, b, c, d, e] = game.players
  game = engine.castVote(game, a.id, d.id)
  game = engine.castVote(game, b.id, d.id)
  game = engine.castVote(game, c.id, e.id)
  game = engine.castVote(game, d.id, e.id)
  game = engine.castVote(game, e.id, d.id)
  const tally = engine.calculateVotes(game)
  assert.equal(tally.total, 5)
  assert.equal(tally.counts[d.id], 3)
  assert.equal(tally.leaders[0], d.id)
  assert.equal(tally.tie, false)
})

test('replaying keeps the crew but re-rolls roles', () => {
  const game = engine.createGame(config({ imposterCount: 2 }), names(8), SECRET)
  const first = game.players.map((p) => p.role).join(',')
  const replayed = engine.replayGame(game, { word: 'Penguin', categoryName: 'Animals', difficulty: 'easy' })
  assert.equal(replayed.players.length, 8)
  assert.equal(replayed.round, 1)
  assert.equal(replayed.secret.word, 'Penguin')
  assert.ok(replayed.players.some((p) => p.alive))
  assert.equal(typeof first, 'string')
})

/* ================================================================== */
group('INPUT VALIDATION')

test('player names: trims, rejects blanks and duplicates', () => {
  assert.equal(validate.validatePlayerName('   Ravi   ').value, 'Ravi')
  assert.equal(validate.validatePlayerName('').ok, false)
  assert.equal(validate.validatePlayerName('😀😀').ok, false)
  const roster = validate.validateRoster(['Amit', 'amit', 'Zara'])
  assert.equal(roster.ok, false)
  assert.ok(roster.errors[0] && roster.errors[1])
})

test('names are capped at the limit', () => {
  const long = 'x'.repeat(40)
  assert.equal(validate.normalizeName(long).length, 16)
})

test('room codes are normalised and validated', () => {
  assert.equal(validate.validateRoomCode('a7kq').ok, true)
  assert.equal(validate.validateRoomCode('abc').ok, false)
  assert.equal(validate.validateRoomCode('O1IL').ok, false)
  assert.equal(validate.validateRoomCode('a7kq').value, 'A7KQ')
})

test('word and category validation', () => {
  assert.equal(validate.validateWord('   Space   Station ').value, 'Space Station')
  assert.equal(validate.validateWord('').ok, false)
  assert.equal(validate.validateWord('*'.repeat(5)).ok, false)
  assert.equal(validate.validateCategoryName('Party Ideas').value, 'Party Ideas')
})

/* ================================================================== */
group('WORD BANK')

test('word picking honours category and difficulty', () => {
  const fresh = bank.defaultBank()
  for (let i = 0; i < 100; i += 1) {
    const pick = bank.pickWord(fresh, { categoryIds: ['food'], difficulty: 'easy' })
    assert.ok(pick.word)
    assert.equal(pick.categoryId, 'food')
    assert.equal(pick.difficulty, 'easy')
  }
})

test('difficulty falls back gracefully on a thin bank', () => {
  const tiny = { version: 1, categories: [{ id: 'tiny', name: 'Tiny', builtin: false, words: [{ word: 'Solo', difficulty: 'hard' }] }] }
  const pick = bank.pickWord(tiny, { categoryIds: ['tiny'], difficulty: 'easy' })
  assert.equal(pick.word, 'Solo')
})

test('random category spans every category', () => {
  const fresh = bank.defaultBank()
  const seen = new Set()
  for (let i = 0; i < 200; i += 1) seen.add(bank.pickWord(fresh, { categoryIds: ['random'], difficulty: 'mixed' }).categoryId)
  assert.ok(seen.size > 4, `expected a wide spread, saw ${seen.size}`)
})

test('a decoy never equals the secret word', () => {
  const fresh = bank.defaultBank()
  for (let i = 0; i < 200; i += 1) {
    const pick = bank.pickWord(fresh, { categoryIds: ['animals'], difficulty: 'mixed' })
    if (pick.decoy) assert.notEqual(pick.decoy, pick.word)
  }
})

test('a decoy always fits beside the word, never a stranger from another category', () => {
  /*
   * The bug this guards: the imposter's cover word for "kitchen sink" came out
   * as "backpack" — a word from a completely different world. A decoy now comes
   * from the word's own category first.
   */
  const fresh = bank.defaultBank()
  for (let i = 0; i < 300; i += 1) {
    const pick = bank.pickWord(fresh, { categoryIds: ['random'], difficulty: 'mixed' })
    if (!pick.decoy) continue
    const sameCategory = fresh.categories
      .find((c) => c.id === pick.categoryId)
      .words.some((w) => w.word === pick.decoy)
    assert.ok(sameCategory, `"${pick.decoy}" does not belong with "${pick.word}" (${pick.categoryName})`)
  }
})

test('a word with its own hints draws one of them, at random', () => {
  const custom = {
    version: 1,
    categories: [
      {
        id: 'house',
        name: 'House Rules',
        builtin: false,
        words: [{ word: 'Kitchen sink', difficulty: 'medium', hints: ['Dish rack', 'Tap', 'Leftovers'] }],
      },
    ],
  }
  const seen = new Set()
  for (let i = 0; i < 120; i += 1) {
    const pick = bank.pickWord(custom, { categoryIds: ['house'], difficulty: 'medium' })
    assert.equal(pick.word, 'Kitchen sink')
    assert.ok(['Dish rack', 'Tap', 'Leftovers'].includes(pick.decoy), `unexpected decoy: ${pick.decoy}`)
    seen.add(pick.decoy)
  }
  assert.equal(seen.size, 3, 'every hint eventually comes up')
})

test('hints are cleaned on the way in: no duplicates, no the word itself, capped', () => {
  assert.deepEqual(bank.normalizeHints('Tap, tap , Dish rack', 'Kitchen sink'), ['Tap', 'Dish rack'])
  assert.deepEqual(bank.normalizeHints(['Mug', 'kitchen sink'], 'Kitchen sink'), ['Mug'])
  assert.deepEqual(bank.normalizeHints('', 'Word'), [])
  assert.equal(bank.normalizeHints('a,b,c,d,e,f,g,h', 'Word').length, bank.MAX_HINTS)
})

test('a word keeps its hints through add, edit, storage and export', () => {
  const session = bank.addCategory(bank.defaultBank(), 'House Rules')
  const created = bank.addWord(session.bank, {
    categoryId: 'house-rules',
    word: 'Kitchen sink',
    difficulty: 'medium',
    hints: 'Tap, Dish rack',
  })
  const stored = created.bank.categories.find((c) => c.id === 'house-rules').words[0]
  assert.deepEqual(stored.hints, ['Tap', 'Dish rack'])

  /* Reclassifying a word must not silently wipe its hints. */
  const reclassified = bank.updateWord(created.bank, {
    categoryId: 'house-rules',
    index: 0,
    word: 'Kitchen sink',
    difficulty: 'hard',
  })
  assert.deepEqual(reclassified.bank.categories.find((c) => c.id === 'house-rules').words[0].hints, ['Tap', 'Dish rack'])

  const rewritten = bank.updateWord(created.bank, {
    categoryId: 'house-rules',
    index: 0,
    word: 'Kitchen sink',
    difficulty: 'medium',
    hints: 'Washing up',
  })
  assert.deepEqual(rewritten.bank.categories.find((c) => c.id === 'house-rules').words[0].hints, ['Washing up'])

  /* Export → import round trip, the path the admin backup button uses. */
  const roundTripped = bank.importBank(bank.defaultBank(), JSON.parse(bank.exportBank(created.bank)))
  assert.deepEqual(roundTripped.categories.find((c) => c.id === 'house-rules').words[0].hints, ['Tap', 'Dish rack'])
})

test('CRUD: add / update / delete words and categories', () => {
  let { bank: b } = bank.addCategory(bank.defaultBank(), 'House Rules')
  const created = bank.addCategory(b, 'House Rules')
  assert.ok(created.error, 'duplicate category rejected')
  const { bank: withWord, error } = bank.addWord(b, { categoryId: 'house-rules', word: 'Chai', difficulty: 'easy' })
  assert.equal(error, undefined)
  assert.ok(withWord.categories.find((c) => c.id === 'house-rules').words.length === 1)
  const dup = bank.addWord(withWord, { categoryId: 'house-rules', word: 'chai' })
  assert.ok(dup.error)
  const { bank: edited } = bank.updateWord(withWord, { categoryId: 'house-rules', index: 0, word: 'Masala Chai', difficulty: 'medium' })
  assert.equal(edited.categories.find((c) => c.id === 'house-rules').words[0].word, 'Masala Chai')
  const { bank: trimmed } = bank.deleteWord(edited, { categoryId: 'house-rules', index: 0 })
  assert.equal(trimmed.categories.find((c) => c.id === 'house-rules').words.length, 0)
  const { bank: removed } = bank.deleteCategory(trimmed, 'house-rules')
  assert.ok(!removed.categories.some((c) => c.id === 'house-rules'))
})

test('import sanitises hostile / broken payloads', () => {
  const dirty = {
    categories: [
      { id: 'x', name: 'Ok', words: [{ word: 'Fine', difficulty: 'easy' }, { word: '', difficulty: 'easy' }, { word: 'Fine', difficulty: 'hard' }] },
      { id: 'y', name: '', words: [{ word: 'Nope' }] },
      'garbage',
    ],
  }
  const clean = bank.importBank(bank.defaultBank(), dirty)
  assert.equal(clean.categories.length, 1)
  assert.equal(clean.categories[0].words.length, 1)
  assert.equal(typeof bank.bankStats(clean).words, 'number')
})

test('stats add up', () => {
  const stats = bank.bankStats(bank.defaultBank())
  const counted = stats.byDifficulty.easy + stats.byDifficulty.medium + stats.byDifficulty.hard
  assert.equal(stats.words, counted)
  assert.ok(stats.categories >= 9)
})

test('category options expose counts plus Random', () => {
  const options = bank.categoryOptions(bank.defaultBank())
  assert.equal(options[0].id, 'random')
  assert.ok(options.every((o) => typeof o.count === 'number'))
})

/* ================================================================== */
group('ONLINE STATE MATH')

const room = (over = {}) => ({
  code: 'A7KQ',
  hostId: 'p1',
  status: 'playing',
  config: { winRule: 'classic', rounds: 2, turnSeconds: 30, imposterCount: 1, categoryLabel: 'Random', difficulty: 'mixed', categoryIds: ['random'] },
  players: [
    { id: 'p1', name: 'A', isHost: true, ready: true, online: true, joinedAt: 1, lastSeen: Date.now() },
    { id: 'p2', name: 'B', ready: true, online: true, joinedAt: 2, lastSeen: Date.now() },
    { id: 'p3', name: 'C', ready: true, online: true, joinedAt: 3, lastSeen: Date.now() },
    { id: 'p4', name: 'D', ready: true, online: true, joinedAt: 4, lastSeen: Date.now() },
  ],
  game: {
    round: 1,
    phase: 'voting',
    revealedBy: ['p1', 'p2', 'p3', 'p4'],
    clueOrder: ['p1', 'p2', 'p3', 'p4'],
    clueIndex: 0,
    turnPlayerId: 'p1',
    timer: { running: false, duration: 30, startedAt: null },
    votes: {},
    submitted: [],
    lastResult: null,
    winner: null,
    history: [],
    eliminated: [],
    deck: { categoryLabel: 'Random' },
  },
  ...over,
})

test('vote progress tracks who has voted', () => {
  const r = room()
  assert.equal(onlineGame.voteProgress(r).complete, false)
  Object.assign(r.game.votes, { p1: 'p3', p2: 'p3' })
  assert.deepEqual(onlineGame.voteProgress(r), { cast: 2, total: 4, complete: false })
  Object.assign(r.game.votes, { p3: 'p1', p4: 'p1' })
  assert.equal(onlineGame.voteProgress(r).complete, true)
})

test('host tally equals the local engine verdict, guess and all', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p2', p2: 'p2', p3: 'p2', p4: 'p1' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.eliminatedId, 'p2')
  assert.equal(result.wasImposter, true)

  // The local engine puts the room in the guess phase for exactly this case.
  const local = (() => {
    const players = ['p1', 'p2', 'p3', 'p4'].map((id, seat) => ({
      id, name: id, seat, role: id === 'p2' ? 'imposter' : 'crew', alive: true, eliminatedRound: null, revealed: false,
    }))
    return { players, secret: { word: 'Umbrella' }, config: { winRule: 'lastStanding' }, history: [], round: 1 }
  })()
  assert.equal(onlineGame.resolveGuess({ guess: 'Umbrella', word: local.secret.word }).correct, true)
  assert.equal(onlineGame.resolveGuess({ guess: 'Raincoat', word: local.secret.word }).correct, false)
  assert.equal(onlineGame.resolveGuess({ guess: ' umbrella ', word: local.secret.word }).correct, true, 'forgiving compare')
})

test('a tied online vote removes nobody and settles nothing', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.tie, true)
  assert.equal(result.eliminatedId, null)
  assert.equal(result.winner, null, 'a split vote can never end the game')
})

test('a published vote result never carries a role', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p2', p3: 'p2', p4: 'p2' })
  const roles = { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' }
  const result = onlineGame.computeResult(r, roles)
  /* The host needs the flag to open the guess screen... */
  assert.equal(result.wasImposter, true, 'the host still learns whether to open a guess screen')
  /* ...but the room document is shared with everybody, so it never travels. */
  const published = onlineGame.publicResult(result)
  assert.equal('wasImposter' in published, false, 'no role in the public result')
  assert.equal(published.eliminatedId, 'p2')
  assert.equal(published.needsGuess, true)
  assert.equal(published.counts.p2, 3)
})

test('the guess screen view exposes no role, only who was accused', () => {
  const r = room()
  r.game.phase = 'guess'
  r.game.pendingGuess = { playerId: 'p2', name: 'B' }
  r.game.guess = null
  r.game.lastResult = { round: 1, eliminatedId: 'p2', eliminatedName: 'B', counts: { p2: 2 }, tie: false, winner: null }
  const mine = onlineGame.phaseView(r, 'p2')
  assert.equal(mine.screen, 'guess')
  assert.equal(mine.isMine, true, 'the accused gets the input')
  assert.equal(mine.submitted, null)
  assert.equal('roles' in mine, false, 'no roles on the guess screen')
  const watcher = onlineGame.phaseView(r, 'p1')
  assert.equal(watcher.isMine, false, 'everyone else can only watch')
})

test('a two-player online tie hands the game to the imposter', () => {
  const r = room()
  r.players = r.players.slice(0, 2)
  r.game.votes = { p1: 'p2', p2: 'p1' }
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter' })
  assert.equal(result.tie, true)
  assert.equal(result.stalemate, true)
  assert.equal(result.eliminatedId, null)
  assert.equal(result.winner, 'imposter', 'an unbreakable tie hands the game over')
  assert.ok(result.reason.length > 0)
})

test('an online vote that removes an imposter offers the final guess', () => {
  const r = room()
  // Everyone points at p2, who is an imposter.
  Object.assign(r.game.votes, { p1: 'p2', p3: 'p2', p4: 'p2' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.eliminatedId, 'p2')
  assert.equal(result.wasImposter, true)
  assert.equal(result.winner, null, 'the guess decides, not the vote')
  assert.equal(result.needsGuess, true)
})

test('an online vote that empties the crew ends the game', () => {
  // Two players left: one crew, one imposter. Removing the crew member ends it.
  const r = room({ players: room().players.slice(0, 2) })
  r.game.votes = { p2: 'p1' }
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter' })
  assert.equal(result.eliminatedId, 'p1')
  assert.equal(result.wasImposter, false)
  assert.equal(result.winner, 'imposter')
  assert.match(result.reason, /last crew member is gone/i)
})

test('removing a crew member while crew remain just continues the game', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p3', p2: 'p3', p4: 'p3' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.eliminatedId, 'p3')
  assert.equal(result.winner, null, 'two crew members are still alive')
})

test('phase view routes each client to the right screen', () => {
  assert.equal(onlineGame.phaseView(room(), 'p1', {}).screen, 'voting')
  const revealing = room()
  revealing.game.phase = 'reveal'
  revealing.game.revealedBy = ['p1']
  const view = onlineGame.phaseView(revealing, 'p1', { role: 'crew', word: 'Umbrella' })
  assert.equal(view.screen, 'card')
  assert.equal(view.seen, true)
  assert.equal(view.progress.total, 4)
  const lobbyRoom = room({ game: null })
  assert.equal(onlineGame.phaseView(lobbyRoom, 'p1', null).screen, 'lobby')
})

test('dropped hosts hand driving rights to the next online player', () => {
  const r = room()
  r.players[0].lastSeen = Date.now() - 120000
  assert.equal(onlineGame.isHostDriver(r, 'p1'), false)
  assert.equal(onlineGame.isHostDriver(r, 'p2'), true)
})

test('only the turn player (or driver) may advance a clue', () => {
  const r = room()
  r.game.phase = 'clues'
  assert.equal(onlineGame.canAdvanceClue(r, 'p1'), true)
  assert.equal(onlineGame.canAdvanceClue(r, 'p3'), false)
})

test('eliminated players are excluded from voting and turns', () => {
  const r = room()
  r.game.eliminated = ['p4']
  assert.deepEqual(onlineGame.roomAlive(r).map((p) => p.id), ['p1', 'p2', 'p3'])
  assert.equal(onlineGame.voteProgress(r).total, 3)
})

/* ================================================================== */
group('ONLINE SERVICE SURFACE')

test('an unconfigured build never pretends to be online', () => {
  assert.equal(onlineService.isConfigured(), false)
})

test('user-facing room errors are friendly, never raw', () => {
  const cases = {
    NOT_FOUND: 'closed',
    FULL: 'THIS ROOM IS FULL',
    STARTED: 'GAME IN PROGRESS',
    EXPIRED: 'expired',
    TERMINATED: 'host closed',
    NETWORK: 'CONNECTION LOST',
    NOT_CONFIGURED: 'Supabase',
  }
  Object.entries(cases).forEach(([code, needle]) => {
    const message = onlineService.friendlyRoomError({ code })
    assert.ok(message.includes(needle), `${code} → "${message}"`)
    assert.ok(!/Error:|undefined|\[object/.test(message), `${code} leaked internals`)
  })
  const fallback = onlineService.friendlyRoomError(new Error('boom'))
  assert.ok(fallback.length > 10 && !fallback.includes('boom'))
})

test('room documents are normalised into a safe shape', () => {
  const room = onlineService.normalizeRoom({ players: [{ id: 'p1', name: '  A  ' }, null, { bad: true }] })
  assert.equal(room.players.length, 1)
  assert.equal(room.players[0].name, 'A')
  assert.equal(room.status, 'lobby')
  assert.equal(room.config.turnSeconds, 30)
  assert.equal(room.game, null)
})

test('players created client-side always carry the expected fields', () => {
  const player = onlineService.makePlayer({ name: 'Zoya', isHost: true })
  assert.deepEqual(Object.keys(player).sort(), ['id', 'isHost', 'joinedAt', 'lastSeen', 'name', 'online', 'ready', 'score'].sort())
  assert.equal(player.isHost, true)
  assert.equal(player.ready, true, 'the host is always ready')
  assert.equal(player.online, true)
})

test('every room helper the UI calls is actually exported', () => {
  const required = [
    'createRoom', 'joinRoom', 'leaveRoom', 'setPlayerReady', 'pingPlayer', 'patchRoom', 'writeSecrets',
    'fetchSecret', 'submitVote', 'terminateRoom', 'sweepExpiredRooms', 'listActiveRooms', 'subscribeToRoom',
    'fetchRoomRow', 'roomExists', 'pingBackend', 'friendlyRoomError', 'normalizeRoom', 'isConfigured',
    'fetchSharedWords', 'pushSharedWords',
  ]
  required.forEach((name) => assert.equal(typeof onlineService[name], 'function', `${name} is missing`))
})

/* ================================================================== */
group('CHAOS MODE')

const chaosConfig = (over = {}) => config({ mode: 'chaos', ...over })

test('chaos assigns imposter roles without a minority clamp', () => {
  // Every player must be able to draw the imposter card, so the count ranges
  // over 1..playerCount — including everyone.
  const seen = new Set()
  for (let i = 0; i < 600; i += 1) seen.add(engine.rollChaosImposterCount(6))
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6], `saw ${[...seen].join(',')}`)
})

test('chaos can deal an all-imposter table (a normal player is never forced)', () => {
  const assignment = engine.assignChaosRoles(6, 6)
  assert.equal(assignment.imposterCount, 6)
  assert.equal(assignment.tier, 'all')
  assert.ok(assignment.roles.every((role) => role === 'imposter'))
  assert.equal(assignment.roles.filter((role) => role === 'crew').length, 0)
})

test('chaos tiers describe one / several / many / everyone', () => {
  assert.equal(engine.chaosTierFor(7, 1), 'single')
  assert.equal(engine.chaosTierFor(7, 2), 'few')
  assert.equal(engine.chaosTierFor(7, 3), 'few')
  assert.equal(engine.chaosTierFor(7, 4), 'many')
  assert.equal(engine.chaosTierFor(7, 7), 'all')
})

test('chaos draws every flavour across many rounds', () => {
  // Guards against a roll that silently collapses to one tier.
  const tiers = new Set()
  for (let i = 0; i < 900; i += 1) tiers.add(engine.assignChaosRoles(9).tier)
  assert.equal(tiers.size, 5, `only saw ${[...tiers].join(',')}`)
  assert.ok(tiers.has('all'), 'all-imposter rounds must be reachable')
  assert.ok(tiers.has('none'), 'nobody-is-an-imposter rounds must be reachable')
})

test('every seat has an equal chance of being the imposter', () => {
  // 6 players, exact count forced → each seat should land near 1/6.
  const counts = Array(6).fill(0)
  const runs = 3000
  for (let i = 0; i < runs; i += 1) {
    const { roles } = engine.assignChaosRoles(6, 1)
    roles.forEach((role, index) => {
      if (role === 'imposter') counts[index] += 1
    })
  }
  const expected = runs / 6
  counts.forEach((count, index) => {
    assert.ok(Math.abs(count - expected) < expected * 0.3, `seat ${index} got ${count}, expected ~${expected}`)
  })
})

test('chaos re-rolls roles for a new round and never reuses the old ones', () => {
  /*
   * Why this does not just compare role strings between rounds: an all-imposter
   * re-roll legitimately reproduces the previous assignment, and the first deal
   * is all-imposters ~15% of the time — so "the string changed" would fail in
   * roughly 4% of runs while the game is behaving perfectly.
   *
   * A reused assignment, however, could never change the NUMBER of imposters
   * between rounds. That is the property worth asserting, and it has no
   * false-positive path: the heaviest single count is 35% likely per roll, so
   * the odds of 60 fresh rolls all landing on one count are ~0.35^60.
   */
  const game = engine.createGame(chaosConfig({ imposterCount: 1 }), names(6), SECRET)
  const before = game.players.map((p) => p.role).join('')
  const counts = new Set()
  let changed = 0

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const rolled = engine.rerollChaosRoles(game)
    if (rolled.players.map((p) => p.role).join('') !== before) changed += 1
    counts.add(rolled.players.filter((p) => p.role === 'imposter').length)
  }

  assert.ok(counts.size >= 2, `the imposter count never varied across 60 re-rolls: ${[...counts].join(',')}`)
  assert.ok(changed >= 1, 'a re-roll can change which players are imposters')
})

test('a chaos round resets the reveal so every player sees the new card', () => {
  let game = engine.createGame(chaosConfig(), names(4), SECRET)
  // Force the next round to be a chaos round, then hand everybody a seen card.
  game = { ...game, nextChaosRound: 2, players: game.players.map((p) => ({ ...p, revealed: true })) }
  const next = engine.nextRound(game)
  assert.equal(next.chaosRound, true, 'this round really is a chaos round')
  assert.ok(next.players.every((p) => p.revealed === false), 'cards must be un-seen for the new round')
})

test('chaos keeps the word: crew still receive the secret on every round', () => {
  const game = engine.createGame(chaosConfig(), names(6), SECRET)
  assert.equal(game.secret.word, 'Umbrella')
  const next = engine.nextRound(game)
  assert.equal(next.secret.word, 'Umbrella')
  assert.ok(next.players.some((p) => p.role === 'crew') || next.players.every((p) => p.role === 'imposter'))
})

test('an all-imposter round has no crew to win, so the deception takes it', () => {
  const allImposters = {
    config: { winRule: 'classic', rounds: 2, mode: 'chaos' },
    round: 1,
    totalRounds: 2,
    history: [],
    players: [
      { id: 'p1', name: 'a', role: 'imposter', alive: true },
      { id: 'p2', name: 'b', role: 'imposter', alive: true },
      { id: 'p3', name: 'c', role: 'imposter', alive: true },
    ],
  }
  const result = engine.determineWinner(allImposters)
  assert.equal(result.team, 'imposter')
  assert.match(result.reason, /every single player was an imposter/i)
  assert.equal(result.chaos, true)

  // Even after one is voted out there is still no crew to claim the round.
  const afterElimination = {
    ...allImposters,
    players: allImposters.players.map((p) => (p.id === 'p1' ? { ...p, alive: false } : p)),
  }
  assert.equal(engine.determineWinner(afterElimination).team, 'imposter')
})

test('a chaos round with nobody imposter announces itself and plays on', () => {
  let game = engine.createGame(chaosConfig(), names(5), SECRET)
  // Deal the whole table a crew card, as a chaos round legitimately can.
  game = { ...game, players: game.players.map((p) => ({ ...p, role: 'crew' })) }
  const played = engine.beginVoting(game)

  assert.equal(played.phase, 'result')
  assert.equal(played.lastResult.noImposter, true)
  assert.equal(played.winner, null, 'there is nothing to catch, so nothing is decided')
  assert.match(engine.chaosNoImposterLine(), /NO IMPOSTER THIS ROUND/i)
})

test('a chaos round where everyone is an imposter is taken by the imposters', () => {
  let game = engine.createGame(chaosConfig(), names(5), SECRET)
  game = { ...game, players: game.players.map((p) => ({ ...p, role: 'imposter' })) }
  const played = engine.beginVoting(game)
  assert.equal(played.winner.team, 'imposter')
  assert.match(played.winner.reason, /no crew to catch anyone/i)
})

test('a round that dealt nobody an imposter puts the imposters back afterwards', () => {
  let game = engine.createGame(chaosConfig({ imposterCount: 2 }), names(6), SECRET)
  game = { ...game, players: game.players.map((p) => ({ ...p, role: 'crew' })), nextChaosRound: 99 }
  const next = engine.nextRound(game)
  assert.equal(next.players.filter((p) => p.role === 'imposter').length, 2, 'the configured count is restored')
})

test('a chaos game opens with the ordinary deal, not a chaos roll', () => {
  /*
   * Chaos is an event, so round one uses the configured imposter count. Opening
   * on a chaos roll could deal an all-imposter table and end the game before
   * anybody had a turn.
   */
  const game = engine.createGame(chaosConfig({ imposterCount: 2 }), names(6), SECRET)
  assert.equal(game.chaosRound, false)
  assert.equal(game.players.filter((p) => p.role === 'imposter').length, 2, 'the configured count is dealt')
  assert.ok(game.nextChaosRound >= engine.CHAOS_GAP_MIN && game.nextChaosRound <= engine.CHAOS_GAP_MAX, 'the first event lands 3-5 rounds in')
})

test('chaos is an event every few rounds, not every round', () => {
  const game = engine.createGame(chaosConfig({ imposterCount: 1 }), names(6), SECRET)
  assert.ok(game.nextChaosRound >= engine.CHAOS_GAP_MIN, `first chaos round at ${game.nextChaosRound}`)
  assert.ok(game.nextChaosRound <= engine.CHAOS_GAP_MAX, 'first chaos round lands inside the window')
  assert.equal(game.chaosRound, false, 'the opening round is a normal one')

  // The rounds before it keep the base assignment: same roles, same word.
  const roundTwo = engine.nextRound(game)
  assert.equal(roundTwo.chaosRound, false, 'round two is an ordinary round')
  assert.deepEqual(roundTwo.players.map((p) => p.role), game.players.map((p) => p.role))

  // A due chaos round re-rolls and re-arms the clock 3-5 rounds later.
  const due = { ...game, nextChaosRound: 2 }
  const chaosRound = engine.nextRound(due)
  assert.equal(chaosRound.chaosRound, true)
  assert.ok(chaosRound.nextChaosRound >= chaosRound.round + engine.CHAOS_GAP_MIN)
  assert.ok(chaosRound.nextChaosRound <= chaosRound.round + engine.CHAOS_GAP_MAX)
})

test('normal mode is byte-for-byte untouched by chaos', () => {
  // The clamp, the minority rule and the role mix must all behave as before.
  const normal = engine.createGame(config({ imposterCount: 2 }), names(7), SECRET)
  assert.equal(normal.chaos, false)
  assert.equal(normal.players.filter((p) => p.role === 'imposter').length, 2)
  const assignment = engine.assignRolesFor({ mode: 'normal', imposterCount: 3 }, 7)
  assert.equal(assignment.chaos, false)
  assert.equal(assignment.imposterCount, 3, '3 is legal for 7 players (floor(6/2))')
  assert.equal(engine.assignRolesFor({ mode: 'normal', imposterCount: 9 }, 7).imposterCount, 3, 'still clamped to the minority')
  assert.equal(engine.assignRoles(20, 99).imposterCount, 9, 'floor((20-1)/2) = 9')
})

test('the chaos roll uses crypto-backed randomness', () => {
  const source = readFileSync(new URL('../src/lib/gameEngine.js', import.meta.url), 'utf8')
  assert.ok(/rollChaosImposterCount[\s\S]{0,400}randomInt\(/.test(source), 'chaos roll must go through the strong RNG')
})

test('chaos copy tells the truth about what it does', () => {
  assert.match(engine.winConditionText('lastStanding', 'chaos'), /every few rounds/i)
  assert.match(engine.winConditionText('lastStanding', 'chaos'), /sometimes nobody, sometimes everyone/i)
  assert.equal(engine.isChaosMode({ mode: 'chaos' }), true)
  assert.equal(engine.isChaosMode({ mode: 'normal' }), false)
  assert.equal(engine.isChaosMode({}), false)
})

test('the briefing line announces chaos rounds without leaking the roll', () => {
  const game = engine.createGame(chaosConfig(), names(6), SECRET)
  // Ordinary rounds read normally; a chaos round announces itself and nothing more.
  /* Anchored on the schedule the engine actually uses, so this never depends
     on which gap the deal happened to roll. */
  assert.ok(!/chaos/i.test(engine.briefLine({ ...game, nextChaosRound: 9, round: 1 })))
  const line = engine.briefLine({ ...game, nextChaosRound: 4, round: 4 })
  assert.match(line, /chaos/i)
  assert.ok(!/\d+ imposters?/i.test(line), `the line must not reveal the count: "${line}"`)
})

/* ================================================================== */
group('RUNTIME BACKEND CONFIG')

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjogImFub24ifQ.' + 'x'.repeat(60)
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjogInNlcnZpY2Vfcm9sZSJ9.' + 'y'.repeat(60)

test('project URLs are normalised from whatever people actually paste', () => {
  assert.equal(runtimeConfig.normalizeBackendUrl('https://abc.supabase.co/'), 'https://abc.supabase.co')
  assert.equal(runtimeConfig.normalizeBackendUrl('https://abc.supabase.co/rest/v1/'), 'https://abc.supabase.co')
  assert.equal(runtimeConfig.normalizeBackendUrl('  abcdefghijklm  '), 'https://abcdefghijklm.supabase.co')
  assert.equal(runtimeConfig.normalizeBackendUrl('abc.supabase.co'), 'https://abc.supabase.co')
})

test('the Supabase dashboard URL is recovered instead of rejected', () => {
  // The single most common paste mistake: the browser address from the dashboard.
  assert.equal(
    runtimeConfig.normalizeBackendUrl('https://supabase.com/dashboard/project/uepgrjiktejmvyupvzlo'),
    'https://uepgrjiktejmvyupvzlo.supabase.co',
  )
  assert.equal(
    runtimeConfig.normalizeBackendUrl('https://supabase.com/dashboard/project/uepgrjiktejmvyupvzlo/settings/api'),
    'https://uepgrjiktejmvyupvzlo.supabase.co',
  )
  assert.equal(
    runtimeConfig.normalizeBackendUrl('https://app.supabase.com/dashboard/project/abcdefghijklm'),
    'https://abcdefghijklm.supabase.co',
  )
  const result = runtimeConfig.validateBackendUrl('https://supabase.com/dashboard/project/uepgrjiktejmvyupvzlo')
  assert.equal(result.ok, true)
  assert.equal(result.value, 'https://uepgrjiktejmvyupvzlo.supabase.co')
})

test('the dashboard host without a project reference is explained, not silently accepted', () => {
  const result = runtimeConfig.validateBackendUrl('https://supabase.com/dashboard')
  assert.equal(result.ok, false)
  assert.match(result.error, /dashboard/i)
  assert.match(result.error, /Project Settings/i)
})

test('URL validation rejects what cannot work', () => {
  assert.equal(runtimeConfig.validateBackendUrl('').ok, false)
  assert.equal(runtimeConfig.validateBackendUrl('http://example.com').ok, false, 'http is blocked off-localhost')
  assert.equal(runtimeConfig.validateBackendUrl('https://not a host').ok, false)
  assert.equal(runtimeConfig.validateBackendUrl('http://localhost:8000').ok, true, 'self-hosted Supabase stays usable')
  assert.equal(runtimeConfig.validateBackendUrl('https://abcdefghijklm.supabase.co').ok, true)
})

test('key validation catches the classic paste mistakes', () => {
  assert.equal(runtimeConfig.validateAnonKey('').ok, false)
  assert.equal(runtimeConfig.validateAnonKey('abc def').ok, false, 'spaces')
  assert.equal(runtimeConfig.validateAnonKey('https://abc.supabase.co').field ?? runtimeConfig.validateAnonKey('https://abc.supabase.co').ok, false)
  assert.match(runtimeConfig.validateAnonKey('https://abc.supabase.co').error, /project URL/i)
  assert.equal(runtimeConfig.validateAnonKey('shortkey').ok, false)
  assert.equal(runtimeConfig.validateAnonKey(ANON_KEY).ok, true)
})

test('the service-role key is refused with a security explanation', () => {
  const result = runtimeConfig.validateAnonKey(SERVICE_KEY)
  assert.equal(result.ok, false)
  assert.match(result.error, /service-role/i)
  assert.match(result.error, /must never reach a browser/i)
})

test('combined validation reports which field was wrong', () => {
  assert.equal(runtimeConfig.validateBackendConfig({}).ok, false)
  const badUrl = runtimeConfig.validateBackendConfig({ url: 'ftp://x', anonKey: ANON_KEY })
  assert.equal(badUrl.ok, false)
  assert.equal(badUrl.field, 'url')
  const badKey = runtimeConfig.validateBackendConfig({ url: 'https://abc.supabase.co', anonKey: 'nope' })
  assert.equal(badKey.ok, false)
  assert.equal(badKey.field, 'anonKey')
  assert.equal(runtimeConfig.validateBackendConfig({ url: 'https://abc.supabase.co', anonKey: ANON_KEY }).ok, true)
})

test('values saved on the device win over build-time defaults', () => {
  runtimeConfig.clearStoredBackend()
  assert.equal(runtimeConfig.getActiveBackend().source, 'none', 'nothing configured in a bare Node run')
  const saved = runtimeConfig.saveStoredBackend({ url: 'https://abcdefghijklm.supabase.co', anonKey: ANON_KEY })
  assert.equal(saved.ok, true)
  const active = runtimeConfig.getActiveBackend()
  assert.equal(active.source, 'device')
  assert.equal(active.url, 'https://abcdefghijklm.supabase.co')
  assert.equal(runtimeConfig.hasStoredBackend(), true)
  assert.equal(runtimeConfig.readStoredBackend().anonKey, ANON_KEY)
})

test('saved values reach the client layer and refreshing never throws', () => {
  assert.equal(supabaseLib.isOnlineConfigured(), true)
  assert.equal(supabaseLib.supabaseConfig.url, 'https://abcdefghijklm.supabase.co')
  assert.equal(supabaseLib.supabaseConfig.anonKey, ANON_KEY)
  assert.equal(supabaseLib.isOnlineConfigured(), true, 'a bare Node run still reports configured')

  // Creating the realtime client is environment-dependent: Node < 22 has no
  // native WebSocket. Either way it must never throw into a render path, and a
  // failure must be explained rather than swallowed. (The jsdom UI suite
  // asserts the real client in a browser-like DOM.)
  const client = supabaseLib.getSupabase()
  if (client) {
    assert.equal(supabaseLib.getSupabaseError(), null)
    assert.equal(client.supabaseUrl, 'https://abcdefghijklm.supabase.co')
  } else {
    assert.match(supabaseLib.getSupabaseError() || '', /websocket|fetch/i)
  }
})

test('client creation is idempotent, and configuration changes invalidate it', () => {
  // Same config → the same instance is reused (no churn during a session).
  assert.equal(supabaseLib.getSupabase(), supabaseLib.getSupabase(), 'the client is cached')

  // New config → the cached instance must not survive. In a bare Node runtime
  // no client exists at all, so assert the resolution layer moved instead; the
  // jsdom suite asserts the rebuilt instance against a real DOM.
  runtimeConfig.saveStoredBackend({ url: 'https://otherproject.supabase.co', anonKey: ANON_KEY })
  assert.equal(supabaseLib.supabaseConfig.url, 'https://otherproject.supabase.co')
  const rebuilt = supabaseLib.getSupabase()
  assert.notEqual(rebuilt, undefined, 'a rebuild is attempted')
  runtimeConfig.saveStoredBackend({ url: 'https://abcdefghijklm.supabase.co', anonKey: ANON_KEY })
})

test('device values can be forgotten, falling back cleanly', () => {
  runtimeConfig.clearStoredBackend()
  assert.equal(runtimeConfig.hasStoredBackend(), false)
  assert.equal(runtimeConfig.getActiveBackend().source, 'none')
  assert.equal(supabaseLib.isOnlineConfigured(), false)
})

test('invalid values are never stored', () => {
  const result = runtimeConfig.saveStoredBackend({ url: 'https://abc.supabase.co', anonKey: 'nope' })
  assert.equal(result.ok, false)
  assert.equal(runtimeConfig.hasStoredBackend(), false, 'a rejected save must not persist')
})

test('status reporting never leaks a full key', () => {
  runtimeConfig.saveStoredBackend({ url: 'https://abcdefghijklm.supabase.co', anonKey: ANON_KEY })
  const status = runtimeConfig.describeBackend()
  assert.equal(status.configured, true)
  assert.equal(status.host, 'abcdefghijklm.supabase.co')
  assert.equal(status.projectRef, 'abcdefghijklm')
  assert.equal(status.sourceLabel, 'this device')
  assert.ok(!status.keyHint.includes(ANON_KEY.slice(10, 40)), 'the middle of the key is masked')
  assert.ok(/•/.test(status.keyHint))
  runtimeConfig.clearStoredBackend()
})

test('the runtime file is optional and never blocks startup', async () => {
  // No fetch target in Node: resolution must fall through, not throw.
  const resolved = await runtimeConfig.ensureBackend()
  assert.equal(resolved.source, 'none')
  assert.equal(runtimeConfig.runtimeFileIssue().found, false)
})

/* ================================================================== */
group('BLACK BOX GATE (source-level checks)')

test('the admin passphrase never appears in the shipped source', async () => {
  const { readFile, readdir } = await import('node:fs/promises')
  const phrase = ['VRdev', 'VOLAM', 'rakshith'].join('')
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const full = `${dir}/${entry.name}`
      if (entry.isDirectory()) files.push(...(await walk(full)))
      else files.push(full)
    }
    return files
  }
  const files = await walk('src')
  for (const file of files) {
    const content = await readFile(file, 'utf8')
    assert.ok(!content.includes(phrase), `passphrase leaked into ${file}`)
  }
})

test('the stored digest matches the salted passphrase', () => {
  const salt = 'vrdev.imposter.blackbox.v1'
  const phrase = ['VRdev', 'VOLAM', 'rakshith'].join('')
  const digest = createHash('sha256').update(salt + phrase).digest('hex')
  assert.match(digest, /^[0-9a-f]{64}$/)
})

/* ------------------------------------------------------------------ */
/* ONLINE CHAOS PLUMBING (source-level invariants)                     */
/* ------------------------------------------------------------------ */
/*
 * The online chaos re-roll lives inside the `useOnlineRoom` hook, and this
 * harness has no fake Postgres to drive a two-device round against. These
 * checks pin the invariants that make that path correct: the exact shape of
 * the reserved secret entry, that it is written wherever a round word is
 * chosen, and that the re-roll only touches players still in play. An earlier
 * draft of this code stored nothing to re-read and silently skipped the
 * re-roll, so these are worth pinning.
 */
{
  const source = readFileSync(new URL('../src/hooks/useOnlineRoom.js', import.meta.url), 'utf8')

  /** Slice a `const name = useCallback(...)` body out of the source by brace matching. */
  const bodyOf = (name) => {
    const isCallback = source.includes(`const ${name} = useCallback(`)
    const isFunction = source.includes(`function ${name}(`)
    assert.ok(isCallback || isFunction, `a ${name} implementation exists`)
    const start = isCallback
      ? source.indexOf(`const ${name} = useCallback(`)
      : source.indexOf(`function ${name}(`)
    const from = source.indexOf('{', start)
    let depth = 0
    for (let index = from; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') {
        depth -= 1
        if (depth === 0) return source.slice(from, index + 1)
      }
    }
    throw new Error(`unbalanced braces in ${name}`)
  }

  const nextRound = bodyOf('nextRound')
  const startGame = bodyOf('startGame')
  const playAgain = bodyOf('playAgain')
  const metaKeyStart = source.indexOf('const SECRET_META_KEY = ')
  const metaKey = metaKeyStart >= 0
    ? source.slice(metaKeyStart + 'const SECRET_META_KEY = '.length).split('\n')[0].trim()
    : ''

  test('the chaos metadata key is declared, quoted and reserved-looking', () => {
    assert.ok(metaKeyStart >= 0, 'SECRET_META_KEY is declared')
    assert.ok(metaKey.startsWith("'") && metaKey.endsWith("'"), `double-quoted literal, got ${metaKey}`)
    const key = metaKey.slice(1, -1)
    assert.ok(key.startsWith('__') && key.endsWith('__'), 'reserved-looking name')
    // Player ids come from uid(), so a double-underscore name can never be one.
    assert.ok(!/^[a-z0-9-]+$/i.test(key.replace(/^__|__$/g, '')), 'not uid-shaped')
    assert.ok(source.includes('[SECRET_META_KEY]'), 'the key is used to address the private map')
  })

  test('the round word is stored privately at deal time, in both paths', () => {
    for (const [label, body] of [['startGame', startGame], ['playAgain', playAgain]]) {
      assert.ok(body.includes('[SECRET_META_KEY] = {'), `${label} stores the round word under the reserved key`)
      assert.ok(body.includes('word: picked.word'), `${label} stores the dealt word, not a placeholder`)
    }
    const patchLines = source.split('\n').filter((line) => line.includes('roomPatch'))
    assert.ok(!patchLines.some((line) => line.includes('word')), 'no word ever lands in a public room patch')
  })

  test('no published result in the room document can carry a role', () => {
    const publishResult = bodyOf('publishResult')
    const publishGuess = bodyOf('publishGuess')
    const published = publishResult.match(/lastResult: [^,\n]+/g) || []
    assert.ok(published.length >= 2, 'both result paths publish a lastResult')
    published.forEach((line) => {
      assert.ok(line.includes('publicResult('), `role-free publish expected, got: ${line.trim()}`)
    })
    assert.ok(
      !/lastResult: result\b/.test(publishResult),
      'the raw result (with wasImposter) must never be published as-is',
    )
    assert.ok(publishGuess.includes('revealedRoles: gameOver'), 'roles only appear once the guess ends the game')
  })

  test('the mid-game tally never reads a role out of the vote result', () => {
    const phases = readFileSync(new URL('../src/components/online/OnlineGamePhases.jsx', import.meta.url), 'utf8')
    assert.ok(!phases.includes('result.wasImposter'), 'the mid-game tally reads only revealedRoles')
    assert.ok(phases.includes('(room.game.revealedRoles || {})[id] === ROLES.IMPOSTER'), 'roles come from revealedRoles')
  })

  test('the re-roll reads the reserved entry only, never the whole private map', () => {
    assert.ok(nextRound.includes('playerId: SECRET_META_KEY'), 'addresses the reserved entry')
    assert.ok(!nextRound.includes('fetchSecret({ code })' ), 'never reads every player secret')
    assert.ok(nextRound.includes('.catch(() => null)'), 'a failed read degrades instead of throwing')
  })

  test('a missing word keeps the existing assignment instead of breaking the round', () => {
    assert.ok(nextRound.includes('const word = meta?.word || null'), 'word is read defensively')
    assert.ok(nextRound.includes('if (word)'), 'the re-roll is guarded by the word check')
    assert.ok(nextRound.includes('patch: { game: advance }'), 'falls back to a plain round advance')
  })

  test('the re-roll assigns fresh roles to living players and reuses none', () => {
    // Strip comments first: the prose explains the rule using the same words
    // the check looks for, so assertions have to run against code only.
    const codeOnly = (text) => text
      .split('*/')
      .map((part) => (part.indexOf('/*') >= 0 ? part.slice(0, part.indexOf('/*')) : part))
      .join('')
    const nextCode = codeOnly(nextRound)

    assert.ok(nextCode.includes('assignRolesFor(room.config, aliveIds.length)'), 'rolls for the living roster')
    assert.ok(nextCode.includes('(room.game.eliminated || []).includes(p.id)'), 'aliveIds excludes eliminated players')
    assert.ok(nextCode.includes('const role = roles[index]'), 'each living player takes a role from the fresh roll')
    assert.ok(!nextCode.includes('secrets['), 'never reads the private map directly')
    assert.ok(!nextCode.includes('roleMap['), 'never reuses a previous assignment')
    assert.ok(nextCode.includes('aliveIds.forEach'), 'writes one entry per living player only')
  })

  test('the reserved entry survives the rewrite so later rounds can re-roll again', () => {
    assert.ok(nextRound.includes('nextSecrets[SECRET_META_KEY] = meta'), 'meta entry is carried forward')
    // writeSecrets replaces the whole private map, so dropping it would end
    // chaos after round two.
    assert.ok(nextRound.includes('secrets: nextSecrets'), 'the rebuilt map is what gets written')
  })

  test('imposters receive no word and crew receive the round word', () => {
    assert.ok(nextRound.includes("role === ROLES.IMPOSTER ? null : word"), 'crew keep the word, imposters do not')
  })

  test('chaos never disturbs the normal online round path', () => {
    assert.ok(nextRound.includes('(chaosNow || restoresBase) && aliveIds.length'), 'the rewrite is gated on a scheduled chaos round')
    // The plain path is still the tail of the function, reachable in classic mode.
    assert.ok(
      nextRound.indexOf('patchRoom(') > nextRound.indexOf('(chaosNow || restoresBase)'),
      'an ordinary round falls through to the unchanged patch path',
    )
  })

  test('closing a room deletes it, so nothing accumulates', async () => {
  const { readFileSync } = await import('node:fs')
  const service = readFileSync(new URL('../src/lib/onlineService.js', import.meta.url), 'utf8')
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

  /* The client: RPC first, plain delete as the fallback — never the old
     `room = null` update that the not-null column rejects. */
  const terminate = service.slice(service.indexOf('export async function terminateRoom'), service.indexOf('export async function sweepExpiredRooms'))
  assert.ok(terminate.includes("callRpc('imposter_terminate_room'"), 'the RPC is tried first')
  assert.ok(terminate.includes('.delete()'), 'the fallback deletes the row')
  assert.ok(!/room:\s*null/.test(terminate), 'the fallback never nulls a not-null column')

  /* Housekeeping deletes stale rows rather than flagging them. */
  const sweep = service.slice(service.indexOf('export async function sweepExpiredRooms'), service.indexOf('export async function sweepExpiredRooms') + 600)
  assert.ok(sweep.includes('.delete()'), 'the sweep deletes')
  assert.ok(!sweep.includes('status: ROOM_STATUS.TERMINATED'), 'no status flagging left')

  /* The database agrees. */
  const terminateFn = schema.slice(schema.indexOf('create or replace function public.imposter_terminate_room'), schema.indexOf('create or replace function public.imposter_sweep_expired'))
  assert.ok(/delete from public\.imposter_rooms/.test(terminateFn), 'terminate deletes the row')
  const sweepFn = schema.slice(schema.indexOf('create or replace function public.imposter_sweep_expired'), schema.indexOf('grant execute on function public.imposter_terminate_room'))
  assert.ok(/delete from public\.imposter_rooms/.test(sweepFn), 'the sweep deletes the row')
  assert.ok(schema.includes('create policy "rooms deletable"'), 'a delete policy exists for the client fallback')
  assert.ok(schema.includes('grant select, insert, update, delete on public.imposter_rooms'), 'delete is granted')
  assert.ok(schema.includes('delete from public.imposter_rooms where code = upper(p_code);'), 'a host leaving an empty room takes the row with it')
})

test('a deleted room tells the watchers the host closed it', async () => {
  const { readFileSync } = await import('node:fs')
  const service = readFileSync(new URL('../src/lib/onlineService.js', import.meta.url), 'utf8')
  const handler = service.slice(service.indexOf("'postgres_changes'"), service.indexOf("'postgres_changes'") + 900)
  assert.ok(handler.includes("payload.eventType === 'DELETE'"), 'the DELETE event is handled')
  assert.ok(/onStatus\?\.\('terminated'\)/.test(handler), 'and reported as a closed room')
  assert.ok(service.includes('That room is closed'), 'the copy says the room is closed, not "not found"')
})

test('the create-room form can actually change imposters and turn length', async () => {
  const { readFileSync } = await import('node:fs')
  const setup = readFileSync(new URL('../src/components/lobby/OnlineSetup.jsx', import.meta.url), 'utf8')

  /* The bug: sanitizeConfig clamped imposterCount to floor((playerCount-1)/2)
     of the DEFAULT six-player count, so the stepper snapped back to 2. */
  const init = setup.slice(setup.indexOf('const [config, setConfig]'), setup.indexOf('const [categoryId, setCategoryId]'))
  assert.ok(!/sanitizeConfig\(\{[^}]*playerCount/.test(init), 'the create config is not clamped to a player count that does not exist yet')
  assert.ok(init.includes('imposterCount: 1'), 'imposters start at one')

  /* The turn length must move between the values the app accepts. */
  assert.ok(setup.includes('values={[15, 30, 45, 60, 90]}'), 'turn length steps through every legal value')
  assert.ok(setup.includes('step={15}'), 'and moves a full step at a time')

  /* Both controls exist on the create form. */
  assert.ok(/label="Imposters"/.test(setup), 'the imposters stepper is rendered')
  assert.ok(/label="Turn length"/.test(setup), 'the turn length stepper is rendered')
})

test('the online host keeps the same chaos cadence as pass & play', () => {
    /* Chaos is an event every 3-5 rounds online too — it used to re-roll every
       single round, which is exactly what the rules forbid. */
    const startGame = bodyOf('startGame')
    const playAgain = bodyOf('playAgain')
    assert.ok(nextRound.includes('const chaosNow = isChaosRound({ config: room.config, nextChaosRound: room.game.nextChaosRound }, round)'), 'the cadence comes from the engine, not from the mode alone')
    assert.ok(nextRound.includes('nextChaosRound: chaosNow ? scheduleNextChaosRound(round) : room.game.nextChaosRound'), 'a chaos round re-arms the clock 3-5 rounds later')
    for (const [label, body] of [['startGame', startGame], ['playAgain', playAgain]]) {
      assert.ok(body.includes('nextChaosRound: isChaosMode(room.config) ? scheduleNextChaosRound(1) : null'), `${label} schedules the first chaos round`)
      assert.ok(body.includes('chaosRound: false'), `${label} opens on an ordinary round`)
    }
    assert.ok(nextRound.includes('noImposterRound: dealtNobody'), 'a chaos round that deals nobody the card says so')
    assert.ok(nextRound.includes("assignRolesFor({ ...room.config, mode: 'normal' }, aliveIds.length)"), 'the configured count comes back afterwards')
  })
}

/* ------------------------------------------------------------------ */
/* SCHEMA COVERAGE (the SQL the app actually calls)                    */
/* ------------------------------------------------------------------ */
/*
 * The database file is a real dependency: the client calls these functions by
 * name and falls back to slower read-modify-write paths when one is absent.
 * A typo in schema.sql used to make `create function` fail, which silently
 * left later functions uncreated — so the names are pinned here.
 */
{
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const verifySql = readFileSync(new URL('../supabase/verify.sql', import.meta.url), 'utf8')
  const service = readFileSync(new URL('../src/lib/onlineService.js', import.meta.url), 'utf8')

  const rpcNames = [...service.matchAll(/callRpc\(\s*'([a-z_]+)'/g)].map((match) => match[1])

  test('every RPC the client calls is defined in the schema file', () => {
    assert.ok(rpcNames.length >= 8, `found ${rpcNames.length} RPC call sites`)
    const missing = rpcNames.filter((name) => !schema.includes(`create or replace function public.${name}(`))
    assert.deepEqual(missing, [], `not defined in supabase/schema.sql: ${missing.join(', ')}`)
  })

  test('the schema defines the tables and policies the client touches', () => {
    assert.ok(schema.includes('create table if not exists public.imposter_rooms'), 'rooms table')
    assert.ok(schema.includes('create table if not exists public.imposter_words'), 'words table')
    assert.ok(schema.includes("alter table public.imposter_rooms enable row level security"), 'rooms RLS')
    assert.ok(schema.includes('drop policy if exists'), 'policies are re-runnable')
  })

  test('the schema file is safe to paste twice', () => {
    // The realtime line used to be a bare ALTER PUBLICATION, which errors on a
    // second run and (in a single-transaction editor) can roll back the lot.
    // Every such statement must therefore sit inside a DO block guard.
    let cursor = 0
    let found = 0
    for (;;) {
      const at = schema.indexOf('alter publication', cursor)
      if (at < 0) break
      found += 1
      const lastDo = schema.lastIndexOf('do $$', at)
      const lastEnd = schema.lastIndexOf('end $$', at)
      assert.ok(lastDo > -1 && lastDo > lastEnd, 'publication is added inside a guard, not bare')
      cursor = at + 1
    }
    assert.ok(found >= 1, 'the publication line is present')
    assert.ok(schema.includes('from pg_publication_tables'), 'guarded by a pg_publication_tables check')
    assert.ok(schema.includes('exception'), 'and degrades if the publication is absent')
  })

  test('no function references a variable it never declares', () => {
    // Cheap static guard for the bug that broke imposter_join_room (v_room).
    const blocks = schema.split('create or replace function public.').slice(1)
    assert.ok(blocks.length >= 8, `checked ${blocks.length} functions`)
    const offenders = []
    blocks.forEach((block) => {
      const name = block.slice(0, block.indexOf('('))
      const body = block.slice(0, block.indexOf('$$;'))
      const declared = new Set([...body.matchAll(/(?:^|[\s,;])(v_[a-z_]+)\s+(?:jsonb|text|int|integer|boolean|public\.|timestamptz|[a-z_]+\s*(?::=|;))/gm)].map((m) => m[1]))
      const used = new Set([...body.matchAll(/\b(v_[a-z_]+)\b/g)].map((m) => m[1]))
      const undeclared = [...used].filter((variable) => !declared.has(variable))
      if (undeclared.length) offenders.push(`${name}: ${undeclared.join(', ')}`)
    })
    assert.deepEqual(offenders, [], `undeclared plpgsql variables -> ${offenders.join(' | ')}`)
  })

  test('the read-only project check covers tables, policies, functions and realtime', () => {
    assert.ok(verifySql.includes('to_regclass'), 'checks tables')
    assert.ok(verifySql.includes('pg_policies'), 'checks policies')
    assert.ok(verifySql.includes('pg_proc'), 'checks functions')
    assert.ok(verifySql.includes('pg_publication_tables'), 'checks realtime')
    assert.ok(/SETUP STATUS/.test(verifySql), 'prints a verdict line')
    // Read-only proof: strip comments and string literals, then require every
    // statement to be a SELECT/CTE.
    const bare = verifySql
      .replace(/--[^\n]*/g, ' ')
      .replace(/'[^']*'/g, "''")
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
    const writes = bare.filter((statement) => !/^(with|select|union|order by)/i.test(statement))
    assert.deepEqual(writes, [], `the check file must not write: ${writes.join(' | ')}`)
  })
}

/* ================================================================== */
/* Await any async assertions before printing the verdict.              */
await Promise.all(pending)

process.stdout.write(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
if (failed) {
  process.stdout.write('\nFailures:\n')
  failures.forEach((f) => process.stdout.write(` • ${f.name}\n   ${f.error.stack?.split('\n').slice(0, 3).join('\n   ') || f.error.message}\n`))
  process.exit(1)
}
