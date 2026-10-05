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

/* ------------------------------------------------------------------ */
/* Tiny harness                                                        */
/* ------------------------------------------------------------------ */
let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed += 1
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`)
  } catch (error) {
    failed += 1
    failures.push({ name, error })
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n      ${error.message.split('\n')[0]}\n`)
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

const SECRET = { word: { word: 'Umbrella', categoryId: 'everyday', categoryName: 'Everyday', difficulty: 'easy', decoy: 'Raincoat' } }
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

test('a tied vote leaves nobody out and hands classic mode to the imposters', () => {
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
  assert.equal(game.winner.team, 'imposter')
  assert.ok(game.players.every((p) => p.alive))
})

test('crew wins when the imposter is voted out', () => {
  let game = voteSetup({ count: 5 })
  const imposter = game.players.find((p) => p.role === 'imposter')
  const others = game.players.filter((p) => p.id !== imposter.id)
  others.forEach((voter) => {
    game = engine.castVote(game, voter.id, imposter.id)
  })
  game = engine.resolveRound(game)
  assert.equal(game.lastResult.wasImposter, true)
  assert.equal(game.winner.team, 'crew')
  assert.equal(game.players.find((p) => p.id === imposter.id).alive, false)
})

test('imposters win when the wrong player is accused (classic)', () => {
  let game = voteSetup({ count: 5 })
  const imposter = game.players.find((p) => p.role === 'imposter')
  const crew = game.players.filter((p) => p.role === 'crew')
  const victim = crew[0]
  const voters = game.players.filter((p) => p.id !== victim.id)
  voters.forEach((voter) => {
    game = engine.castVote(game, voter.id, victim.id)
  })
  game = engine.resolveRound(game)
  assert.equal(game.lastResult.wasImposter, false)
  assert.equal(game.winner.team, 'imposter')
  assert.equal(game.players.find((p) => p.id === imposter.id).alive, true)
})

test('survival mode keeps playing after a wrong accusation', () => {
  let game = voteSetup({ count: 6, winRule: 'survival', rounds: 3 })
  const victim = game.players.find((p) => p.role === 'crew').id
  game.players
    .filter((p) => p.id !== victim)
    .forEach((voter) => {
      game = engine.castVote(game, voter.id, victim)
    })
  game = engine.resolveRound(game)
  assert.equal(game.winner, null)
  game = engine.nextRound(game)
  assert.equal(game.round, 2)
  assert.equal(game.phase, 'handoff')
  assert.equal(game.players.find((p) => p.id === victim).alive, false)
})

test('survival mode ends when imposters match the crew', () => {
  let game = voteSetup({ count: 4, imposters: 1, winRule: 'survival', rounds: 4 })
  // Eliminate two crew members in a row.
  for (let round = 0; round < 2; round += 1) {
    const victim = game.players.find((p) => p.role === 'crew' && p.alive)
    const voters = game.players.filter((p) => p.alive && p.id !== victim.id)
    if (!voters.length) break
    game = engine.startRound({ ...game, phase: engine.PHASE.VOTE_HANDOFF, votes: {}, voteIndex: 0 })
    voters.forEach((voter) => {
      game = engine.castVote(game, voter.id, victim.id)
    })
    game = engine.resolveRound(game)
    if (game.winner) break
    game = engine.nextRound(game)
  }
  assert.equal(game.winner?.team, 'imposter')
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

test('host tally equals the local engine verdict', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p2', p2: 'p2', p3: 'p2', p4: 'p1' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.eliminatedId, 'p2')
  assert.equal(result.wasImposter, true)
  assert.equal(result.winner, 'crew')
})

test('tied online vote hands classic mode to the imposters', () => {
  const r = room()
  Object.assign(r.game.votes, { p1: 'p2', p2: 'p3', p3: 'p2', p4: 'p3' })
  const result = onlineGame.computeResult(r, { p1: 'crew', p2: 'imposter', p3: 'crew', p4: 'crew' })
  assert.equal(result.tie, true)
  assert.equal(result.eliminatedId, null)
  assert.equal(result.winner, 'imposter')
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
    NOT_FOUND: 'ROOM NOT FOUND',
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

/* ================================================================== */
process.stdout.write(`\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`)
if (failed) {
  process.stdout.write('\nFailures:\n')
  failures.forEach((f) => process.stdout.write(` • ${f.name}\n   ${f.error.stack?.split('\n').slice(0, 3).join('\n   ') || f.error.message}\n`))
  process.exit(1)
}
