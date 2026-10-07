/**
 * Cryptographically strong randomness helpers.
 * Role assignment never relies on Math.random() alone — crypto.getRandomValues
 * is preferred wherever the runtime exposes it.
 */

const cryptoObj = (() => {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      return globalThis.crypto
    }
  } catch {
    /* ignore */
  }
  return null
})()

export const hasStrongRandom = Boolean(cryptoObj)

/** Uniform 32-bit unsigned integer in [0, 2^32). */
export function randomUint32() {
  if (cryptoObj) {
    const buf = new Uint32Array(1)
    cryptoObj.getRandomValues(buf)
    return buf[0]
  }
  return Math.floor(Math.random() * 4294967296)
}

/** Float in [0, 1) with strong randomness when available. */
export function randomFloat() {
  return randomUint32() / 4294967296
}

/**
 * Unbiased integer in [0, max) using rejection sampling.
 * @param {number} max exclusive upper bound
 */
export function randomInt(max) {
  if (!Number.isFinite(max) || max <= 0) return 0
  const limit = Math.floor(4294967296 / max) * max
  let value = randomUint32()
  let guard = 0
  while (value >= limit && guard < 64) {
    value = randomUint32()
    guard += 1
  }
  return value % max
}

/** Pick a random element from a non-empty array. */
export function randomPick(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[randomInt(list.length)]
}

/**
 * Fisher–Yates shuffle (non-mutating) driven by strong randomness.
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
export function shuffle(list) {
  const out = Array.isArray(list) ? list.slice() : []
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Short, human-friendly unique-ish id. */
export function uid(prefix = 'id') {
  const rand = randomUint32().toString(36).padStart(7, '0')
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}

/** UUID v4 (uses crypto.randomUUID when present). */
export function uuid() {
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID()
  const bytes = new Uint8Array(16)
  if (cryptoObj) cryptoObj.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

/**
 * Room code generator — 6 characters from an unambiguous alphabet
 * (no O/0, I/1/L, S/5, Z/2). Case-insensitive at the API level.
 */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY34679'

export function generateRoomCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i += 1) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]
  return code
}
