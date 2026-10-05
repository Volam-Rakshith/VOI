/**
 * Input validation + normalisation.
 * Every value that reaches the game engine or the network goes through here.
 * Each validator returns `{ ok: boolean, value?: any, error?: string }`.
 */

import { LIMITS } from '../data/constants.js'

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g
const BAD_NAME_CHARS = /[<>{}[\]\\/|`~^*$#%@!?=;:"']/g

/** Normalise a display name: trim, collapse whitespace, strip control chars. */
export function normalizeName(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.NAME_MAX)
}

export function validatePlayerName(raw) {
  const value = normalizeName(raw)
  if (!value) return { ok: false, value: '', error: 'Please enter a valid player name.' }
  if (value.length < LIMITS.NAME_MIN) return { ok: false, value, error: 'Please enter a valid player name.' }
  if (value.length > LIMITS.NAME_MAX)
    return { ok: false, value, error: `Names must be ${LIMITS.NAME_MAX} characters or fewer.` }
  if (!/[\p{L}\p{N}]/u.test(value))
    return { ok: false, value, error: 'Use letters or numbers in the name.' }
  const cleaned = value.replace(BAD_NAME_CHARS, '')
  if (cleaned.trim().length < LIMITS.NAME_MIN)
    return { ok: false, value: '', error: 'Please enter a valid player name.' }
  return { ok: true, value: cleaned.trim() }
}

export const nameKey = (name) => normalizeName(name).toLowerCase().replace(/\s+/g, '')

/**
 * Validate the full roster.
 * @param {string[]} names
 * @param {{ min?: number, max?: number }} [opts]
 */
export function validateRoster(names, opts = {}) {
  const min = opts.min ?? LIMITS.MIN_PLAYERS
  const max = opts.max ?? LIMITS.MAX_PLAYERS
  const errors = {}
  const list = Array.isArray(names) ? names : []

  if (list.length < min) return { ok: false, errors, formError: `Add at least ${min} players to continue.` }
  if (list.length > max) return { ok: false, errors, formError: `Rooms support up to ${max} players.` }

  const seen = new Map()
  list.forEach((raw, i) => {
    const res = validatePlayerName(raw)
    if (res.ok) list[i] = res.value
    if (!res.ok) {
      errors[i] = res.error
      return
    }
    const key = nameKey(res.value)
    if (seen.has(key)) {
      errors[i] = 'That name is already taken.'
      errors[seen.get(key)] = 'That name is already taken.'
    } else {
      seen.set(key, i)
    }
  })

  if (Object.keys(errors).length) {
    return { ok: false, errors, formError: 'Fix the highlighted names to continue.' }
  }
  return { ok: true, errors: {}, names: list, formError: '' }
}

export function validateRoomCode(raw) {
  const value = typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.ROOM_CODE_LENGTH) : ''
  if (value.length !== LIMITS.ROOM_CODE_LENGTH)
    return { ok: false, value, error: `Room codes are ${LIMITS.ROOM_CODE_LENGTH} characters.` }
  // Mirrors the server alphabet: ambiguous glyphs are rejected up front.
  if (/[OIL01SZ25]/.test(value)) return { ok: false, value, error: 'That code contains a character we never use. Check it again.' }
  return { ok: true, value }
}

export function validateWord(raw) {
  const value = typeof raw === 'string' ? raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim() : ''
  if (!value) return { ok: false, value, error: 'Enter a word.' }
  if (value.length > LIMITS.WORD_MAX) return { ok: false, value, error: `Keep words under ${LIMITS.WORD_MAX} characters.` }
  if (!/[\p{L}\p{N}]/u.test(value)) return { ok: false, value, error: 'Words need letters or numbers.' }
  return { ok: true, value }
}

export function validateCategoryName(raw) {
  const value = typeof raw === 'string' ? raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim() : ''
  if (!value) return { ok: false, value, error: 'Enter a category name.' }
  if (value.length > LIMITS.CATEGORY_NAME_MAX)
    return { ok: false, value, error: `Keep names under ${LIMITS.CATEGORY_NAME_MAX} characters.` }
  return { ok: true, value }
}

/** Clamp a numeric setting into an allowed set / range. */
export function clampNumber(raw, { min, max, fallback, allowed }) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n)
  if (Array.isArray(allowed)) return allowed.includes(rounded) ? rounded : fallback
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded))
}

/**
 * Validate a whole game configuration (local or online).
 * @param {object} cfg
 * @returns {{ ok: boolean, errors: Record<string,string>, config: object }}
 */
export function validateGameConfig(cfg = {}) {
  const errors = {}
  const playerCount = clampNumber(cfg.playerCount, {
    min: LIMITS.MIN_PLAYERS,
    max: LIMITS.MAX_PLAYERS,
    fallback: 6,
  })
  if (playerCount < LIMITS.MIN_PLAYERS || playerCount > LIMITS.MAX_PLAYERS)
    errors.playerCount = `Choose between ${LIMITS.MIN_PLAYERS} and ${LIMITS.MAX_PLAYERS} players.`

  // Imposters must always be a strict minority and leave at least one crew.
  const maxImposters = Math.max(LIMITS.MIN_IMPOSTERS, Math.floor((playerCount - 1) / 2))
  const imposterCount = clampNumber(cfg.imposterCount, {
    min: LIMITS.MIN_IMPOSTERS,
    max: maxImposters,
    fallback: 1,
  })
  if (imposterCount > maxImposters)
    errors.imposterCount = `With ${playerCount} players you can have at most ${maxImposters} imposter${maxImposters > 1 ? 's' : ''}.`

  const turnSeconds = clampNumber(cfg.turnSeconds, { min: 10, max: 180, fallback: 30 })
  if (![15, 30, 45, 60, 90].includes(turnSeconds)) errors.turnSeconds = 'Pick one of the offered turn lengths.'

  const rounds = clampNumber(cfg.rounds, { min: 1, max: 6, fallback: 2 })
  const categoryIds = Array.isArray(cfg.categoryIds) && cfg.categoryIds.length ? cfg.categoryIds : ['random']
  const difficulty = ['easy', 'medium', 'hard', 'mixed'].includes(cfg.difficulty) ? cfg.difficulty : 'mixed'
  const winRule = ['classic', 'survival'].includes(cfg.winRule) ? cfg.winRule : 'classic'
  const voteMode = ['secret', 'open'].includes(cfg.voteMode) ? cfg.voteMode : 'secret'
  const clueOrder = ['random', 'seat'].includes(cfg.clueOrder) ? cfg.clueOrder : 'random'

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    config: { ...cfg, playerCount, imposterCount, turnSeconds, rounds, categoryIds, difficulty, winRule, voteMode, clueOrder },
  }
}
