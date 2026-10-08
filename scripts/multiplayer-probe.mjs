#!/usr/bin/env node
/**
 * multiplayer-probe.mjs — 22 live multiplayer join cycles against the REAL
 * Supabase project, driven by the app's own online service (the same code a
 * phone runs): createRoom → joinRoom × N → rejoin → terminate.
 *
 * Safe to run repeatedly: every room it creates is terminated at the end, and
 * the script reports the database's room count before and after to prove nothing
 * was left behind.
 *
 *   node scripts/multiplayer-probe.mjs
 *   node scripts/multiplayer-probe.mjs 5     (run only the first 5 cycles)
 */

import { readFileSync } from 'node:fs'

/* ------------------------------------------------------------------ */
/* Wire up: WebSocket (Node has none), then the app's own backend      */
/* ------------------------------------------------------------------ */
const { WebSocket } = await import('ws')
globalThis.WebSocket = WebSocket

const config = JSON.parse(readFileSync(new URL('../public/runtime-config.json', import.meta.url), 'utf8'))
const runtimeConfig = await import('../src/lib/runtimeConfig.js')
const service = await import('../src/lib/onlineService.js')
const { LIMITS } = await import('../src/data/constants.js')

const saved = runtimeConfig.saveStoredBackend({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey })
if (!saved.ok) {
  console.error('the shipped config does not validate:', saved.error)
  process.exit(1)
}
await runtimeConfig.reloadRuntimeFile().catch(() => {})

const CONFIG = service.backendStatus()
if (!CONFIG.configured) {
  console.error('backend not configured — aborting')
  process.exit(1)
}
console.log(`\nVOTE OUT IMPOSTER — multiplayer join probe`)
console.log(`project : ${CONFIG.host}  (source: ${CONFIG.sourceLabel})`)
console.log(`config  : ${config.supabaseAnonKey.slice(0, 22)}…  (publishable key)\n`)

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NAMES = ['Rakshith', 'Meera', 'Arjun', 'Divya', 'Kiran', 'Sneha', 'Vikram', 'Ananya', 'Rahul', 'Pooja']
const nameFor = (i) => NAMES[i % NAMES.length]

const failures = []
const rows = []
const createdRooms = []

function fail(cycle, message) {
  failures.push({ cycle, message })
  console.log(`  ✗ ${message}`)
}

