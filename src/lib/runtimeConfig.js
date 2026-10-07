/**
 * Backend configuration — resolved at RUNTIME, so values never have to be
 * baked into a build and re-deployed.
 *
 * Resolution order (first hit wins):
 *   1. values saved on this device   (Online screen, or BLACK BOX → BACKEND)
 *   2. runtime-config.json           (published next to index.html)
 *   3. build-time VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *
 * Everything here is a *public* value by design: the Supabase project URL and
 * the anon/publishable key are safe to ship. The service-role key must never
 * be entered — `validateBackendConfig` actively rejects it.
 */

import { createStore } from '../utils/storage.js'

const store = createStore('vrdev.imposter.backend')
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}

/** Published next to index.html; missing file is a normal, silent fallback. */
export const RUNTIME_FILE = 'runtime-config.json'

export const SOURCE_LABELS = {
  device: 'this device',
  file: RUNTIME_FILE,
  build: 'build environment',
  none: 'not configured',
}

export const buildBackend = Object.freeze({
  url: String(env.VITE_SUPABASE_URL || '').trim(),
  anonKey: String(env.VITE_SUPABASE_ANON_KEY || '').trim(),
})

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const trim = (value) => String(value ?? '').trim()

/** Hostnames that mean "a real hosted project". */
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
const LOCAL_RE = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i

/**
 * Normalise a Supabase project URL.
 * Accepts what people actually paste: with a trailing slash, with /rest/v1,
 * with a dashboard path, or with the project ref pasted on its own.
 */
