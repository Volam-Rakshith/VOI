/**
 * Supabase client bootstrap.
 *
 * The app is deliberately usable with ZERO backend: if the two public env
 * variables are missing, `isOnlineConfigured()` returns false and the Online
 * Room screen shows a clean configuration card instead of broken UI.
 *
 * Only VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are ever read here.
 * Never place a service-role key in a Vite variable — it would ship to clients.
 */

import { createClient } from '@supabase/supabase-js'

/**
 * `import.meta.env` is Vite's — outside a bundler (e.g. the Node test runner)
 * it does not exist, so read it defensively.
 */
const env = import.meta.env || {}

const url = (env.VITE_SUPABASE_URL || '').trim()
const anonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim()

export const supabaseConfig = {
  url,
  anonKey,
  table: 'imposter_rooms',
  wordsTable: 'imposter_words',
  roomTtlMinutes: Number(env.VITE_ROOM_TTL_MINUTES || 180),
}

export const isOnlineConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url))

let client = null

export function getSupabase() {
  if (!isOnlineConfigured) return null
  if (!client) {
    try {
      client = createClient(url, anonKey, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 12 } },
        global: { headers: { 'x-application-name': 'imposter-vrdev' } },
      })
    } catch {
      client = null
    }
  }
  return client
}

/** True when the browser can reach the network at all. */
export const isBrowserOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)