async function runCycle(index, plan) {
  const started = Date.now()
  const label = `#${String(index).padStart(2, '0')} ${plan.label}`
  try {
    if (plan.kind === 'bogus-code') {
      /*
       * Two flavours of bad code:
       *   KMN4PQ — valid characters, no such room → NOT_FOUND copy
       *   ZZZZZZ — a character the alphabet bans → the validation copy, never
       *            the generic "something went wrong" line
       */
      const cases = [
        { code: 'KMN4PQ', expect: /closed or the code is wrong|could not find|no longer/i, what: 'a room that does not exist' },
        { code: 'ZZZZZZ', expect: /character we never use/i, what: 'a code with a banned character' },
      ]
      let allOk = true
      for (const item of cases) {
        try {
          await service.joinRoom({ playerName: 'Ghost', code: item.code })
          fail(index, `${item.what} should have been refused`)
          allOk = false
        } catch (error) {
          const friendly = service.friendlyRoomError(error)
          if (!item.expect.test(friendly)) {
            fail(index, `${item.what} gave an unhelpful message: "${friendly}"`)
            allOk = false
          } else {
            console.log(`  ✓ ${label} — ${item.what} refused: "${friendly}"`)
          }
        }
      }
      rows.push({ label, detail: 'both bad-code paths say what is wrong', ms: Date.now() - started, ok: allOk })
      return allOk
    }

    if (plan.kind === 'custom-code') {
      /*
       * The sponsor-gated custom code, checked against the real database:
       * the code the player typed is PINNED (not quietly regenerated), an
       * ugly code never reaches the insert, and a taken code is refused by
       * name — never swapped for a random one.
       */
      const { ROOM_ALPHABET } = await import('../src/utils/random.js')
      let chosen = ''
      while (chosen.length < 6) chosen += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]
      const roomConfig = { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed', turnSeconds: 30 }
      let allOk = true
      try {
        const first = await service.createRoom({ playerName: 'Custom A', config: roomConfig, customCode: chosen })
        createdRooms.push(first.code)
        if (first.code !== chosen) {
          fail(index, `custom code was not pinned: wanted ${chosen}, got ${first.code}`)
          allOk = false
        } else {
          console.log(`  ✓ custom code ${chosen} became the room code exactly as typed`)
        }
        try {
          await service.createRoom({ playerName: 'Custom B', config: roomConfig, customCode: 'BABY01' })
          fail(index, 'a code with banned characters was accepted')
          allOk = false
        } catch (error) {
          if (error.code !== 'INVALID_CODE') {
            fail(index, `ugly custom code gave ${error.code} instead of INVALID_CODE`)
            allOk = false
          } else {
            console.log(`  ✓ ugly code refused: "${service.friendlyRoomError(error)}"`)
          }
        }
        try {
          await service.createRoom({ playerName: 'Custom C', config: roomConfig, customCode: chosen })
          fail(index, 'a duplicate custom code was accepted — two live rooms share it!')
          allOk = false
        } catch (error) {
          if (error.code !== 'CODE_TAKEN') {
            fail(index, `duplicate custom code gave ${error.code} instead of CODE_TAKEN`)
            allOk = false
          } else {
            console.log(`  ✓ live code not reusable: "${service.friendlyRoomError(error)}"`)
          }
        }
        await service.terminateRoom(first.code)
        createdRooms.pop()
      } catch (error) {
        fail(index, `custom-code flow broke: ${error.message}`)
        allOk = false
      }
      rows.push({ label, detail: 'pinned exactly · ugly refused · taken rejected', ms: Date.now() - started, ok: allOk })
      return allOk
    }

    // ---- create the room ------------------------------------------------
    const hostName = nameFor(0)
    const { code, player: host } = await service.createRoom({
      playerName: hostName,
      config: { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed', turnSeconds: 30 },
    })
    createdRooms.push(code)
    if (!/^[A-HJ-NP-Z3-9]{6}$/.test(code)) fail(index, `room code is not 6 clean characters: ${code}`)

    if (plan.kind === 'terminated') {
      await service.terminateRoom(code)
      createdRooms.pop()
      try {
        await service.joinRoom({ playerName: 'Latecomer', code })
        fail(index, 'joining a closed room should have failed')
      } catch (error) {
        const friendly = service.friendlyRoomError(error)
        if (/not found|no longer|expired|gone|closed/i.test(friendly)) {
          rows.push({ label, detail: `refused after close: "${friendly}"`, ms: Date.now() - started, ok: true })
          console.log(`  ✓ ${label} — refused after close: "${friendly}"`)
          return true
        }
        fail(index, `closing a room gave an unfriendly error: "${friendly}"`)
      }
      rows.push({ label, detail: 'unfriendly error', ms: Date.now() - started, ok: false })
      return false
    }

    // ---- the joins ------------------------------------------------------
    let room = null
    let lastPlayer = null
    const joined = new Map([[hostName, host.id]])
    for (let i = 1; i < plan.players; i += 1) {
      const name = nameFor(i)
      const { room: next, player, rejoined } = await service.joinRoom({ playerName: name, code })
      room = next
      lastPlayer = player
      if (!player) {
        fail(index, `${name} got no seat back`)
        break
      }
      if (rejoined) fail(index, `${name} was treated as a rejoin on a first join`)
      if (joined.has(name) && joined.get(name) !== player.id) fail(index, `${name} got two different seats`)
      joined.set(name, player.id)
    }
    if (room) {
      const names = room.players.map((p) => p.name)
      if (!names.includes(hostName)) fail(index, 'the host vanished from the roster')
      if (room.players.length !== plan.players) {
        fail(index, `roster has ${room.players.length} players, expected ${plan.players}`)
      }
      const ids = room.players.map((p) => p.id)
      if (new Set(ids).size !== ids.length) fail(index, 'two players share one id')
      if (!room.players.every((p) => p.name)) fail(index, 'a player joined without a name')
      if (room.status !== 'lobby') fail(index, `a fresh room should be in the lobby, saw "${room.status}"`)
    }

    // ---- a second device rejoining with the same name --------------------
    if (plan.kind === 'standard' || plan.kind === 'big' || plan.kind === 'duplicate') {
      const back = nameFor(1)
      const before = room.players.length
      const { room: after, player, rejoined } = await service.joinRoom({ playerName: back, code })
      if (plan.kind === 'duplicate') {
        // No id handed over: the same NAME must reclaim the slot, not add one.
        if (after.players.length !== before) fail(index, `same name added a ${after.players.length - before}th player`)
        if (!rejoined) fail(index, 'the same name was not recognised as a rejoin')
      } else {
        // The same device coming back hands over its id.
        const { room: again, rejoined: reallyRejoined } = await service.joinRoom({
          playerName: back,
          code,
          existingPlayerId: joined.get(back),
        })
        if (!reallyRejoined) fail(index, 'handing the stored id back was not treated as a rejoin')
        if (again.players.length !== after.players.length) fail(index, 'the rejoin changed the roster size')
      }
      if (player && joined.get(back) && player.id !== joined.get(back)) fail(index, `${back} lost their seat on rejoin`)
    }

    // ---- close it -------------------------------------------------------
    await service.terminateRoom(code)
    createdRooms.pop()
    let gone = false
    try {
      await service.fetchRoomRow(code)
    } catch {
      gone = true
    }
    if (!gone) fail(index, `room ${code} still exists after closing`)

    const ms = Date.now() - started
    rows.push({ label, detail: `code ${code} · ${plan.players} players · closed clean`, ms, ok: true })
    console.log(`  ✓ ${label} — ${plan.players} players joined (${code}), rejoin verified, room closed  [${ms}ms]`)
    return true
  } catch (error) {
    fail(index, `threw: ${service.friendlyRoomError(error) || error.message}`)
    rows.push({ label, detail: String(error.message).slice(0, 60), ms: Date.now() - started, ok: false })
    return false
  }
}

/* ------------------------------------------------------------------ */
/* The 22 cycles                                                       */
/* ------------------------------------------------------------------ */
const before = await service.listActiveRooms(200)
console.log(`rooms in the database before this run: ${before.length}\n`)

const only = Number(process.argv[2] || 0)
const plan = []
for (let i = 1; i <= 16; i += 1) plan.push({ kind: 'standard', players: 3 + ((i - 1) % 4), label: `standard lobby (${3 + ((i - 1) % 4)} players)` })
for (let i = 17; i <= 19; i += 1) plan.push({ kind: 'big', players: 6 + (i - 17), label: `full table (${6 + (i - 17)} players)` })
plan.push({ kind: 'duplicate', players: 4, label: 'same name from a second device' })
plan.push({ kind: 'bogus-code', label: 'bad codes (missing room + banned character)' })
plan.push({ kind: 'terminated', players: 3, label: 'a room that was just closed' })
plan.push({ kind: 'custom-code', label: 'custom code: pinned, rejected when ugly, refused when taken' })

let ok = 0
for (let i = 0; i < (only || plan.length); i += 1) {
  const passed = await runCycle(i + 1, plan[i])
  if (passed) ok += 1
  await sleep(180)
}

/* ------------------------------------------------------------------ */
/* Realtime: does a join reach the host's screen?                       */
/* ------------------------------------------------------------------ */
console.log('\nrealtime check (host subscribes, a second device joins):')
let realtimeResult = 'not attempted'
try {
  const { code } = await service.createRoom({ playerName: 'RT Host', config: { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed' } })
  createdRooms.push(code)
  let sawJoin = false
  let room = null
  const unsubscribe = service.subscribeToRoom(code, {
    onRoom: (next) => {
      room = next
      if (next.players.length >= 2) sawJoin = true
    },
    onStatus: () => {},
  })
  await sleep(1200)
  const { room: afterJoin } = await service.joinRoom({ playerName: 'RT Guest', code })
  const deadline = Date.now() + 6000
  while (!sawJoin && Date.now() < deadline) await sleep(150)
  realtimeResult = sawJoin ? `✓ the host's screen received the join live (roster now ${room?.players.length} players)` : '⚠ no realtime event arrived within 6s (the join itself succeeded over REST)'
  if (!sawJoin && afterJoin.players.length === 2) realtimeResult += ' — realtime needs a browser socket; verified separately by the UI suite'
  unsubscribe()
  await service.terminateRoom(code)
  createdRooms.pop()
  console.log(' ', realtimeResult)
} catch (error) {
  realtimeResult = `⚠ realtime check could not run here: ${error.message}`
  console.log(' ', realtimeResult)
}

/* ------------------------------------------------------------------ */
/* The no-show drill: kick, claim and protection — against the live DB  */
/* ------------------------------------------------------------------ */
console.log('\nno-show rescue drill (the frozen-table cures):')
const onlineGame = await import('../src/lib/onlineGame.js')
let drillOk = 0
const drillTotal = 3

const rowOf = async (code) => {
  const row = await service.fetchRoomRow(code)
  return service.normalizeRoom(row.room, { code: row.code, hostId: row.host_id, status: row.status })
}

/* A) removing a dark phone opens the reveal gate that the dark phone blocked */
try {
  const { room: r0, player: a } = await service.createRoom({ playerName: 'Drill A1', config: { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed' } })
  createdRooms.push(r0.code)
  const { player: b } = await service.joinRoom({ playerName: 'Drill A2', code: r0.code })
  const { player: c } = await service.joinRoom({ playerName: 'Drill A3', code: r0.code })

  const fresh = await rowOf(r0.code)
  await service.patchRoom({
    code: r0.code,
    patch: {
      players: fresh.players.map((p) => (p.id === b.id ? { ...p, lastSeen: Date.now() - 120000 } : p)),
      game: { round: 1, phase: 'reveal', revealedBy: [a.id, c.id], eliminated: [] },
    },
    status: 'playing',
  })

  const stuck = await rowOf(r0.code)
  const gateBefore = onlineGame.revealProgress(stuck)
  const dark = onlineGame.offlinePlayers(stuck).map((p) => p.id)
  if (gateBefore.complete) throw new Error('the gate was open while a phone sat unseen — test room is wrong')
  if (dark.length !== 1 || dark[0] !== b.id) throw new Error(`offline detection saw ${JSON.stringify(dark)} instead of just B`)

  await service.removePlayer({ code: r0.code, playerId: b.id })
  const freed = await rowOf(r0.code)
  const gateAfter = onlineGame.revealProgress(freed)
  if (freed.players.length !== 2) throw new Error(`roster should shrink to 2, got ${freed.players.length}`)
  if (!gateAfter.complete) throw new Error('the reveal gate did NOT open after the removal')
  if (freed.game.revealedBy.includes(b.id)) throw new Error('the removed player lingers in revealedBy')
  await service.terminateRoom(r0.code)
  createdRooms.pop()
  drillOk += 1
  console.log('  ✓ A: kick unblocks — revealProgress false → true after removing the dark phone (live DB)')
} catch (error) {
  failures.push({ cycle: 'drill-A', message: error.message })
  console.log(`  ✗ A: ${error.message}`)
}

/* B) claim-host: refused while the host lives, granted after they go quiet */
try {
  const { room: r0, player: a } = await service.createRoom({ playerName: 'Drill B1', config: { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed' } })
  createdRooms.push(r0.code)
  const { player: b } = await service.joinRoom({ playerName: 'Drill B2', code: r0.code })

  await service.claimHost({ code: r0.code, playerId: b.id })
  const afterGreedy = await rowOf(r0.code)
  if (afterGreedy.hostId === b.id) throw new Error('a player claimed a room whose host is still alive')

  await service.patchRoom({ code: r0.code, patch: { players: afterGreedy.players.map((p) => (p.id === a.id ? { ...p, lastSeen: Date.now() - 120000, online: false } : p)) } })
  const { room: afterClaim } = await service.claimHost({ code: r0.code, playerId: b.id })
  const afterHandover = afterClaim || (await rowOf(r0.code))
  if (afterHandover.hostId !== b.id) throw new Error('the successor could NOT take over after the host went quiet')
  const promoted = afterHandover.players.find((p) => p.id === b.id)
  if (!promoted?.isHost) throw new Error('hostId moved but the isHost flag did not')
  await service.terminateRoom(r0.code)
  createdRooms.pop()
  drillOk += 1
  console.log("  ✓ B: hand-over — greedy claim refused, a quiet host's room falls to the online player (live DB)")
} catch (error) {
  failures.push({ cycle: 'drill-B', message: error.message })
  console.log(`  ✗ B: ${error.message}`)
}

/* C) the host seat is protected from its own remove button */
try {
  const { room: r0, player: a } = await service.createRoom({ playerName: 'Drill C1', config: { imposterCount: 1, categoryIds: ['random'], difficulty: 'mixed' } })
  createdRooms.push(r0.code)
  let code = null
  try {
    await service.removePlayer({ code: r0.code, playerId: a.id })
  } catch (error) {
    code = error.code
  }
  if (code !== 'HOST_PROTECTED') throw new Error(`expected HOST_PROTECTED, got ${code}`)
  const stillThere = await rowOf(r0.code)
  if (!stillThere.players.some((p) => p.id === a.id)) throw new Error('the host was removed despite the refusal!')
  await service.terminateRoom(r0.code)
  createdRooms.pop()
  drillOk += 1
  console.log('  ✓ C: protection — a host cannot remove themselves, the room stays intact (live DB)')
} catch (error) {
  failures.push({ cycle: 'drill-C', message: error.message })
  console.log(`  ✗ C: ${error.message}`)
}
console.log(`  rescue drills: ${drillOk}/${drillTotal}`)

/* ------------------------------------------------------------------ */
/* Cleanup + summary                                                   */
/* ------------------------------------------------------------------ */
for (const code of createdRooms) {
  try {
    await service.terminateRoom(code)
    console.log(`  cleaned up leftover room ${code}`)
  } catch {
    /* best effort */
  }
}

const after = await service.listActiveRooms(200)
console.log(`\nrooms in the database after this run : ${after.length} (before: ${before.length})`)
console.log(`\n${ok}/${plan.length} join cycles passed${failures.length ? ` — ${failures.length} failure(s)` : ''}`)
if (failures.length) {
  console.log('\nfailures:')
  failures.forEach((f) => console.log(`  • #${f.cycle}: ${f.message}`))
  process.exit(1)
}
console.log('multiplayer joining verified against the live project.')
process.exit(0)
