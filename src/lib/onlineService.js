/**
 * ONLINE ROOM SERVICE — client-only, no custom server.
 *
 * Architecture
 * ------------
 * One row in `imposter_rooms` holds a room:
 *
 *   code        text primary key            (4 chars, unambiguous alphabet)
 *   status      text                        lobby | playing | ended | terminated
 *   host_id     text                        host player id
 *   player_count int                        denormalised for admin listings
 *   room        jsonb  <-- PUBLIC STATE     players, phase, votes, results…
 *   secrets     jsonb  <-- PRIVATE STATE    { [playerId]: { role, word } }
 *   created_at / updated_at / expires_at
 *
 * PUBLIC vs PRIVATE
 * -----------------
 * `room` never contains the secret word or the role assignment during play, so
 * a curious player reading the row learns nothing useful. `secrets` is only
 * ever read by the owning client (keyed by that client's player id) and is only
 * written by the host when the game starts.
 *
 * Write model
 * -----------
 * Rooms are mutated with atomic Postgres functions (see supabase/schema.sql)
 * so two players joining at once can never overwrite each other. If those
 * functions have not been created yet the adapter transparently falls back to
 * read-modify-write with retries — the game still works, it is just slightly
 * less bullet-proof under simultaneous writes.
 */

import { isOnlineConfigured, getSupabase, supabaseConfig, resetSupabaseClient, createProbeClient } from './supabase.js'
import {
  describeBackend,
  ensureBackend,
  getActiveBackend,
  clearStoredBackend,
  saveStoredBackend,
  validateBackendConfig,
} from './runtimeConfig.js'
import { ROOM_STATUS } from '../data/constants.js'
import { generateRoomCode, uid } from '../utils/random.js'
import { nameKey, normalizeName, validatePlayerName, validateRoomCode } from '../utils/validate.js'

export { ROOM_STATUS }

const PG_COLUMNS = 'code,status,host_id,player_count,room,secrets,created_at,updated_at,expires_at'
const MAX_RETRIES = 4

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const now = () => Date.now()

/**
 * True when a backend is usable right now. Synchronous, so render paths can
 * call it directly; call `refreshConfiguration()` on mount to also pick up
 * runtime-config.json.
 */
export function isConfigured() {
  return isOnlineConfigured() && Boolean(getSupabase())
}

/** Resolve configuration (including the optional runtime file) and report. */
export async function refreshConfiguration() {
  await ensureBackend()
  return isConfigured()
}

/** Where the current values came from — for status panels. */
export const backendStatus = () => describeBackend()

/**
 * Save backend values on this device: takes effect immediately, no rebuild and
 * no redeploy. Returns `{ ok, error? }` with player-friendly copy.
 */
export async function applyBackendConfig(input) {
  const result = saveStoredBackend(input)
  if (!result.ok) return result
  resetSupabaseClient()
  await ensureBackend()
  return { ok: true, value: describeBackend() }
}

/** Forget device values and fall back to file / build configuration. */
export async function forgetBackendConfig() {
  clearStoredBackend()
  resetSupabaseClient()
  await ensureBackend()
  return describeBackend()
}

/**
 * Probe a candidate configuration without saving it, so a typo cannot break a
 * working setup. Reports the same friendly codes as room operations.
 */
export async function testBackendConfig(input = null) {
  const target = input ? validateBackendConfig(input) : { ok: true, value: getActiveBackend() }
  if (!target.ok) return { ok: false, error: target.error }
  const { url, anonKey } = target.value
  if (!url || !anonKey) return { ok: false, error: 'Enter the project URL and the anon key first.' }
  try {
    const probe = createProbeClient(url, anonKey)
    const { error } = await probe.from(supabaseConfig.table).select('code', { count: 'exact', head: true }).limit(1)
    if (error) throw error
    return { ok: true, detail: `Connected to ${new URL(url).host} — rooms table reachable.` }
  } catch (error) {
    return { ok: false, error: friendlyRoomError(classifyError(error)) }
  }
}

