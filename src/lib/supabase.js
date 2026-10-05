/**
 * Supabase client bootstrap.
 *
 * Configuration is resolved at RUNTIME (see runtimeConfig.js), so the same
 * build works against any project without being rebuilt:
 *   device settings → runtime-config.json → build-time env vars
 *
 * The app is deliberately usable with ZERO backend: with no configuration,
 * `isOnlineConfigured()` is false and the Online Room screen shows a setup
 * panel instead of broken UI.
 *
 * Only the project URL and the anon/publishable key are ever read. Never place
 * a service-role key in a Vite variable or in the in-app config — it would ship
 * to clients (the validator rejects it explicitly).
 */

import { createClient } from '@supabase/supabase-js'
import { ensureBackend, getActiveBackend, subscribeToBackend } from './runtimeConfig.js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}

export const supabaseConfig = {
  get url() {
    return getActiveBackend().url
  },
  get anonKey() {
    return getActiveBackend().anonKey
  },
  table: 'imposter_rooms',
  wordsTable: 'imposter_words',
  roomTtlMinutes: Number(env.VITE_ROOM_TTL_MINUTES || 180),
}

export function isOnlineConfigured() {
  const { url, anonKey } = getActiveBackend()
  return Boolean(url && anonKey && /^https?:\/\//.test(url))
}

/** Everything a "where is my config coming from?" panel needs. */
export const backendConfigInfo = () => getActiveBackend()

let client = null
let clientSignature = ''
/** Why the last client creation failed, if it did — surfaced in diagnostics. */
let clientError = null

function buildClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 12 } },
    global: { headers: { 'x-application-name': 'imposter-vrdev' } },
  })
}

/**
 * The live client, created on demand and rebuilt whenever the configuration
 * changes — so pasting new values takes effect immediately, no reload needed.
 */
export function getSupabase() {
  if (!isOnlineConfigured()) return null
  const { url, anonKey } = getActiveBackend()
  const signature = `${url}|${anonKey}`
  if (client && clientSignature === signature) return client
  try {
    client = buildClient(url, anonKey)
    clientSignature = signature
    clientError = null
  } catch (error) {
    // Never throw into a render path: an unusable client is reported instead.
    // (Happens in Node below v22, which has no native WebSocket for Realtime.)
    client = null
    clientSignature = ''
    clientError = String(error?.message || error)
  }
  return client
}

/** Reason the client could not be created, for SYSTEM STATUS-style panels. */
export const getSupabaseError = () => clientError

export function resetSupabaseClient() {
  client = null
  clientSignature = ''
  clientError = null
}

// A changed configuration must never leave a stale client (or a stale channel)
// pointing at the previous project.
subscribeToBackend(resetSupabaseClient)

/**
 * A throwaway client for "Test connection" — never cached, so a bad URL cannot
 * poison the live one.
 */
export function createProbeClient(url, anonKey) {
  return buildClient(url, anonKey)
}

/** True when the browser can reach the network at all. */
export const isBrowserOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export { ensureBackend }
