/**
 * BLACK BOX — the hidden admin layer.
 *
 * ⚠️ SECURITY REALITY CHECK (read this before relying on it)
 * ----------------------------------------------------------
 * This build is a static site. Anything shipped to the browser can be read by
 * a determined user, therefore:
 *
 *   • The gate below is an ACCESS CONVENIENCE LAYER, not real authentication.
 *   • It raises the bar (the credential never appears in source, attempts are
 *     throttled, and the unlock lives in sessionStorage) but it cannot make a
 *     client-side admin panel secret.
 *   • Anything that genuinely needs protection must be enforced server-side —
 *     e.g. a Supabase table with Row Level Security tied to an authenticated
 *     role. That is exactly how the optional cloud word sync is configured; see
 *     supabase/schema.sql (`imposter_words` is authenticated-write only).
 *
 * The password is stored as a salted digest. To rotate it, run:
 *   node scripts/set-admin-password.mjs "your new passphrase"
 * and paste the printed digest below.
 */

const SALT = 'vrdev.imposter.blackbox.v1'
const DIGEST = '5ded0c25105581407d38387c6ebd204f7145dc19eec1d5d3286957259ae88a03'

const ATTEMPT_KEY = 'vrdev.imposter.blackbox.guard'
const UNLOCK_KEY = 'vrdev.imposter.blackbox.unlock'
const AUDIT_KEY = 'vrdev.imposter.blackbox.audit'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 60_000
const SESSION_MS = 30 * 60_000

/* -------------------------------------------------------------------------- */
/* SHA-256 (WebCrypto with a portable fallback for non-secure contexts)        */
/* -------------------------------------------------------------------------- */

function sha256Fallback(message) {
  // Minimal, dependency-free implementation of FIPS 180-4.
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

  const bytes = Array.from(new TextEncoder().encode(message))
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i -= 1) bytes.push((bitLen / 2 ** (8 * i)) & 0xff)

  const rotr = (x, n) => (x >>> n) | (x << (32 - n))

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = new Array(64)
    for (let i = 0; i < 16; i += 1) {
      w[i] = (bytes[offset + i * 4] << 24) | (bytes[offset + i * 4 + 1] << 16) | (bytes[offset + i * 4 + 2] << 8) | bytes[offset + i * 4 + 3]
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  return H.map((word) => word.toString(16).padStart(8, '0')).join('')
}

async function sha256(text) {
  try {
    if (globalThis.crypto?.subtle && globalThis.isSecureContext !== false) {
      const data = new TextEncoder().encode(text)
      const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* fall through to the JS implementation */
  }
  return sha256Fallback(text)
}

/** Length-independent comparison to avoid trivial timing leaks. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/* -------------------------------------------------------------------------- */
/* Guard state (attempts, lockout)                                            */
/* -------------------------------------------------------------------------- */

function readGuard() {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeGuard(value) {
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(value))
  } catch {
    /* storage disabled — the gate still works, it just forgets between loads */
  }
}

export function guardStatus() {
  const guard = readGuard()
  const now = Date.now()
  const lockedFor = Math.max(0, (guard.lockedUntil || 0) - now)
  return { attempts: guard.failures || 0, lockedFor, locked: lockedFor > 0, remaining: Math.max(0, MAX_ATTEMPTS - (guard.failures || 0)) }
}

/** Verify a candidate passphrase. Returns { ok, error } — never the secret. */
export async function verifyAdminPassword(candidate) {
  const guard = guardStatus()
  if (guard.locked) {
    return { ok: false, error: `Locked after too many attempts. Try again in ${Math.ceil(guard.lockedFor / 1000)}s.` }
  }
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return { ok: false, error: 'Enter the access phrase.' }
  }
  if (candidate.length > 128) {
    return { ok: false, error: 'That is far too long to be the access phrase.' }
  }

  const digest = await sha256(SALT + candidate)
  if (safeEqual(digest, DIGEST)) {
    writeGuard({ failures: 0, lockedUntil: 0 })
    grantUnlock()
    audit('unlock', 'Black Box session opened')
    return { ok: true }
  }

  const failures = (readGuard().failures || 0) + 1
  const lockout = failures >= MAX_ATTEMPTS
  writeGuard({ failures, lockedUntil: lockout ? Date.now() + LOCKOUT_MS : 0 })
  audit('unlock-failed', `Attempt ${failures}`)
  return {
    ok: false,
    error: lockout
      ? `Locked for ${Math.round(LOCKOUT_MS / 1000)} seconds.`
      : `Incorrect access phrase. ${MAX_ATTEMPTS - failures} attempt${MAX_ATTEMPTS - failures === 1 ? '' : 's'} left.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Session unlock                                                             */
/* -------------------------------------------------------------------------- */

export function grantUnlock() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now() + SESSION_MS))
  } catch {
    /* ignore */
  }
}

export function isUnlocked() {
  try {
    const until = Number(sessionStorage.getItem(UNLOCK_KEY) || 0)
    return until > Date.now()
  } catch {
    return false
  }
}

export function revokeUnlock() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/* Audit trail (local, for the System Status panel)                           */
/* -------------------------------------------------------------------------- */

export function audit(action, detail = '') {
  try {
    const log = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]')
    log.unshift({ ts: Date.now(), action, detail })
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, 40)))
  } catch {
    /* ignore */
  }
}

export function readAudit() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]')
  } catch {
    return []
  }
}

export const guardConfig = { MAX_ATTEMPTS, LOCKOUT_MS, SESSION_MINUTES: SESSION_MS / 60000 }