async function requireClient() {
  await ensureBackend()
  const client = getSupabase()
  if (!client) {
    const error = new Error('Online rooms are not configured')
    error.code = 'NOT_CONFIGURED'
    throw error
  }
  return client
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Map low-level transport failures onto friendly, user-facing codes. */
/**
 * Codes this module raises itself. A deliberate `fail('NOT_FOUND', …)` must
 * survive classification — it used to be re-derived from the message text and
 * flattened into UNKNOWN, which is why a mistyped room code produced
 * "Something went wrong talking to the room server" instead of naming it.
 */
const KNOWN_ERROR_CODES = new Set([
  'NOT_CONFIGURED',
  'NOT_FOUND',
  'FULL',
  'STARTED',
  'EXPIRED',
  'TERMINATED',
  'SCHEMA_MISSING',
  'NETWORK',
  'DUPLICATE_CODE',
  'FORBIDDEN',
  'INVALID_CODE',
  'INVALID_NAME',
])

export function classifyError(error) {
  const message = String(error?.message || error || '')
  if (error?.code && KNOWN_ERROR_CODES.has(error.code)) return error
  if (error?.code === 'NOT_CONFIGURED') return error
  const wrapped = new Error(message)
  if (/does not exist|relation|schema cache|function .* not found|42P01|PGRST202/i.test(message)) wrapped.code = 'SCHEMA_MISSING'
  else if (/Failed to fetch|NetworkError|Load failed|timeout|offline/i.test(message)) wrapped.code = 'NETWORK'
  else if (/duplicate key|23505/i.test(message)) wrapped.code = 'DUPLICATE_CODE'
  else if (/row level security|JWT|permission denied|42501/i.test(message)) wrapped.code = 'FORBIDDEN'
  else wrapped.code = 'UNKNOWN'
  wrapped.original = error
  return wrapped
}

export const friendlyRoomError = (error) => {
  switch (error?.code) {
    case 'NOT_CONFIGURED':
      return 'Online rooms need a Supabase project. See the README for the two-minute setup.'
    case 'SCHEMA_MISSING':
      return 'The room database is not set up yet. Run supabase/schema.sql in your Supabase project.'
    case 'NETWORK':
      return 'CONNECTION LOST — check your internet and try again.'
    case 'DUPLICATE_CODE':
      return 'That room code is already in use. Try creating the room again.'
    case 'FORBIDDEN':
      return 'The database rejected that request. Re-check your Supabase policies.'
    case 'NOT_FOUND':
      /* Either the code was mistyped, or the room was closed (closing deletes
         the row). Say both, so the player knows what to try next. */
      return 'That room is closed or the code is wrong — check it with the host, or open your own room.'
    case 'INVALID_CODE':
    case 'INVALID_NAME':
      /* Validation already wrote precise copy ("That code contains a character
         we never use.") — surface it instead of the generic line. A mistyped
         invite link lands here, so it has to say what is wrong. */
      return error.message || 'Check the code and name, then try again.'
    case 'FULL':
      return 'THIS ROOM IS FULL'
    case 'STARTED':
      return 'GAME IN PROGRESS'
    case 'EXPIRED':
      return 'That room has expired. Ask the host to create a new one.'
    case 'TERMINATED':
      return 'The host closed this room.'
    default:
      return 'Something went wrong talking to the room server. Please try again.'
  }
}

const fail = (code, message) => {
  const error = new Error(message || code)
  error.code = code
  throw error
}

/* -------------------------------------------------------------------------- */
/* Document normalisation                                                     */
/* -------------------------------------------------------------------------- */

export function makePlayer({ name, isHost = false }) {
  return {
    id: uid('pl'),
    name: normalizeName(name),
    isHost: Boolean(isHost),
    ready: Boolean(isHost),
    online: true,
    joinedAt: now(),
    lastSeen: now(),
    score: 0,
  }
}

export function normalizeRoom(rawRoom, meta = {}) {
  const room = rawRoom && typeof rawRoom === 'object' ? rawRoom : {}
  return {
    code: room.code || meta.code || '',
    hostId: room.hostId || meta.hostId || null,
    status: room.status || meta.status || ROOM_STATUS.LOBBY,
    createdAt: room.createdAt || meta.createdAt || now(),
    updatedAt: room.updatedAt || meta.updatedAt || now(),
    expiresAt: room.expiresAt || meta.expiresAt || null,
    config: {
      imposterCount: 1,
      categoryIds: ['random'],
      categoryLabel: 'Random',
      difficulty: 'mixed',
      turnSeconds: 30,
      rounds: 2,
      winRule: 'classic',
      voteMode: 'secret',
      clueOrder: 'random',
      mode: 'normal',
      ...(room.config || {}),
    },
    players: Array.isArray(room.players)
      ? room.players
          .filter((p) => p && typeof p.id === 'string')
          .map((p) => ({
            id: p.id,
            name: normalizeName(p.name) || 'Player',
            isHost: Boolean(p.isHost),
            ready: Boolean(p.ready),
            online: p.online !== false,
            joinedAt: p.joinedAt || now(),
            lastSeen: p.lastSeen || now(),
            score: Number(p.score) || 0,
          }))
      : [],
    game: room.game
      ? {
          round: Number(room.game.round) || 1,
          phase: room.game.phase || 'reveal',
          revealIndex: Number(room.game.revealIndex) || 0,
          revealedBy: Array.isArray(room.game.revealedBy) ? room.game.revealedBy : [],
          clueOrder: Array.isArray(room.game.clueOrder) ? room.game.clueOrder : [],
          clueIndex: Number(room.game.clueIndex) || 0,
          turnPlayerId: room.game.turnPlayerId || null,
          timer: room.game.timer || { running: false, duration: 30, startedAt: null },
          votes: room.game.votes && typeof room.game.votes === 'object' ? room.game.votes : {},
          submitted: Array.isArray(room.game.submitted) ? room.game.submitted : [],
          openVote: room.game.openVote || null,
          lastResult: room.game.lastResult || null,
          winner: room.game.winner || null,
          history: Array.isArray(room.game.history) ? room.game.history : [],
          eliminated: Array.isArray(room.game.eliminated) ? room.game.eliminated : [],
          deck: room.game.deck || null,
        }
      : null,
    version: Number(room.version) || 1,
  }
}

function toRowPatch(roomPatch, extra = {}) {
  const patch = { ...roomPatch, updatedAt: now() }
  const row = { room: patch, updated_at: new Date().toISOString(), ...extra }
  if (patch.status) row.status = patch.status
  if (typeof patch.hostId === 'string') row.host_id = patch.hostId
  return row
}

const isExpired = (row) => {
  if (!row?.expires_at) return false
  return new Date(row.expires_at).getTime() < now()
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function fetchRoomRow(code) {
  const client = await requireClient()
  const { data, error } = await client.from(supabaseConfig.table).select(PG_COLUMNS).eq('code', code).maybeSingle()
  if (error) throw classifyError(error)
  if (!data) fail('NOT_FOUND', `Room ${code} not found`)
  if (isExpired(data)) fail('EXPIRED', 'Room expired')
  if (data.status === ROOM_STATUS.TERMINATED) fail('TERMINATED', 'Room terminated')
  return data
}

export async function roomExists(code) {
  try {
    await fetchRoomRow(code)
    return true
  } catch (error) {
    if (error.code === 'NOT_FOUND') return false
    throw error
  }
}

/** Lightweight active-room listing for the BLACK BOX dashboard. */
export async function listActiveRooms(limit = 60) {
  const client = await requireClient()
  const { data, error } = await client
    .from(supabaseConfig.table)
    .select('code,status,host_id,player_count,created_at,updated_at,room')
    .neq('status', ROOM_STATUS.TERMINATED)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw classifyError(error)
  return (data || []).map((row) => {
    const room = normalizeRoom(row.room, { code: row.code, hostId: row.host_id, status: row.status })
    const host = room.players.find((p) => p.id === room.hostId)
    return {
      code: row.code,
      status: row.status,
      playerCount: row.player_count ?? room.players.length,
      hostName: host?.name || '—',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      round: room.game?.round || null,
      phase: room.game?.phase || null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Writes — atomic RPC first, resilient fallback second                        */
/* -------------------------------------------------------------------------- */

const rpcUnavailable = new Set()

async function callRpc(name, args) {
  const client = getSupabase()
  if (!client || rpcUnavailable.has(name)) return { ok: false, skipped: true }
  const { data, error } = await client.rpc(name, args)
  if (error) {
    const friendly = classifyError(error)
    if (friendly.code === 'SCHEMA_MISSING' || /Could not find the function|PGRST202/i.test(error.message)) {
      rpcUnavailable.add(name) // remember for this session; fall back silently
      return { ok: false, skipped: true }
    }
    throw friendly
  }
  return { ok: true, data }
}

/** Read → transform → write, with optimistic-concurrency retries. */
async function mutateRoom(code, transform, extraRow = {}) {
  const client = await requireClient()
  let lastError = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const row = await fetchRoomRow(code)
      const current = normalizeRoom(row.room, {
        code: row.code,
        hostId: row.host_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
      })
      const result = transform(current)
      if (!result) return { room: current, skipped: true }
      const { patch, secrets, nextPlayerCount, statusOverride, remove } = result
      /* `remove: true` closes the room by deleting its row — see terminateRoom. */
      if (remove) {
        const { error } = await client.from(supabaseConfig.table).delete().eq('code', code)
        if (error) throw classifyError(error)
        return { room: null, removed: true }
      }
      const rowPatch = toRowPatch(patch, {
        ...extraRow,
        ...(statusOverride ? { status: statusOverride } : {}),
        ...(typeof nextPlayerCount === 'number' ? { player_count: nextPlayerCount } : {}),
        ...(secrets ? { secrets } : {}),
      })
      const { data, error } = await client.from(supabaseConfig.table).update(rowPatch).eq('code', code).select(PG_COLUMNS).maybeSingle()
      if (error) throw classifyError(error)
      if (!data) fail('NOT_FOUND', 'Room vanished mid-write')
      return { room: normalizeRoom(data.room, { code: data.code, hostId: data.host_id, status: data.status }), secrets: data.secrets }
    } catch (error) {
      lastError = classifyError(error)
      if (lastError.code === 'NOT_FOUND' || lastError.code === 'EXPIRED' || lastError.code === 'TERMINATED') throw lastError
      if (attempt < MAX_RETRIES - 1) await sleep(110 * (attempt + 1))
    }
  }
  throw lastError || classifyError(new Error('Could not update the room'))
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Create a room, retrying on the (astronomically unlikely) code collision.
 * @returns {Promise<{room: object, player: object}>}
 */
export async function createRoom({ playerName, config }) {
  const client = await requireClient()
  const nameCheck = validatePlayerName(playerName)
  if (!nameCheck.ok) fail('INVALID_NAME', nameCheck.error)

  const host = makePlayer({ name: nameCheck.value, isHost: true })
  const expiresAt = new Date(now() + supabaseConfig.roomTtlMinutes * 60_000).toISOString()

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateRoomCode()
    const room = normalizeRoom(
      {
        code,
        hostId: host.id,
        status: ROOM_STATUS.LOBBY,
        createdAt: now(),
        updatedAt: now(),
        config: {
          imposterCount: config?.imposterCount ?? 1,
          categoryIds: config?.categoryIds ?? ['random'],
          categoryLabel: config?.categoryLabel ?? 'Random',
          difficulty: config?.difficulty ?? 'mixed',
          turnSeconds: config?.turnSeconds ?? 30,
          rounds: config?.rounds ?? 2,
          winRule: config?.winRule ?? 'classic',
          voteMode: config?.voteMode ?? 'secret',
          clueOrder: config?.clueOrder ?? 'random',
        },
        players: [host],
        game: null,
        version: 1,
      },
      { code },
    )

    const { data, error } = await client
      .from(supabaseConfig.table)
      .insert({
        code,
        status: ROOM_STATUS.LOBBY,
        host_id: host.id,
        player_count: 1,
        room,
        secrets: {},
        created_at: room.createdAt ? new Date(room.createdAt).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select(PG_COLUMNS)
      .maybeSingle()

    if (!error && data) {
      return { room: normalizeRoom(data.room, { code, hostId: host.id, status: data.status }), player: host, code }
    }
    const friendly = classifyError(error)
    if (friendly.code !== 'DUPLICATE_CODE') throw friendly
    await sleep(80)
  }
  fail('DUPLICATE_CODE', 'Could not allocate a free room code')
}

/**
 * Join an existing lobby (or rejoin a game already in progress with the same
 * name, which covers refresh + reconnect).
 */
export async function joinRoom({ playerName, code, existingPlayerId = null }) {
  const codeCheck = validateRoomCode(code)
  if (!codeCheck.ok) fail('INVALID_CODE', codeCheck.error)
  const nameCheck = validatePlayerName(playerName)
  if (!nameCheck.ok) fail('INVALID_NAME', nameCheck.error)

  const cleanCode = codeCheck.value

  // Fast path: atomic RPC.
  const rpc = await callRpc('imposter_join_room', {
    p_code: cleanCode,
    p_name: nameCheck.value,
    p_player_id: existingPlayerId,
  })
  if (rpc.ok && rpc.data) {
    const payload = typeof rpc.data === 'string' ? JSON.parse(rpc.data) : rpc.data
    if (payload?.error) fail(payload.error, payload.message)
    const room = normalizeRoom(payload.room, { code: cleanCode, hostId: payload.room?.hostId })
    const player = room.players.find((p) => p.id === payload.playerId) || null
    if (player) return { room, player, rejoined: Boolean(payload.rejoined) }
  }

  // Fallback: read-modify-write.
  let created = null
  let rejoined = false
  const result = await mutateRoom(cleanCode, (room) => {
    const existingById = existingPlayerId ? room.players.find((p) => p.id === existingPlayerId) : null
    if (existingById) {
      rejoined = true
      const players = room.players.map((p) => (p.id === existingById.id ? { ...p, name: nameCheck.value, online: true, lastSeen: now() } : p))
      created = players.find((p) => p.id === existingById.id)
      return { patch: { players }, nextPlayerCount: players.length }
    }

    const key = nameKey(nameCheck.value)
    const sameName = room.players.find((p) => nameKey(p.name) === key)
    if (sameName) {
      // A refresh/reconnect: same person, same lobby slot.
      if (room.status !== ROOM_STATUS.LOBBY || sameName.online) {
        rejoined = true
        const players = room.players.map((p) => (p.id === sameName.id ? { ...p, online: true, lastSeen: now() } : p))
        created = players.find((p) => p.id === sameName.id)
        return { patch: { players }, nextPlayerCount: players.length }
      }
      fail('NAME_TAKEN', 'That name is already in this room.')
    }

    if (room.status !== ROOM_STATUS.LOBBY) fail('STARTED', 'This game has already started.')
    if (room.players.length >= 20) fail('FULL', 'Room is full')

    created = makePlayer({ name: nameCheck.value, isHost: false })
    const players = [...room.players, created]
    return { patch: { players }, nextPlayerCount: players.length }
  })

  if (!created) fail('NOT_FOUND', 'Could not join that room')
  return { room: result.room, player: created, rejoined }
}

/** Ready / unready (hosts are always ready). */
export async function setPlayerReady({ code, playerId, ready }) {
  const rpc = await callRpc('imposter_set_ready', { p_code: code, p_player_id: playerId, p_ready: Boolean(ready) })
  if (rpc.ok) return normalizeRoom(rpc.data?.room ?? rpc.data, { code })
  const result = await mutateRoom(code, (room) => {
    const players = room.players.map((p) => (p.id === playerId && !p.isHost ? { ...p, ready: Boolean(ready), lastSeen: now() } : p))
    return { patch: { players } }
  })
  return result.room
}

/** Leave the lobby. If the host leaves, the room is handed over or closed. */
export async function leaveRoom({ code, playerId }) {
  const rpc = await callRpc('imposter_leave_room', { p_code: code, p_player_id: playerId })
  if (rpc.ok) {
    /* The host leaving an empty room closes it: the row is already gone. */
    if (rpc.data?.closed || rpc.data?.room === null) return { room: null, closed: true }
    return { room: normalizeRoom(rpc.data?.room ?? rpc.data, { code }) }
  }

  const result = await mutateRoom(code, (room) => {
    const leaving = room.players.find((p) => p.id === playerId)
    const players = room.players.filter((p) => p.id !== playerId)
    if (!leaving) return { patch: { players }, nextPlayerCount: players.length }

    if (leaving.isHost) {
      if (!players.length) {
        /* The host walked out of an empty room: no row left behind to expire. */
        return { patch: { players: [] }, nextPlayerCount: 0, remove: true }
      }
      // Promote the longest-standing remaining player.
      const nextHost = players.slice().sort((a, b) => a.joinedAt - b.joinedAt)[0]
      const promoted = players.map((p) => (p.id === nextHost.id ? { ...p, isHost: true, ready: true } : p))
      return { patch: { players: promoted, hostId: nextHost.id }, nextPlayerCount: promoted.length }
    }
    return { patch: { players }, nextPlayerCount: players.length }
  })
  return { room: result.room, closed: Boolean(result.removed) }
}

/** Heartbeat so the lobby can flag dropped players. */
export async function pingPlayer({ code, playerId }) {
  const rpc = await callRpc('imposter_heartbeat', { p_code: code, p_player_id: playerId })
  if (rpc.ok) return true
  await mutateRoom(code, (room) => ({
    patch: { players: room.players.map((p) => (p.id === playerId ? { ...p, online: true, lastSeen: now() } : p)) },
  }))
  return true
}

/** Shallow-merge arbitrary public fields (config, phase, timers, …). */
export async function patchRoom({ code, patch, secrets, status, playerCount }) {
  const rpc = await callRpc('imposter_patch_room', { p_code: code, p_patch: { ...patch, updatedAt: now() } })
  if (rpc.ok) {
    const room = normalizeRoom(rpc.data?.room ?? rpc.data, { code })
    return { room }
  }
  return mutateRoom(code, () => ({
    patch,
    secrets,
    statusOverride: status,
    nextPlayerCount: playerCount,
  }))
}

/**
 * Host action: write the role/word payloads. Each player's payload is keyed by
 * their own id, so a client only ever has to read its own slice.
 */
export async function writeSecrets({ code, secrets, roomPatch = {}, status }) {
  const rpc = await callRpc('imposter_set_secrets', { p_code: code, p_secrets: secrets, p_patch: { ...roomPatch, updatedAt: now() } })
  if (rpc.ok) return { room: normalizeRoom(rpc.data?.room ?? rpc.data, { code }) }

  const result = await mutateRoom(code, (room) => ({
    patch: roomPatch,
    secrets,
    statusOverride: status,
  }))
  return result
}

/** Read just the secrets column for one player id. */
export async function fetchSecret({ code, playerId }) {
  const client = await requireClient()
  const { data, error } = await client.from(supabaseConfig.table).select('secrets,room').eq('code', code).maybeSingle()
  if (error) throw classifyError(error)
  if (!data) fail('NOT_FOUND', 'Room not found')
  const secrets = data.secrets && typeof data.secrets === 'object' ? data.secrets : {}
  return { secret: secrets[playerId] || null, room: normalizeRoom(data.room, { code }) }
}

/** Atomic vote + submitted tracking (upsert semantics, never overwrites others). */
export async function submitVote({ code, playerId, targetId, round }) {
  const rpc = await callRpc('imposter_submit_vote', {
    p_code: code,
    p_player_id: playerId,
    p_target_id: targetId,
    p_round: round,
  })
  if (rpc.ok) return { room: normalizeRoom(rpc.data?.room ?? rpc.data, { code }) }

  const result = await mutateRoom(code, (room) => {
    const game = room.game || {}
    if (game.round !== round) return { patch: {} }
    const votes = { ...(game.votes || {}), [playerId]: targetId }
    const submitted = Array.from(new Set([...(game.submitted || []), playerId]))
    return { patch: { game: { ...game, votes, submitted } } }
  })
  return { room: result.room }
}

/**
 * Close a room for good.
 *
 * A closed room has no future: the code is never reused, the secrets are dead
 * and every player has finished with it — so the row is DELETED rather than
 * flagged. That is what keeps the shared free project flat no matter how many
 * games are played: nothing accumulates.
 *
 * The RPC is tried first (it also tells any other client still watching the
 * row, via the realtime DELETE event). The plain delete is the fallback for a
 * project whose SQL has not been re-run yet, and it needs the table's delete
 * policy, which the current schema file grants.
 */
export async function terminateRoom(code) {
  const rpc = await callRpc('imposter_terminate_room', { p_code: code })
  if (rpc.ok) return true
  const client = await requireClient()
  const { error } = await client.from(supabaseConfig.table).delete().eq('code', code)
  if (error) throw classifyError(error)
  return true
}

/**
 * Housekeeping: remove rooms nobody has touched for the configured TTL, plus
 * any leftover 'terminated' rows from before closing deleted them.
 */
export async function sweepExpiredRooms() {
  const client = await requireClient()
  const stale = new Date(now() - supabaseConfig.roomTtlMinutes * 60_000).toISOString()
  const { error } = await client
    .from(supabaseConfig.table)
    .delete()
    .or(`status.eq.${ROOM_STATUS.TERMINATED},updated_at.lt.${stale}`)
  if (error) throw classifyError(error)
  return true
}

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Subscribe to a room's row changes.
 * @returns {() => void} unsubscribe
 */
export function subscribeToRoom(code, { onRoom, onStatus } = {}) {
  const client = getSupabase()
  if (!client) return () => {}

  const channel = client
    .channel(`imposter-room-${code}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: supabaseConfig.table, filter: `code=eq.${code}` },
      (payload) => {
        /*
         * Closing a room deletes its row, so a DELETE event is how everybody
         * else finds out the host has finished with it. (Old rows that were
         * only flagged 'terminated' are handled the same way.)
         */
        if (payload.eventType === 'DELETE') {
          onStatus?.('terminated')
          return
        }
        const row = payload.new
        if (!row) return
        if (row.status === ROOM_STATUS.TERMINATED) {
          onStatus?.('terminated')
          return
        }
        onRoom?.(normalizeRoom(row.room, { code: row.code, hostId: row.host_id, status: row.status }), row)
      },
    )
    .subscribe((status) => {
      onStatus?.(status) // SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR
    })

  return () => {
    try {
      client.removeChannel(channel)
    } catch {
      /* ignore */
    }
  }
}

/** One-shot connectivity probe used by the lobby banner. */
export async function pingBackend() {
  const client = getSupabase()
  if (!client) return false
  const { error } = await client.from(supabaseConfig.table).select('code', { count: 'exact', head: true }).limit(1)
  if (error) throw classifyError(error)
  return true
}

/* -------------------------------------------------------------------------- */
/* Optional: shared word synchronisation (admin feature)                       */
/* -------------------------------------------------------------------------- */

export async function fetchSharedWords() {
  const client = await requireClient()
  const { data, error } = await client.from(supabaseConfig.wordsTable).select('*')
  if (error) throw classifyError(error)
  return data || []
}

export async function pushSharedWords(payload) {
  const client = await requireClient()
  const { error } = await client.from(supabaseConfig.wordsTable).upsert({
    id: 'default',
    payload,
    updated_at: new Date().toISOString(),
  })
  if (error) throw classifyError(error)
  return true
}
