/**
 * useOnlineRoom — the client-side brain of online multiplayer.
 *
 * Sync model
 * ----------
 *  • The room row is the single source of truth; React state is only a mirror.
 *  • The HOST (or the longest-standing online player if the host dropped)
 *    performs derived transitions: reveal → briefing → clues → voting → result.
 *  • Everyone else performs only self-scoped writes (mark my card seen, submit
 *    my vote, advance my own clue turn).
 *  • Reconnection, refresh, host departure, duplicate names and expired rooms
 *    are all handled without losing the round.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ONLINE_PHASES, ROOM_STATUS, ROLES, STORAGE_KEYS } from '../data/constants.js'
import {
  createRoom as apiCreateRoom,
  fetchRoomRow,
  fetchSecret,
  applyBackendConfig,
  backendStatus,
  forgetBackendConfig,
  friendlyRoomError,
  isConfigured,
  refreshConfiguration,
  testBackendConfig,
  claimHost as apiClaimHost,
  joinRoom as apiJoinRoom,
  leaveRoom as apiLeaveRoom,
  removePlayer as apiRemovePlayer,
  patchRoom,
  pingPlayer,
  setPlayerReady,
  submitVote as apiSubmitVote,
  subscribeToRoom,
  terminateRoom,
  writeSecrets,
} from '../lib/onlineService.js'
import { assignOpeningRoles, assignRolesFor, isChaosMode, isChaosRound, scheduleNextChaosRound } from '../lib/gameEngine.js'
import { HOST_VANISH_MS, buildClueOrder, clueOrderFor, computeResult, isHostDriver, phaseView, publicResult, resolveGuess, revealProgress, settleWinner, turnPlayer, vanishSuccessor, voteProgress } from '../lib/onlineGame.js'
import { normalizeRoom } from '../lib/onlineService.js'
import { reloadRuntimeFile, subscribeToBackend } from '../lib/runtimeConfig.js'
import { readJSON, readSession, remove, removeSession, writeJSON, writeSession } from '../utils/storage.js'

/**
 * Reserved key inside the PRIVATE `secrets` map that holds the round's word.
 * It is never a player id, so it can never be dealt to a card; the host reads it
 * back to re-deal chaos roles without the word ever entering public room state.
 */
const SECRET_META_KEY = '__chaos_meta__'

const HEARTBEAT_MS = 15000
/** How often a room re-checks that its host is still breathing. */
const HOST_CHECK_MS = 15000

/*
 * THE SEAT MARKER (sessionStorage)
 * --------------------------------
 * The stored session (localStorage) is what lets a player reclaim their seat —
 * but on its own it must never drag anyone back into a room they did not ask
 * to be in. That is what the seat marker is for: it is written only when THIS
 * TAB deliberately creates, joins or reclaims a room, and it dies with the tab.
 * A brand-new visit, or a second player on the same device, therefore lands on
 * the setup screen with the last room offered as a choice — never as a
 * fait accompli. A refresh inside the room keeps the marker, so CONTINUE GAME
 * after a reload still walks straight back to the table.
 */
const readSeat = () => {
  const seat = readSession(STORAGE_KEYS.seat, null)
  return seat && typeof seat === 'object' ? seat : null
}
const seatMatches = (seat, session) => Boolean(seat?.code && session?.code && seat.code === session.code && seat.playerId === session.playerId)
/** While nothing is configured, how often to re-read the published file. */
const CONFIG_POLL_MS = 15000
/** How many recent words a replay must avoid before it may repeat one. */
const RECENT_WORDS = 5
const RECONNECT_DELAYS = [1200, 2400, 4800, 8000, 12000, 20000]

const emptySession = () => ({
  code: null,
  playerId: null,
  name: '',
  isHost: false,
  roles: null,
  deck: null,
})

/*
 * A promoted driver (the host went dark) has no role map — those live in the
 * host's session. The per-player secret entries hold every role, and any
 * device already fetches its own, so the driver can fetch the roster the same
 * way instead of stalling the tally. Returns null unless every seat answered.
 */
async function collectRolesFromSecrets(code, room) {
  const map = {}
  await Promise.all(
    (room.players || []).map(async (p) => {
      try {
        const { secret } = await fetchSecret({ code, playerId: p.id })
        if (secret?.role) map[p.id] = secret.role
      } catch {
        /* missing seat — handled by the caller */
      }
    }),
  )
  return Object.keys(map).length === (room.players || []).length ? map : null
}

