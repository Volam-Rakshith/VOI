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
import { assignOpeningRoles, assignRolesFor, isChaosMode, isChaosRound, scheduleNextChaosRound } from '../lib/gameEngine.js'
import { buildClueOrder, computeResult, isHostDriver, phaseView, publicResult, resolveGuess, revealProgress, turnPlayer, voteProgress } from '../lib/onlineGame.js'
import { normalizeRoom } from '../lib/onlineService.js'
import { readJSON, remove, writeJSON } from '../utils/storage.js'

/**
 * Reserved key inside the PRIVATE `secrets` map that holds the round's word.
 * It is never a player id, so it can never be dealt to a card; the host reads it
 * back to re-deal chaos roles without the word ever entering public room state.
 */
const SECRET_META_KEY = '__chaos_meta__'

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

      /* Round one is the ordinary deal in both modes — see assignOpeningRoles. */
      const { roles } = assignOpeningRoles(room.config, lobby.length)
      const roleMap = {}
      lobby.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })

      const secrets = {}
      secrets[SECRET_META_KEY] = { word: picked.word, decoy: picked.decoy || null, categoryName: picked.categoryName, difficulty: picked.difficulty }
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
          pendingGuess: { playerId: result.eliminatedId, name: result.eliminatedName },
          guess: null,
          /* No role travels in the room document — see publicResult(). */
          lastResult: { ...publicResult(result), winner: null },
          winner: null,
          eliminated: [...(room.game.eliminated || []), result.eliminatedId],
          history: [...(room.game.history || []), { ...publicResult(result), winner: null }],
          timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
        },
      }
      const { room: updated } = await patchRoom({ code, patch })
      if (updated) applyRoom(updated)
      return
    }
    const revealedRoles = gameOver
      ? Object.fromEntries(room.players.map((p) => [p.id, roles?.[p.id] || ROLES.CREW]))
      : null
    const patch = {
      game: {
        ...room.game,
        phase: ONLINE_PHASES.RESULT,
        lastResult: publicResult(result),
        winner: result.winner,
        revealedRoles,
        history: [...(room.game.history || []), publicResult(result)],
        eliminated: result.eliminatedId ? [...(room.game.eliminated || []), result.eliminatedId] : room.game.eliminated || [],
        timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
      },
      status: result.winner ? ROOM_STATUS.ENDED : room.status,
    }
    const { room: updated } = await patchRoom({ code, patch, status: patch.status })
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
        patch: { game: { ...room.game, guess: { playerId, text: value, at: Date.now() } } },
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
    const judged = resolveGuess({ guess: pending.text, word: meta?.word || null })

    const roles_ = roles || {}
    const gameOver = judged.correct
    const patch = {
      game: {
        ...room.game,
        phase: ONLINE_PHASES.RESULT,
        pendingGuess: null,
        winner: judged.correct ? 'imposter' : null,
        lastResult: { ...(room.game.lastResult || {}), winner: judged.correct ? 'imposter' : null, guess: judged.correct ? 'correct' : 'wrong', guessText: pending.text },
        revealedRoles: gameOver
          ? Object.fromEntries(room.players.map((p) => [p.id, roles_[p.id] || ROLES.CREW]))
          : room.game.revealedRoles || null,
        timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
      },
      status: gameOver ? ROOM_STATUS.ENDED : room.status,
    }
    const { room: updated } = await patchRoom({ code, patch, status: patch.status })
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

    const round = (room.game.round || 1) + 1
    /*
     * Chaos is an event, not a state: the room re-rolls only on its scheduled
     * chaos rounds, exactly like the pass-&-play engine. In between, the base
     * assignment stands — except after a chaos round that dealt nobody an
     * imposter, which hands the configured count back so the game can be won.
     */
    const chaosNow = isChaosRound({ config: room.config, nextChaosRound: room.game.nextChaosRound }, round)
    const restoresBase = !chaosNow && Boolean(room.game.noImposterRound)

    const advance = {
      ...room.game,
      round,
      phase: ONLINE_PHASES.REVEAL,
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
      timer: { running: false, duration: room.config.turnSeconds, startedAt: null },
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
        const { roles } = chaosNow
          ? assignRolesFor(room.config, aliveIds.length)
          : assignRolesFor({ ...room.config, mode: 'normal' }, aliveIds.length)
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
      const picked = bank?.pick ? bank.pick({ categoryIds: room.config.categoryIds, difficulty: room.config.difficulty }) : { word: 'Mystery' }
      const { roles } = assignRolesFor(room.config, room.players.length)
      const roleMap = {}
      room.players.forEach((p, index) => {
        roleMap[p.id] = roles[index]
      })
      const secrets = {}
      secrets[SECRET_META_KEY] = { word: picked.word, decoy: picked.decoy || null, categoryName: picked.categoryName, difficulty: picked.difficulty }
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
        /* A fresh game means a fresh chaos clock, and an ordinary opening round. */
        chaosRound: false,
        nextChaosRound: isChaosMode(room.config) ? scheduleNextChaosRound(1) : null,
        noImposterRound: false,
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
    configured: backend.configured,
    backend,
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
    },
  }
}

export default useOnlineRoom
