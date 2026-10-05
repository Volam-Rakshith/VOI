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
  friendlyRoomError,
  isConfigured,
  joinRoom as apiJoinRoom,
  leaveRoom as apiLeaveRoom,
  patchRoom,
  pingPlayer,
  setPlayerReady,
  submitVote as apiSubmitVote,
  subscribeToRoom,
  terminateRoom,
  writeSecrets,
} from '../lib/onlineService.js'
import { assignRoles } from '../lib/gameEngine.js'
import { buildClueOrder, computeResult, isHostDriver, phaseView, revealProgress, turnPlayer, voteProgress } from '../lib/onlineGame.js'
import { normalizeRoom } from '../lib/onlineService.js'
import { readJSON, remove, writeJSON } from '../utils/storage.js'

const HEARTBEAT_MS = 15000
const RECONNECT_DELAYS = [1200, 2400, 4800, 8000, 12000, 20000]

const emptySession = () => ({ code: null, playerId: null, name: '', isHost: false, roles: null, deck: null })

export function useOnlineRoom(bank) {
  const [session, setSession] = useState(() => ({ ...emptySession(), ...(readJSON(STORAGE_KEYS.session, {}) || {}) }))
  const [room, setRoom] = useState(null)
  const [secret, setSecret] = useState(null)
  const [connection, setConnection] = useState({ state: 'idle', error: null, attempt: 0 })
  const [busy, setBusy] = useState(null) // 'creating' | 'joining' | 'starting' | ...

  const unsubscribeRef = useRef(null)
  const transitionLock = useRef(new Set())
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (session.code) writeJSON(STORAGE_KEYS.session, session)
  }, [session])

  /* ------------------------------------------------------------------ */
  /* Session lifecycle                                                   */
  /* ------------------------------------------------------------------ */
  const clearSession = useCallback(() => {
    remove(STORAGE_KEYS.session)
    setSession(emptySession())
    setRoom(null)
    setSecret(null)
  }, [])

  const applyRoom = useCallback((next) => {
    setRoom(next)
    return next
  }, [])

  const refreshRoom = useCallback(
    async (code) => {
      const row = await fetchRoomRow(code)
      return applyRoom(normalizeRoom(row.room, { code: row.code, hostId: row.host_id, status: row.status }))
    },
    [applyRoom],
  )

  /* ------------------------------------------------------------------ */
  /* Create / join                                                       */
  /* ------------------------------------------------------------------ */
  const createRoom = useCallback(
    async (playerName, config) => {
      if (!isConfigured()) return { ok: false, error: friendlyRoomError({ code: 'NOT_CONFIGURED' }) }
      setBusy('creating')
      setConnection({ state: 'connecting', error: null, attempt: 0 })
      try {
        const { room: created, player } = await apiCreateRoom({ playerName, config })
        const next = {
          code: created.code,
          playerId: player.id,
          name: player.name,
          isHost: true,
          roles: null,
          deck: { categoryLabel: created.config.categoryLabel },
        }
        setSession(next)
        setRoom(created)
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
    [],
  )

  const joinRoom = useCallback(
    async (playerName, code) => {
      if (!isConfigured()) return { ok: false, error: friendlyRoomError({ code: 'NOT_CONFIGURED' }) }
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
        setRoom(joined)
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
    [],
  )

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
  const subscribe = useCallback(
    (code) => {
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
            setConnection({ state: 'terminated', error: 'The host closed this room.', attempt: 0 })
            return
          }
          if (status === 'SUBSCRIBED') {
            setConnection({ state: 'connected', error: null, attempt: 0 })
            return
          }
          if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
            setConnection((c) => ({ state: 'reconnecting', error: null, attempt: (c.attempt || 0) + 1 }))
          }
        },
      })
    },
    [],
  )

  /* Attach / detach the subscription whenever the room code changes. */
  useEffect(() => {
    if (!session.code || !isConfigured()) return () => {}
    subscribe(session.code)
    return () => {
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [session.code, subscribe])

  /* On mount with a stored session (page refresh / deep link), pull the room
     once so the UI has data before realtime events start arriving. */
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !session.code || !isConfigured()) return
    resumed.current = true
    refreshRoom(session.code)
      .then((next) => {
        if (!next) return
        const stillIn = next.players.some((p) => p.id === session.playerId)
        if (!stillIn) {
          setConnection({ state: 'error', error: 'You are no longer in that room. It may have been closed.', attempt: 0 })
          clearSession()
        }
      })
      .catch((error) => {
        setConnection({ state: 'error', error: friendlyRoomError(error), attempt: 0 })
      })
  }, [session.code, session.playerId, refreshRoom, clearSession])

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
          setConnection({ state: 'error', error: friendlyRoomError(error), attempt: 0 })
        } else {
          setConnection((c) => ({ state: 'reconnecting', error: null, attempt: (c.attempt || 0) + 1 }))
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
    if (!session.code || !session.playerId || !isConfigured()) return () => {}
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      pingPlayer({ code: session.code, playerId: session.playerId }).catch(() => {})
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [session.code, session.playerId])

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
      const { room: updated } = await patchRoom({ code, patch: { game: { ...room.game, revealedBy: seen } } })
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
      patch: { game: { ...room.game, timer: { running: true, duration, startedAt: Date.now() } } },
    }).then(({ room: updated }) => updated && applyRoom(updated))
  }, [room, applyRoom])

  const stopTimer = useCallback(async () => {
    const { code } = sessionRef.current
    if (!code || !room?.game) return
    await patchRoom({
      code,
      patch: { game: { ...room.game, timer: { running: false, duration: room.config.turnSeconds, startedAt: null } } },
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
            timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
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
          timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
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
        game: { ...room.game, votes: { ...(room.game.votes || {}), [playerId]: targetId } },
      })
      try {
        const { room: updated } = await apiSubmitVote({ code, playerId, targetId, round: room.game.round })
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
  const startGame = useCallback(async () => {
    const { code, playerId } = sessionRef.current
    if (!code || !room) return { ok: false, error: 'Not connected.' }
    const lobby = room.players
    if (lobby.length < 3) return { ok: false, error: 'Online rooms need at least 3 players. You have ' + lobby.length + '.' }
    const notReady = lobby.filter((p) => !p.isHost && !p.ready)
    if (notReady.length) return { ok: false, error: `${notReady.map((p) => p.name).join(', ')} ${notReady.length > 1 ? 'are' : 'is'} not ready yet.` }

    setBusy('starting')
    try {
      const picked = bank?.pick
        ? bank.pick({
            categoryIds: room.config.categoryIds,
            difficulty: room.config.difficulty,
          })
        : { word: 'Mystery', categoryName: 'Random', difficulty: 'medium', decoy: null }

      const { roles } = assignRoles(lobby.length, room.config.imposterCount)
      const roleMap = {}
      lobby.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })

      const secrets = {}
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
        timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
        votes: {},
        submitted: [],
        lastResult: null,
        winner: null,
        history: [],
        eliminated: [],
        deck: { categoryLabel: picked.categoryName, difficulty: picked.difficulty },
      }

      const { room: updated } = await writeSecrets({
        code,
        secrets,
        roomPatch: { game, status: ROOM_STATUS.PLAYING },
        status: ROOM_STATUS.PLAYING,
      })
      const nextSession = { ...sessionRef.current, roles: roleMap, deck: game.deck, isHost: true }
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
  }, [room, bank, applyRoom])

  /** Host: recompute the round outcome and publish it. */
  const publishResult = useCallback(async () => {
    const { code, roles } = sessionRef.current
    if (!code || !room?.game) return
    const result = computeResult(room, roles || {})
    const gameOver = Boolean(result.winner)
    const revealedRoles = gameOver
      ? Object.fromEntries(room.players.map((p) => [p.id, roles?.[p.id] || ROLES.CREW]))
      : null
    const patch = {
      game: {
        ...room.game,
        phase: ONLINE_PHASES.RESULT,
        lastResult: result,
        winner: result.winner,
        revealedRoles,
        history: [...(room.game.history || []), result],
        eliminated: result.eliminatedId ? [...(room.game.eliminated || []), result.eliminatedId] : room.game.eliminated || [],
        timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
      },
      status: result.winner ? ROOM_STATUS.ENDED : room.status,
    }
    const { room: updated } = await patchRoom({ code, patch, status: patch.status })
    if (updated) applyRoom(updated)
  }, [room, applyRoom])

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
          timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
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
    const { room: updated } = await patchRoom({
      code,
      patch: {
        game: {
          ...room.game,
          round: (room.game.round || 1) + 1,
          phase: ONLINE_PHASES.REVEAL,
          revealedBy: [],
          clueOrder: buildClueOrder(aliveIds),
          clueIndex: 0,
          turnPlayerId: null,
          votes: {},
          submitted: [],
          lastResult: null,
          timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
        },
      },
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
      const picked = bank?.pick ? bank.pick({ categoryIds: room.config.categoryIds, difficulty: room.config.difficulty }) : { word: 'Mystery' }
      const { roles } = assignRoles(room.players.length, room.config.imposterCount)
      const roleMap = {}
      room.players.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })
      const secrets = {}
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
        timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
        votes: {},
        submitted: [],
        lastResult: null,
        winner: null,
        history: [],
        eliminated: [],
        deck: { categoryLabel: picked.categoryName, difficulty: picked.difficulty },
      }
      const { room: updated } = await writeSecrets({ code, secrets, roomPatch: { game, status: ROOM_STATUS.PLAYING }, status: ROOM_STATUS.PLAYING })
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
  }, [room, bank, applyRoom])

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
      const { room: updated } = await patchRoom({ code, patch: { config: nextConfig } })
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
        patch: { game: { ...room.game, timer: { running: false, duration: room.config.turnSeconds, startedAt: null } } },
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

  const isInRoom = Boolean(room && session.code)

  return {
    configured: isConfigured(),
    session,
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
      setReady,
      markCardSeen,
      startTimer,
      stopTimer,
      nextClue,
      beginClues,
      submitVote,
      startGame,
      nextRound,
      playAgain,
      closeRoom,
      updateConfig,
      refresh: () => (session.code ? refreshRoom(session.code) : Promise.resolve(null)),
    },
  }
}

export default useOnlineRoom
