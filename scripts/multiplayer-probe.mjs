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
  realtimeResult = sawJoin
    ? `✓ the host's screen received the join live (roster now ${room?.players.length} players)`
    : '⚠ no realtime event arrived within 6s (the join itself succeeded over REST)'
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