export function useOnlineRoom(bank) {
  const [session, setSession] = useState(() => ({
    ...emptySession(),
    ...(readJSON(STORAGE_KEYS.session, {}) || {}),
  }))
  const [room, setRoom] = useState(null)
  const [secret, setSecret] = useState(null)
  const [connection, setConnection] = useState({
    state: 'idle',
    error: null,
    attempt: 0,
  })
  const [busy, setBusy] = useState(null) // 'creating' | 'joining' | 'starting' | ...

  const [seat, setSeat] = useState(() => readSeat())
  const [notice, setNotice] = useState(null)
  const seated = seatMatches(seat, session)

  const unsubscribeRef = useRef(null)
  const transitionLock = useRef(new Set())
  const sessionRef = useRef(session)
  sessionRef.current = session
  const seatRef = useRef(seat)
  seatRef.current = seat

  /** This tab is deliberately sitting at a table from now on. */
  /*
   * This tab is deliberately sitting at a table from now on. The room is also
   * noted as "last joined" — that note survives an explicit Leave, so the
   * setup screen can offer a one-tap way BACK to a room worth returning to.
   */
  const takeSeat = useCallback((next) => {
    const value = { code: next.code, playerId: next.playerId }
    writeSession(STORAGE_KEYS.seat, value)
    writeJSON(STORAGE_KEYS.lastRoom, { code: next.code, name: next.name || readJSON(STORAGE_KEYS.lastRoom, null)?.name || '' })
    setSeat(value)
  }, [])

  useEffect(() => {
    if (session.code) writeJSON(STORAGE_KEYS.session, session)
  }, [session])

  /* ------------------------------------------------------------------ */
  /* Session lifecycle                                                   */
  /* ------------------------------------------------------------------ */
  const clearSession = useCallback(() => {
    remove(STORAGE_KEYS.session)
    removeSession(STORAGE_KEYS.seat)
    setSeat(null)
    setSession(emptySession())
    setRoom(null)
    setSecret(null)
  }, [])

  /**
   * The room is the source of truth about who is at the table: the moment this
   * device is no longer on the roster (the host removed it), the seat is gone
   * and the player is told why instead of watching a table they left.
   */
  const applyRoom = useCallback(
    (next) => {
      setRoom(next)
      const me = sessionRef.current.playerId
      if (next && me && Array.isArray(next.players) && next.players.length && !next.players.some((p) => p.id === me) && next.status !== ROOM_STATUS.TERMINATED) {
        clearSession()
        setConnection({ state: 'idle', error: null, attempt: 0 })
        setNotice({
          id: Date.now(),
          tone: 'error',
          text: 'The host removed you from the room.',
        })
      }
      return next
    },
    [clearSession],
  )

  /* ------------------------------------------------------------------ */
  /* Backend configuration (runtime, no rebuild)                         */
  /* ------------------------------------------------------------------ */
  const [backend, setBackend] = useState(() => backendStatus())

  const recheckBackend = useCallback(async () => {
    await refreshConfiguration()
    const next = backendStatus()
    setBackend(next)
    return next.configured
  }, [])

  /**
   * "Check again" on the not-configured screen: re-reads the published
   * runtime-config.json from scratch (ignoring any cached copy) and applies it
   * immediately. This is how a device gets connected without pasting anything —
   * the values only have to exist in that one published file.
   */
  const recheckPublishedConfig = useCallback(async () => {
    await reloadRuntimeFile()
    const next = backendStatus()
    setBackend(next)
    return next.configured
  }, [])

  useEffect(() => {
    let alive = true
    refreshConfiguration()
      .then(() => {
        if (alive) setBackend(backendStatus())
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  /* Any configuration change — a save here, or the published file landing —
     refreshes the status everything else reads. */
  useEffect(() => subscribeToBackend(() => setBackend(backendStatus())), [])

  /**
   * Keep looking for the published file while this device is unconfigured.
   *
   * This is the fix for "it still asks for the key": the organiser publishes
   * runtime-config.json once, and any phone that is already sitting on the
   * waiting screen picks it up within seconds — without a reload and without
   * anyone pasting anything. Polling stops the moment it is connected.
   */
  useEffect(() => {
    if (backend.configured) return () => {}
    let cancelled = false
    const check = () => {
      reloadRuntimeFile()
        .then((ok) => {
          if (!cancelled && ok) setBackend(backendStatus())
        })
        .catch(() => {})
    }
    const id = setInterval(check, CONFIG_POLL_MS)
    const onWake = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [backend.configured])

  /**
   * The single entry point UI panels use: save or clear values, then re-derive
   * everything that depends on them (client, `configured` flag, status view).
   */
  const configureBackend = useCallback(
    async ({ action, value } = {}) => {
      let result
      if (action === 'clear') {
        await forgetBackendConfig()
        const next = await recheckBackend()
        return { ok: true, configured: next }
      }
      result = await applyBackendConfig(value || {})
      const next = await recheckBackend()
      return { ...result, configured: next }
    },
    [recheckBackend],
  )

  const refreshRoom = useCallback(
    async (code) => {
      const row = await fetchRoomRow(code)
      return applyRoom(
        normalizeRoom(row.room, {
          code: row.code,
          hostId: row.host_id,
          status: row.status,
        }),
      )
    },
    [applyRoom],
  )

  /* ------------------------------------------------------------------ */
  /* Create / join                                                       */
  /* ------------------------------------------------------------------ */
  const createRoom = useCallback(
    async (playerName, config, customCode = null) => {
      if (!isConfigured())
        return {
          ok: false,
          error: friendlyRoomError({ code: 'NOT_CONFIGURED' }),
        }
      setBusy('creating')
      setConnection({ state: 'connecting', error: null, attempt: 0 })
      try {
        const { room: created, player } = await apiCreateRoom({ playerName, config, customCode })
        const next = {
          code: created.code,
          playerId: player.id,
          name: player.name,
          isHost: true,
          roles: null,
          deck: { categoryLabel: created.config.categoryLabel },
        }
        setSession(next)
        takeSeat(next)
        setRoom(created)
        setNotice(null)
        setConnection({ state: 'connected', error: null, attempt: 0 })
        return { ok: true, code: created.code, room: created }
      } catch (error) {
        const message = friendlyRoomError(error)
        setConnection({ state: 'error', error: message, attempt: 0 })
        return { ok: false, error: message }
      } finally {
        setBusy(null)
      }
    },
    [takeSeat],
  )

  const joinRoom = useCallback(
    async (playerName, code) => {
      if (!isConfigured())
        return {
          ok: false,
          error: friendlyRoomError({ code: 'NOT_CONFIGURED' }),
        }
      setBusy('joining')
      setConnection({ state: 'connecting', error: null, attempt: 0 })
      try {
        const previous = sessionRef.current
        const reuseId = previous.code === code && previous.name?.toLowerCase() === playerName.trim().toLowerCase() ? previous.playerId : null
        const { room: joined, player, rejoined } = await apiJoinRoom({ playerName, code, existingPlayerId: reuseId })
        const next = {
          code: joined.code,
          playerId: player.id,
          name: player.name,
          isHost: Boolean(player.isHost),
          roles: previous.code === joined.code ? previous.roles : null,
          deck: previous.code === joined.code ? previous.deck : null,
        }
        setSession(next)
        takeSeat(next)
        setRoom(joined)
        setNotice(null)
        setConnection({ state: 'connected', error: null, attempt: 0 })
        return { ok: true, room: joined, rejoined }
      } catch (error) {
        const message = error?.code === 'NAME_TAKEN' ? 'That name is already in this room. Try another one.' : friendlyRoomError(error)
        setConnection({ state: 'error', error: message, attempt: 0 })
        return { ok: false, error: message }
      } finally {
        setBusy(null)
      }
    },
    [takeSeat],
  )

  /**
   * Walk away WITHOUT surrendering the seat. Used when the game is already
   * over: the player keeps their name on the finished table, so "rejoin my
   * last room" (same name, same code) walks them straight back to the result
   * screen — the "get back to the room" option that was missing. A leave in
   * the middle of a game still gives the seat up, because the table must not
   * wait for someone who walked.
   */
  const detach = useCallback(async () => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    clearSession()
    setConnection({ state: 'idle', error: null, attempt: 0 })
  }, [clearSession])

  const leave = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (code && playerId) {
      try {
        await apiLeaveRoom({ code, playerId })
      } catch {
        /* leaving is best-effort — never block the user on the network */
      }
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    clearSession()
    setConnection({ state: 'idle', error: null, attempt: 0 })
  }, [clearSession])

  /* ------------------------------------------------------------------ */
  /* Realtime subscription + reconnect                                    */
  /* ------------------------------------------------------------------ */
  const subscribe = useCallback((code) => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = subscribeToRoom(code, {
      onRoom: (next) => {
        setRoom((current) => {
          // Ignore out-of-order payloads from the previous version.
          if (current && next.updatedAt < (current.updatedAt || 0) && next.status !== ROOM_STATUS.TERMINATED) return current
          return next
        })
        setConnection((c) => (c.state === 'connected' && !c.error ? c : { state: 'connected', error: null, attempt: 0 }))
      },
      onStatus: (status) => {
        if (status === 'terminated') {
          setConnection({
            state: 'terminated',
            error: 'The host closed this room.',
            attempt: 0,
          })
          return
        }
        if (status === 'SUBSCRIBED') {
          setConnection({ state: 'connected', error: null, attempt: 0 })
          return
        }
        if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
          setConnection((c) => ({
            state: 'reconnecting',
            error: null,
            attempt: (c.attempt || 0) + 1,
          }))
        }
      },
    })
  }, [])

  /* Attach / detach the subscription whenever the room code changes. */
  useEffect(() => {
    if (!session.code || !seated || !isConfigured()) return () => {}
    subscribe(session.code)
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [session.code, seated, subscribe])

  /* On mount with a stored session (page refresh / deep link), pull the room
     once so the UI has data before realtime events start arriving. */
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !session.code || !seated || !isConfigured()) return
    resumed.current = true
    refreshRoom(session.code)
      .then((next) => {
        if (!next) return
        const stillIn = next.players.some((p) => p.id === session.playerId)
        if (!stillIn) {
          setConnection({
            state: 'error',
            error: 'You are no longer in that room. It may have been closed.',
            attempt: 0,
          })
          clearSession()
        }
      })
      .catch((error) => {
        setConnection({
          state: 'error',
          error: friendlyRoomError(error),
          attempt: 0,
        })
      })
  }, [session.code, session.playerId, seated, refreshRoom, clearSession])

  /* Retry loop with backoff while reconnecting. */
  useEffect(() => {
    if (connection.state !== 'reconnecting' || !session.code) return () => {}
    const delay = RECONNECT_DELAYS[Math.min(connection.attempt, RECONNECT_DELAYS.length - 1)]
    const timer = setTimeout(async () => {
      try {
        await refreshRoom(session.code)
        subscribe(session.code)
        setConnection((c) => (c.state === 'reconnecting' ? { state: 'connected', error: null, attempt: 0 } : c))
      } catch (error) {
        if (error?.code === 'NOT_FOUND' || error?.code === 'EXPIRED' || error?.code === 'TERMINATED') {
          setConnection({
            state: 'error',
            error: friendlyRoomError(error),
            attempt: 0,
          })
        } else {
          setConnection((c) => ({
            state: 'reconnecting',
            error: null,
            attempt: (c.attempt || 0) + 1,
          }))
        }
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [connection.state, connection.attempt, session.code, refreshRoom, subscribe])

  /* Browser connectivity signals. */
  useEffect(() => {
    const goOnline = () => {
      if (sessionRef.current.code) setConnection((c) => ({ ...c, state: 'reconnecting', attempt: 0 }))
    }
    const goOffline = () => setConnection((c) => (sessionRef.current.code ? { ...c, state: 'offline' } : c))
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sessionRef.current.code) {
        refreshRoom(sessionRef.current.code).catch(() => setConnection((c) => ({ ...c, state: 'reconnecting' })))
      }
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshRoom])

  /* Heartbeat so the lobby can flag dropped players. */
  useEffect(() => {
    if (!session.code || !session.playerId || !seated || !isConfigured()) return () => {}
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      pingPlayer({ code: session.code, playerId: session.playerId }).catch(() => {})
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [session.code, session.playerId, seated])

  /*
   * THE HOST RESCUE.
   * A room is driven by its host, so a host whose phone died used to stop the
   * table dead ("Waiting for the host…", forever). Every room tick checks who
   * should own the room when the host has gone quiet (vanishSuccessor — only
   * an online, longer-standing player) and that player claims it. The claim
   * runs through the service, which refuses it if the host is actually still
   * answering heartbeats, so two devices can never both win.
   */
  const lastClaimAt = useRef(0)
  useEffect(() => {
    if (!seated || !room || !session.playerId) return
    const successor = vanishSuccessor(room)
    if (!successor || successor !== session.playerId) return
    if (Date.now() - lastClaimAt.current < 20000) return
    lastClaimAt.current = Date.now()
    apiClaimHost({ code: room.code, playerId: session.playerId })
      .then(({ room: updated }) => {
        if (!updated) return
        applyRoom(updated)
        if (updated.hostId === session.playerId) {
          setNotice({
            id: Date.now(),
            tone: 'success',
            text: 'The host went quiet — you are driving this room now.',
          })
        }
      })
      .catch(() => {})
  }, [seated, room, session.playerId, applyRoom])

  /* A notice reads once and then steps out of the way. */
  useEffect(() => {
    if (!notice) return () => {}
    const id = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(id)
  }, [notice])

  /* Fetch my own secret whenever the room (or my identity) changes. */
  const needsSecret = Boolean(session.code && session.playerId && room?.game)
  useEffect(() => {
    if (!needsSecret) return () => {}
    let cancelled = false
    fetchSecret({ code: session.code, playerId: session.playerId })
      .then(({ secret: payload }) => {
        if (!cancelled) setSecret(payload || null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needsSecret, session.code, session.playerId, room?.game?.round, room?.game?.phase])

  /* ------------------------------------------------------------------ */
  /* Self-scoped actions                                                 */
  /* ------------------------------------------------------------------ */
  const setReady = useCallback(
    async (ready) => {
      const { code, playerId } = sessionRef.current
      if (!code || !playerId) return
      setRoom((current) => {
        if (!current) return current
        return {
          ...current,
          players: current.players.map((p) => (p.id === playerId ? { ...p, ready, isHost: p.isHost } : p)),
        }
      })
      try {
        const updated = await setPlayerReady({ code, playerId, ready })
        if (updated) applyRoom(updated)
      } catch (error) {
        setConnection((c) => ({ ...c, error: friendlyRoomError(error) }))
      }
    },
    [applyRoom],
  )

  /** Mark my own secret card as seen (atomic per player). */
  const markCardSeen = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !playerId || !room?.game) return
    const seen = Array.from(new Set([...(room.game.revealedBy || []), playerId]))
    try {
      const { room: updated } = await patchRoom({
        code,
        patch: { game: { ...room.game, revealedBy: seen } },
      })
      if (updated) applyRoom(updated)
    } catch (error) {
      setConnection((c) => ({ ...c, error: friendlyRoomError(error) }))
    }
  }, [room, applyRoom])

  const startTimer = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code || !room?.game) return
    const duration = room.config.turnSeconds
    await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          timer: { running: true, duration, startedAt: Date.now() },
        },
      },
    }).then(({ room: updated }) => updated && applyRoom(updated))
  }, [room, applyRoom])

  const stopTimer = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code || !room?.game) return
    await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          timer: {
            running: false,
            duration: room.config.turnSeconds,
            startedAt: null,
          },
        },
      },
    }).then(({ room: updated }) => updated && applyRoom(updated))
  }, [room, applyRoom])

  /** Current turn player (or the host driver) advances to the next clue. */
  const nextClue = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code || !room?.game) return
    const order = (room.game.clueOrder || []).filter((id) => !(room.game.eliminated || []).includes(id))
    const nextIndex = (room.game.clueIndex || 0) + 1
    if (nextIndex >= order.length) {
      await patchRoom({
        code,
        patch: {
          game: {
            ...room.game,
            phase: ONLINE_PHASES.VOTING,
            timer: {
              running: false,
              duration: room.config.turnSeconds,
              startedAt: null,
            },
          },
        },
      }).then(({ room: updated }) => updated && applyRoom(updated))
      return
    }
    await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          clueIndex: nextIndex,
          turnPlayerId: order[nextIndex],
          timer: {
            running: false,
            duration: room.config.turnSeconds,
            startedAt: null,
          },
        },
      },
    }).then(({ room: updated }) => updated && applyRoom(updated))
  }, [room, applyRoom])

  const submitVote = useCallback(
    async (targetId) => {
      const { code, playerId } = sessionRef.current
      if (!code || !playerId || !room?.game) return { ok: false, error: 'Not connected.' }
      const alive = room.players.filter((p) => !(room.game.eliminated || []).includes(p.id))
      if (!alive.some((p) => p.id === playerId)) return { ok: false, error: 'Eliminated players cannot vote.' }
      if (targetId === playerId) return { ok: false, error: 'You cannot vote for yourself.' }
      // Optimistic local mirror — keeps the UI instant while the write flies.
      applyRoom({
        ...room,
        game: {
          ...room.game,
          votes: { ...(room.game.votes || {}), [playerId]: targetId },
        },
      })
      try {
        const { room: updated } = await apiSubmitVote({
          code,
          playerId,
          targetId,
          round: room.game.round,
        })
        if (updated) applyRoom(updated)
        return { ok: true }
      } catch (error) {
        const message = friendlyRoomError(error)
        setConnection((c) => ({ ...c, error: message }))
        return { ok: false, error: message }
      }
    },
    [room, applyRoom],
  )

  /* ------------------------------------------------------------------ */
  /* Host-only transitions                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Words this room has recently played, oldest first.
   *
   * Kept in the private `__chaos_meta__` entry beside the round's word, so it
   * survives the host refreshing mid-game — and it is never part of public
   * room state, so it can never leak the current word to a player.
   */
  const recallRecentWords = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code) return []
    try {
      const { secret } = await fetchSecret({ code, playerId: SECRET_META_KEY })
      const recent = Array.isArray(secret?.recent) ? secret.recent.filter((w) => typeof w === 'string') : []
      // A room played before this version still knows its last word.
      if (secret?.word && !recent.includes(secret.word)) recent.push(secret.word)
      return recent.slice(-RECENT_WORDS)
    } catch {
      return []
    }
  }, [])

  const startGame = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room) return { ok: false, error: 'Not connected.' }
    const lobby = room.players
    if (lobby.length < 3)
      return {
        ok: false,
        error: 'Online rooms need at least 3 players. You have ' + lobby.length + '.',
      }
    const notReady = lobby.filter((p) => !p.isHost && !p.ready)
    if (notReady.length)
      return {
        ok: false,
        error: `${notReady.map((p) => p.name).join(', ')} ${notReady.length > 1 ? 'are' : 'is'} not ready yet.`,
      }

    setBusy('starting')
    try {
      const recent = await recallRecentWords()
      const picked = bank?.pick
        ? bank.pick({
            categoryIds: room.config.categoryIds,
            difficulty: room.config.difficulty,
            exclude: recent,
          })
        : {
            word: 'Mystery',
            categoryName: 'Random',
            difficulty: 'medium',
            decoy: null,
          }

      /* Round one is the ordinary deal in both modes — see assignOpeningRoles. */
      const { roles } = assignOpeningRoles(room.config, lobby.length)
      const roleMap = {}
      lobby.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })

      const secrets = {}
      secrets[SECRET_META_KEY] = {
        word: picked.word,
        decoy: picked.decoy || null,
        categoryName: picked.categoryName,
        difficulty: picked.difficulty,
        recent: [...recent, picked.word].slice(-RECENT_WORDS),
      }
      lobby.forEach((p) => {
        secrets[p.id] = {
          role: roleMap[p.id],
          word: roleMap[p.id] === ROLES.IMPOSTER ? null : picked.word,
          decoy: roleMap[p.id] === ROLES.IMPOSTER ? picked.decoy || null : null,
          categoryName: picked.categoryName,
          difficulty: picked.difficulty,
        }
      })

      const aliveIds = lobby.map((p) => p.id)
      const game = {
        round: 1,
        phase: ONLINE_PHASES.REVEAL,
        revealIndex: 0,
        revealedBy: [],
        clueOrder: buildClueOrder(aliveIds),
        clueIndex: 0,
        turnPlayerId: null,
        timer: {
          running: false,
          duration: room.config.turnSeconds,
          startedAt: null,
        },
        votes: {},
        submitted: [],
        lastResult: null,
        winner: null,
        history: [],
        eliminated: [],
        deck: {
          categoryLabel: picked.categoryName,
          difficulty: picked.difficulty,
        },
        /* Round one is an ordinary round; the first chaos event lands 3-5 rounds in. */
        chaosRound: false,
        nextChaosRound: isChaosMode(room.config) ? scheduleNextChaosRound(1) : null,
        noImposterRound: false,
      }

      const { room: updated } = await writeSecrets({
        code,
        secrets,
        roomPatch: { game, status: ROOM_STATUS.PLAYING },
        status: ROOM_STATUS.PLAYING,
      })
      const nextSession = {
        ...sessionRef.current,
        roles: roleMap,
        deck: game.deck,
        isHost: true,
      }
      setSession(nextSession)
      writeJSON(STORAGE_KEYS.session, nextSession)
      if (updated) applyRoom(updated)
      return { ok: true }
    } catch (error) {
      const message = friendlyRoomError(error)
      return { ok: false, error: message }
    } finally {
      setBusy(null)
    }
  }, [room, bank, applyRoom, recallRecentWords])

  /** Host: recompute the round outcome and publish it. */
  const publishResult = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code || !room?.game) return
    let { roles } = sessionRef.current
    /* A promoted driver (the host vanished mid-round) holds no role map; the
       per-player secret entries do. Fetch once, cache in the session. */
    if (!roles || !Object.keys(roles).length) {
      const fetched = await collectRolesFromSecrets(code, room).catch(() => null)
      if (fetched) {
        roles = fetched
        const nextSession = { ...sessionRef.current, roles }
        setSession(nextSession)
        writeJSON(STORAGE_KEYS.session, nextSession)
      }
    }
    const result = computeResult(room, roles || {})
    const gameOver = Boolean(result.winner)

    /*
     * A caught imposter is never settled by the vote itself. The room pauses on
     * the guess screen so that player — and only that player — can name the
     * crew's word. The host judges it in `publishGuess` below.
     */
    if (result.needsGuess) {
      const patch = {
        game: {
          ...room.game,
          phase: ONLINE_PHASES.GUESS,
          pendingGuess: {
            playerId: result.eliminatedId,
            name: result.eliminatedName,
          },
          guess: null,
          /* No role travels in the room document — see publicResult(). */
          lastResult: { ...publicResult(result), winner: null },
          winner: null,
          eliminated: [...(room.game.eliminated || []), result.eliminatedId],
          history: [...(room.game.history || []), { ...publicResult(result), winner: null }],
          timer: {
            running: false,
            duration: room.config.turnSeconds,
            startedAt: null,
          },
        },
      }
      const { room: updated } = await patchRoom({ code, patch })
      if (updated) applyRoom(updated)
      return
    }
    const revealedRoles = gameOver ? Object.fromEntries(room.players.map((p) => [p.id, roles?.[p.id] || ROLES.CREW])) : null
    const patch = {
      game: {
        ...room.game,
        phase: ONLINE_PHASES.RESULT,
        lastResult: publicResult(result),
        winner: result.winner,
        revealedRoles,
        history: [...(room.game.history || []), publicResult(result)],
        eliminated: result.eliminatedId ? [...(room.game.eliminated || []), result.eliminatedId] : room.game.eliminated || [],
        timer: {
          running: false,
          duration: room.config.turnSeconds,
          startedAt: null,
        },
      },
      status: result.winner ? ROOM_STATUS.ENDED : room.status,
    }
    const { room: updated } = await patchRoom({
      code,
      patch,
      status: patch.status,
    })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

  /** The accused player: name the crew's word. Anyone else is refused. */
  const submitGuess = useCallback(
    async (text) => {
      const { code, playerId } = sessionRef.current
      const value = String(text || '').trim()
      if (!code || !room?.game || !value) return { ok: false, error: 'Type the word first.' }
      if (room.game.phase !== ONLINE_PHASES.GUESS) return { ok: false, error: 'No guess is being taken.' }
      if (room.game.pendingGuess?.playerId !== playerId) return { ok: false, error: 'Only the voted-out player guesses.' }

      const { room: updated } = await patchRoom({
        code,
        patch: {
          game: {
            ...room.game,
            guess: { playerId, text: value, at: Date.now() },
          },
        },
      })
      if (updated) applyRoom(updated)
      return { ok: true }
    },
    [room, applyRoom],
  )

  /**
   * Host: judge the guess against the round's private word. The word is read
   * from the reserved entry in the secrets column — never from public state —
   * so a curious player reading the room row learns nothing.
   */
  const publishGuess = useCallback(async () => {
    const { code, roles, playerId } = sessionRef.current
    if (!code || !room?.game) return
    const pending = room.game.guess
    if (!pending || !room.game.pendingGuess) return
    if (!isHostDriver(room, playerId)) return

    const meta = await fetchSecret({ code, playerId: SECRET_META_KEY })
      .then(({ secret: payload }) => payload || null)
      .catch(() => null)
    const judged = resolveGuess({
      guess: pending.text,
      word: meta?.word || null,
    })

    const roles_ = roles || {}
    /*
     * A wrong (or waived) guess does not just remove the accused — the roster
     * decides the game right there. If this was the last imposter, the crew has
     * won and the room must say so instead of dealing a wordless round.
     */
    const verdict = judged.correct
      ? {
          team: 'imposter',
          reason: 'The caught imposter named the secret word — the imposters take the game.',
        }
      : settleWinner(room, roles_)
    const gameOver = Boolean(verdict?.team)
    const patch = {
      game: {
        ...room.game,
        phase: ONLINE_PHASES.RESULT,
        pendingGuess: null,
        winner: verdict?.team || null,
        lastResult: {
          ...(room.game.lastResult || {}),
          winner: verdict?.team || null,
          reason: verdict?.reason || room.game.lastResult?.reason || '',
          guess: judged.correct ? 'correct' : 'wrong',
          guessText: pending.text,
        },
        revealedRoles: gameOver ? Object.fromEntries(room.players.map((p) => [p.id, roles_[p.id] || ROLES.CREW])) : room.game.revealedRoles || null,
        timer: {
          running: false,
          duration: room.config.turnSeconds,
          startedAt: null,
        },
      },
      status: gameOver ? ROOM_STATUS.ENDED : room.status,
    }
    const { room: updated } = await patchRoom({
      code,
      patch,
      status: patch.status,
    })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

  /* Host: judge the guess as soon as it lands in the room. */
  useEffect(() => {
    if (!room?.game) return
    if (room.game.phase !== ONLINE_PHASES.GUESS) return
    if (!room.game.guess) return
    if (!isHostDriver(room, sessionRef.current.playerId)) return
    publishGuess()
  }, [room, publishGuess])

  /** Host: begin the clue phase (after everyone has seen their card). */
  const beginClues = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room?.game) return
    if (!isHostDriver(room, playerId)) return
    const aliveIds = room.players.filter((p) => !(room.game.eliminated || []).includes(p.id)).map((p) => p.id)
    const order = buildClueOrder(aliveIds)
    const { room: updated } = await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          phase: ONLINE_PHASES.CLUES,
          clueOrder: order,
          clueIndex: 0,
          turnPlayerId: order[0],
          timer: {
            running: false,
            duration: room.config.turnSeconds,
            startedAt: null,
          },
        },
      },
    })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

  const nextRound = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room?.game) return
    if (!isHostDriver(room, playerId)) return
    const aliveIds = room.players.filter((p) => !(room.game.eliminated || []).includes(p.id)).map((p) => p.id)

    const round = (room.game.round || 1) + 1
    /*
     * Chaos is an event, not a state: the room re-rolls only on its scheduled
     * chaos rounds, exactly like the pass-&-play engine. In between, the base
     * assignment stands — except after a chaos round that dealt nobody an
     * imposter, which hands the configured count back so the game can be won.
     */
    const chaosNow = isChaosRound({ config: room.config, nextChaosRound: room.game.nextChaosRound }, round)
    const restoresBase = !chaosNow && Boolean(room.game.noImposterRound)

    /*
     * Cards are only handed round again when the deal actually changed — a
     * chaos re-roll, or the round that restores the base assignment after one.
     * Every other round opens straight into the briefing: the table already
     * knows its roles and the word.
     */
    const redeal = chaosNow || restoresBase

    const advance = {
      ...room.game,
      round,
      phase: redeal ? ONLINE_PHASES.REVEAL : ONLINE_PHASES.BRIEFING,
      revealedBy: [],
      clueOrder: buildClueOrder(aliveIds),
      clueIndex: 0,
      turnPlayerId: null,
      votes: {},
      submitted: [],
      lastResult: null,
      chaosRound: chaosNow,
      nextChaosRound: chaosNow ? scheduleNextChaosRound(round) : room.game.nextChaosRound,
      noImposterRound: false,
      timer: {
        running: false,
        duration: room.config.turnSeconds,
        startedAt: null,
      },
    }

    /* A chaos round re-rolls roles for every player still in play — the previous
       assignment is never reused. Eliminated players keep the role they were
       judged on so the end-of-game reveal stays truthful. */
    if ((chaosNow || restoresBase) && aliveIds.length) {
      // One small read of the reserved entry — never the whole private map.
      const meta = await fetchSecret({ code, playerId: SECRET_META_KEY })
        .then(({ secret: payload }) => payload || null)
        .catch(() => null)
      const word = meta?.word || null

      // Without the round's word a rewritten deal would leave the crew
      // wordless, so keep the existing assignment rather than break the round.
      if (word) {
        const { roles } = chaosNow ? assignRolesFor(room.config, aliveIds.length) : assignRolesFor({ ...room.config, mode: 'normal' }, aliveIds.length)
        /* A chaos round can legitimately deal nobody the card; the room says so
           and the next ordinary round puts the configured count back. */
        const dealtNobody = roles.every((role) => role !== ROLES.IMPOSTER)
        const nextSecrets = {}
        aliveIds.forEach((id, index) => {
          const role = roles[index]
          nextSecrets[id] = {
            role,
            word: role === ROLES.IMPOSTER ? null : word,
            decoy: role === ROLES.IMPOSTER ? meta?.decoy || null : null,
            categoryName: meta?.categoryName || null,
            difficulty: meta?.difficulty || null,
          }
        })
        nextSecrets[SECRET_META_KEY] = meta

        const { room: updated } = await writeSecrets({
          code,
          secrets: nextSecrets,
          roomPatch: { game: { ...advance, noImposterRound: dealtNobody } },
        })
        /* The deal changed — the driver's local role map must change with it,
           or the next tally would judge the round on last round's roles. */
        const freshRoles = { ...(sessionRef.current.roles || {}) }
        aliveIds.forEach((id, index) => {
          freshRoles[id] = roles[index]
        })
        const nextSession = { ...sessionRef.current, roles: freshRoles }
        setSession(nextSession)
        writeJSON(STORAGE_KEYS.session, nextSession)
        if (updated) applyRoom(updated)
        return
      }
    }

    const { room: updated } = await patchRoom({
      code,
      patch: { game: advance },
    })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

  /** Host: same crew, fresh roles and a fresh word. */
  const playAgain = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room) return { ok: false, error: 'Not connected.' }
    if (!isHostDriver(room, playerId)) return { ok: false, error: 'Only the host can restart the room.' }
    setBusy('starting')
    try {
      /* Same table, brand-new word: the last few are excluded so "Play again"
         can never quietly hand back the word everyone just played. */
      const recent = await recallRecentWords()
      const picked = bank?.pick
        ? bank.pick({
            categoryIds: room.config.categoryIds,
            difficulty: room.config.difficulty,
            exclude: recent,
          })
        : { word: 'Mystery' }
      const { roles } = assignRolesFor(room.config, room.players.length)
      const roleMap = {}
      room.players.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })
      const secrets = {}
      secrets[SECRET_META_KEY] = {
        word: picked.word,
        decoy: picked.decoy || null,
        categoryName: picked.categoryName,
        difficulty: picked.difficulty,
        recent: [...recent, picked.word].slice(-RECENT_WORDS),
      }
      room.players.forEach((p) => {
        secrets[p.id] = {
          role: roleMap[p.id],
          word: roleMap[p.id] === ROLES.IMPOSTER ? null : picked.word,
          decoy: roleMap[p.id] === ROLES.IMPOSTER ? picked.decoy || null : null,
          categoryName: picked.categoryName,
          difficulty: picked.difficulty,
        }
      })
      const game = {
        round: 1,
        phase: ONLINE_PHASES.REVEAL,
        revealIndex: 0,
        revealedBy: [],
        clueOrder: buildClueOrder(room.players.map((p) => p.id)),
        clueIndex: 0,
        turnPlayerId: null,
        timer: {
          running: false,
          duration: room.config.turnSeconds,
          startedAt: null,
        },
        votes: {},
        submitted: [],
        lastResult: null,
        winner: null,
        history: [],
        eliminated: [],
        deck: {
          categoryLabel: picked.categoryName,
          difficulty: picked.difficulty,
        },
        /* A fresh game means a fresh chaos clock, and an ordinary opening round. */
        chaosRound: false,
        nextChaosRound: isChaosMode(room.config) ? scheduleNextChaosRound(1) : null,
        noImposterRound: false,
      }
      const { room: updated } = await writeSecrets({
        code,
        secrets,
        roomPatch: { game, status: ROOM_STATUS.PLAYING },
        status: ROOM_STATUS.PLAYING,
      })
      const nextSession = { ...sessionRef.current, roles: roleMap }
      setSession(nextSession)
      writeJSON(STORAGE_KEYS.session, nextSession)
      setSecret(secrets[playerId] || null)
      if (updated) applyRoom(updated)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: friendlyRoomError(error) }
    } finally {
      setBusy(null)
    }
  }, [room, bank, applyRoom, recallRecentWords])

  /* ------------------------------------------------------------------ */
  /* No-show escape hatches — host (or the driver the room fell to) only  */
  /* ------------------------------------------------------------------ */

  /** Open the round even though somebody never flipped their card. */
  const forceOpenRound = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room?.game) return
    if (!isHostDriver(room, playerId)) return
    if (room.game.phase !== ONLINE_PHASES.REVEAL) return
    const { room: updated } = await patchRoom({
      code,
      patch: { game: { ...room.game, phase: ONLINE_PHASES.BRIEFING } },
    })
    if (updated) applyRoom(updated)
    setNotice({
      id: Date.now(),
      tone: 'success',
      text: 'The round is open — the phones that never reported in were skipped.',
    })
  }, [room, applyRoom])

  /** Close the ballot with whatever votes landed; missing ones are not counted. */
  const forceTally = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room?.game) return
    if (!isHostDriver(room, playerId)) return
    if (room.game.phase !== ONLINE_PHASES.VOTING) return
    const key = `vote:${room.game.round}`
    if (!transitionLock.current.has(key)) {
      transitionLock.current.add(key)
      setTimeout(() => transitionLock.current.delete(key), 20000)
    }
    await publishResult()
    setNotice({
      id: Date.now(),
      tone: 'success',
      text: 'Voting closed with the ballots in hand.',
    })
  }, [room, publishResult])

  /** The accused is gone: wave their one guess through (counts as a miss). */
  const waiveGuess = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room?.game) return
    if (!isHostDriver(room, playerId)) return
    const pending = room.game.pendingGuess
    if (!pending || room.game.guess) return
    const { room: updated } = await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          guess: {
            playerId: pending.playerId,
            text: '(no guess — phone offline)',
            at: Date.now(),
            waived: true,
          },
        },
      },
    })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

  /** Remove a player who is not coming back; the round re-derives around them. */
  const removePlayer = useCallback(
    async (targetId) => {
      const { code, playerId } = sessionRef.current
      if (!code || !room) return { ok: false, error: 'Not connected.' }
      if (!isHostDriver(room, playerId)) return { ok: false, error: 'Only the host can remove a player.' }
      if (targetId === playerId)
        return {
          ok: false,
          error: 'You cannot remove yourself — use Leave room.',
        }
      const name = room.players.find((p) => p.id === targetId)?.name || 'Player'
      try {
        const { room: updated, removed } = await apiRemovePlayer({
          code,
          playerId: targetId,
        })
        if (removed || !updated) clearSession()
        else applyRoom(updated)
        setNotice({
          id: Date.now(),
          tone: 'success',
          text: `${name} was removed — the table can carry on.`,
        })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: friendlyRoomError(error) }
      }
    },
    [room, applyRoom, clearSession],
  )

  const dismissNotice = useCallback(() => setNotice(null), [])

  const closeRoom = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code) return
    try {
      await terminateRoom(code)
    } catch {
      /* best effort */
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    clearSession()
  }, [clearSession])

  /** Host: tweak the room configuration from the lobby. */
  const updateConfig = useCallback(
    async (patch) => {
      const { code, playerId } = sessionRef.current
      if (!code || !room) return { ok: false, error: 'Not connected.' }
      if (!isHostDriver(room, playerId)) return { ok: false, error: 'Only the host can change the setup.' }
      const nextConfig = { ...room.config, ...patch }
      const { room: updated } = await patchRoom({
        code,
        patch: { config: nextConfig },
      })
      if (updated) applyRoom(updated)
      return { ok: true }
    },
    [room, applyRoom],
  )

  /* ------------------------------------------------------------------ */
  /* Automatic host-driven transitions                                    */
  /* ------------------------------------------------------------------ */
  const roomRef = useRef(room)
  roomRef.current = room
  const meId = session.playerId

  useEffect(() => {
    if (!room?.game || !meId) return
    const driver = isHostDriver(room, meId)
    if (!driver) return
    const game = room.game

    // Everyone has seen their secret → open the briefing.
    if (game.phase === ONLINE_PHASES.REVEAL) {
      const progress = revealProgress(room)
      const key = `reveal:${game.round}`
      if (progress.complete && !transitionLock.current.has(key)) {
        transitionLock.current.add(key)
        patchRoom({
          code: room.code,
          patch: { game: { ...game, phase: ONLINE_PHASES.BRIEFING } },
        })
          .then(({ room: updated }) => updated && applyRoom(updated))
          .catch(() => transitionLock.current.delete(key))
      }
    }

    // All votes in → publish the result.
    if (game.phase === ONLINE_PHASES.VOTING) {
      const progress = voteProgress(room)
      const key = `vote:${game.round}`
      if (progress.complete && !transitionLock.current.has(key)) {
        transitionLock.current.add(key)
        publishResult().catch(() => transitionLock.current.delete(key))
      }
    }
  }, [room, meId, applyRoom, publishResult])

  /* Any client stops a finished shared timer (idempotent write). */
  const stopGuard = useRef(new Set())
  const [clock, setClock] = useState(() => Date.now())
  const sharedTimerRunning = Boolean(room?.game?.timer?.running && room?.game?.timer?.startedAt)

  useEffect(() => {
    if (!sharedTimerRunning) return () => {}
    setClock(Date.now())
    const id = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(id)
  }, [sharedTimerRunning, room?.game?.timer?.startedAt])

  const remaining = useMemo(() => {
    const timer = room?.game?.timer
    if (!timer?.running || !timer.startedAt) return null
    return Math.max(0, (timer.duration ?? 0) - (clock - timer.startedAt) / 1000)
  }, [room?.game?.timer, clock])

  useEffect(() => {
    if (remaining === null || !room?.game || remaining > 0) return
    const key = `timer:${room.game.round}:${room.game.clueIndex}`
    if (stopGuard.current.has(key)) return
    stopGuard.current.add(key)
    const turn = turnPlayer(room)
    if (turn?.id === meId || isHostDriver(room, meId)) {
      patchRoom({
        code: room.code,
        patch: {
          game: {
            ...room.game,
            timer: {
              running: false,
              duration: room.config.turnSeconds,
              startedAt: null,
            },
          },
        },
      })
        .then(({ room: updated }) => updated && applyRoom(updated))
        .catch(() => stopGuard.current.delete(key))
    }
  }, [remaining, room, meId, applyRoom])

  /* ------------------------------------------------------------------ */
  /* Derived client view                                                 */
  /* ------------------------------------------------------------------ */
  const view = useMemo(() => {
    if (!room) return null
    const base = phaseView(room, session.playerId, secret)
    const me = room.players.find((p) => p.id === session.playerId) || null
    const isHost = Boolean(me?.isHost || room.hostId === session.playerId)
    return {
      ...base,
      me,
      isHost,
      isDriver: isHostDriver(room, session.playerId),
      lobbyReady: room.players.length > 0 && room.players.every((p) => p.isHost || p.ready),
      myRole: secret?.role || session.roles?.[session.playerId] || null,
    }
  }, [room, secret, session.playerId, session.roles])

  /* The seat rule for the screens above: this tab is "in" a room only when it
     deliberately took the seat AND the room came back. A stale session in
     storage can never pull a new visitor into somebody's game by itself. */
  const isInRoom = Boolean(room && session.code && seated)

  return {
    configured: backend.configured,
    backend,
    session,
    seated,
    notice,
    dismissNotice,
    room,
    secret,
    view,
    connection,
    busy,
    isInRoom,
    timerRemaining: remaining,
    actions: {
      createRoom,
      joinRoom,
      leave,
      detach,
      forceOpenRound,
      forceTally,
      waiveGuess,
      removePlayer,
      setReady,
      markCardSeen,
      startTimer,
      stopTimer,
      nextClue,
      beginClues,
      submitVote,
      submitGuess,
      publishGuess,
      startGame,
      nextRound,
      playAgain,
      closeRoom,
      updateConfig,
      refresh: () => (session.code ? refreshRoom(session.code) : Promise.resolve(null)),
      configureBackend,
      testBackendConfig,
      recheckBackend,
      checkPublishedConfig: recheckPublishedConfig,
    },
  }
}

export default useOnlineRoom