export function normalizeBackendUrl(input) {
  let raw = trim(input)
  if (!raw) return ''

  /*
   * The most common paste mistake by far: copying the browser address from the
   * Supabase dashboard (https://supabase.com/dashboard/project/<ref>/...) instead
   * of the project API URL. The ref is right there in the path, so recover it.
   */
  const dashboard = /(?:https?:\/\/)?(?:app\.)?supabase\.(?:com|in)\/dashboard\/project\/([a-z0-9-]{4,})/i.exec(raw)
  if (dashboard) return `https://${dashboard[1]}.supabase.co`

  if (!/^https?:\/\//i.test(raw)) {
    // A bare project ref (e.g. "abcdefghijklm") or a bare host.
    if (/^[a-z0-9-]+$/i.test(raw)) raw = `https://${raw}.supabase.co`
    else raw = `https://${raw}`
  }
  try {
    const parsed = new URL(raw)
    const host = parsed.hostname
    const keepPort = LOCAL_RE.test(parsed.host) ? parsed.host.replace(parsed.hostname, '') : ''
    // Supabase's REST/Auth paths are commonly copied by mistake — drop them.
    return `${parsed.protocol}//${host}${keepPort}`.replace(/\/+$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    let json
    if (typeof atob === 'function') json = atob(padded)
    else if (typeof Buffer !== 'undefined') json = Buffer.from(padded, 'base64').toString('binary')
    else return null
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function validateBackendUrl(input) {
  const value = normalizeBackendUrl(input)
  if (!value) return { ok: false, error: 'Enter your Supabase project URL.' }
  if (!/^https?:\/\//i.test(value)) return { ok: false, error: 'The URL must start with https://' }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' }
  }
  if (parsed.protocol === 'http:' && !LOCAL_RE.test(parsed.host)) {
    return { ok: false, error: 'Use https:// — a plain http:// project URL will be blocked by browsers.' }
  }
  if (!HOST_RE.test(parsed.hostname) && !LOCAL_RE.test(parsed.host)) {
    return { ok: false, error: 'That host name is not valid. It usually looks like abcdefgh.supabase.co' }
  }
  if (/^(?:app\.)?supabase\.(?:com|in)$/i.test(parsed.hostname)) {
    return {
      ok: false,
      error:
        'That is the Supabase dashboard, not your project API. Open Project Settings → API and copy the Project URL — it looks like https://<project-ref>.supabase.co',
    }
  }
  return { ok: true, value }
}

export function validateAnonKey(input) {
  const value = trim(input)
  if (!value) return { ok: false, error: 'Paste the anon (public) key from Supabase → Project Settings → API.' }
  if (/\s/.test(value)) return { ok: false, error: 'The key cannot contain spaces — check for a broken paste.' }
  if (/^https?:\/\//i.test(value)) return { ok: false, error: 'That is the project URL, not the key.' }
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return { ok: false, error: 'That contains characters a key never has. Copy it again from Supabase.' }
  if (value.length < 30) return { ok: false, error: 'That key looks too short. Copy the full value — it is usually 200+ characters.' }

  const payload = decodeJwtPayload(value)
  if (payload && typeof payload === 'object') {
    if (payload.role === 'service_role') {
      return {
        ok: false,
        error: 'That is the service-role key — it bypasses all security and must never reach a browser. Use the anon / publishable key.',
      }
    }
    if (payload.role && payload.role !== 'anon' && !String(payload.role).startsWith('authenticated')) {
      return { ok: false, error: `Unexpected key role "${payload.role}". Use the anon / publishable key.` }
    }
  }
  return { ok: true, value }
}

export function validateBackendConfig({ url, anonKey } = {}) {
  const urlResult = validateBackendUrl(url)
  if (!urlResult.ok) return { ok: false, error: urlResult.error, field: 'url' }
  const keyResult = validateAnonKey(anonKey)
  if (!keyResult.ok) return { ok: false, error: keyResult.error, field: 'anonKey' }
  return { ok: true, value: { url: urlResult.value, anonKey: keyResult.value } }
}

/* -------------------------------------------------------------------------- */
/* Stored on this device                                                      */
/* -------------------------------------------------------------------------- */

export function readStoredBackend() {
  const raw = store.get('config', null)
  if (!raw || typeof raw !== 'object') return null
  const url = trim(raw.url)
  const anonKey = trim(raw.anonKey)
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function saveStoredBackend(input) {
  const result = validateBackendConfig(input)
  if (!result.ok) return result
  store.set('config', { ...result.value, savedAt: new Date().toISOString() })
  cached = null
  fileConfig = null
  notify()
  return { ok: true, value: result.value }
}

export function clearStoredBackend() {
  store.remove('config')
  cached = null
  notify()
  return true
}

export function hasStoredBackend() {
  return Boolean(readStoredBackend())
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

let fileConfig = null
let fileAttempted = false
let filePromise = null
/** Why a runtime file was ignored — surfaced in the UI so a typo is never silent. */
let fileError = null
let fileFound = false
let cached = null
let listeners = new Set()

function notify() {
  listeners.forEach((fn) => {
    try {
      fn()
    } catch {
      /* a bad listener must not break configuration */
    }
  })
}

/** Currently-known problem with runtime-config.json, if any. */
export const runtimeFileIssue = () => ({ found: fileFound, error: fileError })

/**
 * Forget what we know about runtime-config.json and read it again.
 *
 * GitHub Pages caches aggressively, so a device that was open before the file
 * was published would otherwise keep seeing the old (empty) copy until a hard
 * reload. Everything that consumes configuration is notified when this lands.
 */
export async function reloadRuntimeFile() {
  fileAttempted = false
  filePromise = null
  fileConfig = null
  fileError = null
  fileFound = false
  cached = null
  const loaded = await loadRuntimeFile()
  notify()
  return Boolean(loaded || buildBackend.url)
}

export function subscribeToBackend(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Synchronous view of the active backend, in priority order:
 *   1. values saved on this device
 *   2. runtime-config.json, once it has been read (see loadRuntimeFile)
 *   3. build-time values
 *
 * The published file MUST be consulted here — every status check in the app
 * (describeBackend().configured, isOnlineConfigured(), the Supabase client) is
 * synchronous and funnels through this function. Leaving it out meant a device
 * with a perfectly good published config still reported "not configured", which
 * is exactly what players kept seeing.
 */
export function getActiveBackend() {
  if (cached) return cached
  const stored = readStoredBackend()
  if (stored) cached = { ...stored, source: 'device' }
  else if (fileConfig) cached = { ...fileConfig, source: 'file' }
  else if (buildBackend.url && buildBackend.anonKey) cached = { ...buildBackend, source: 'build' }
  else cached = { url: '', anonKey: '', source: 'none' }
  return cached
}

/** Fetch (once) the optional runtime-config.json published beside index.html. */
async function loadRuntimeFile() {
  if (fileAttempted) return fileConfig
  if (filePromise) return filePromise
  filePromise = (async () => {
    try {
      if (typeof fetch !== 'function') return null
      const response = await fetch(`${RUNTIME_FILE}?t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) {
        fileFound = false
        return null
      }
      const text = await response.text()
      if (!text || /^\s*$/.test(text)) {
        fileFound = false
        return null
      }
      // Tolerate JSON5-ish files: strip // comments and trailing commas.
      const cleaned = text
        .replace(/^\uFEFF/, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
        .replace(/,(\s*[}\]])/g, '$1')
      const parsed = JSON.parse(cleaned)
      const url = parsed.supabaseUrl || parsed.VITE_SUPABASE_URL || parsed.url
      const anonKey = parsed.supabaseAnonKey || parsed.VITE_SUPABASE_ANON_KEY || parsed.anonKey

      // An all-empty file is the shipped default: ignore it silently.
      if (!trim(url) && !trim(anonKey)) {
        fileFound = false
        return null
      }

      fileFound = true
      const result = validateBackendConfig({ url, anonKey })
      if (!result.ok) {
        fileError = `${RUNTIME_FILE} was found but ignored — ${result.error}`
        return null
      }
      fileError = null
      return result.value
    } catch {
      return null
    } finally {
      fileAttempted = true
      filePromise = null
    }
  })()
  fileConfig = await filePromise
  if (fileConfig) {
    cached = null // a better source than build-time values appeared
    notify()
  }
  return fileConfig
}

/**
 * Full resolution, including the runtime file. Memoised after the first real
 * answer — but never memoises a "nothing found" result in a way that would
 * block a later successful file drop. Cheap to call repeatedly.
 */
export async function ensureBackend() {
  const stored = readStoredBackend()
  if (stored) return { ...stored, source: 'device' }
  if (fileConfig) return { ...fileConfig, source: 'file' }
  if (!fileAttempted) {
    const loaded = await loadRuntimeFile()
    if (loaded) return { ...loaded, source: 'file' }
  }
  if (buildBackend.url && buildBackend.anonKey) return { ...buildBackend, source: 'build' }
  return { url: '', anonKey: '', source: 'none' }
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

export function maskKey(key) {
  const value = trim(key)
  if (!value) return ''
  if (value.length <= 14) return '•'.repeat(value.length)
  return `${value.slice(0, 6)}${'•'.repeat(12)}${value.slice(-4)}`
}

/** A short, human-readable summary for status panels. */
export function describeBackend() {
  const active = getActiveBackend()
  const configured = Boolean(active.url && active.anonKey)
  return {
    configured,
    source: active.source,
    sourceLabel: SOURCE_LABELS[active.source] || SOURCE_LABELS.none,
    url: active.url,
    host: (() => {
      try {
        return active.url ? new URL(active.url).host : ''
      } catch {
        return active.url
      }
    })(),
    keyHint: maskKey(active.anonKey),
    editableOnDevice: true,
    storedOnDevice: hasStoredBackend(),
    fileFound,
    fileError,
    fromBuild: Boolean(buildBackend.url && buildBackend.anonKey),
    projectRef: (() => {
      const match = /^https?:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(active.url || '')
      return match ? match[1] : ''
    })(),
  }
}
