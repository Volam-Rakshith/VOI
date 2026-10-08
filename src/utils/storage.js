/**
 * Defensive LocalStorage wrapper.
 * Private browsing, disabled storage, quota errors and corrupted JSON are all
 * handled — the app simply falls back to in-memory state instead of crashing.
 */

const memory = new Map()
let available = null

function probe() {
  if (available !== null) return available
  try {
    const key = '__vrdev_probe__'
    window.localStorage.setItem(key, '1')
    window.localStorage.removeItem(key)
    available = true
  } catch {
    available = false
  }
  return available
}

export const storageAvailable = () => probe()

export function readJSON(key, fallback = null) {
  try {
    const raw = probe() ? window.localStorage.getItem(key) : memory.get(key)
    if (raw === null || raw === undefined) return fallback
    const parsed = JSON.parse(raw)
    return parsed === null ? fallback : parsed
  } catch {
    // Corrupted stored data should never brick the app.
    try {
      remove(key)
    } catch {
      /* ignore */
    }
    return fallback
  }
}

export function writeJSON(key, value) {
  const raw = JSON.stringify(value)
  try {
    if (probe()) window.localStorage.setItem(key, raw)
    else memory.set(key, raw)
    return true
  } catch {
    // Quota exceeded / serialization failure: keep working from memory.
    memory.set(key, raw)
    return false
  }
}

export function remove(key) {
  try {
    if (probe()) window.localStorage.removeItem(key)
    memory.delete(key)
  } catch {
    /* ignore */
  }
}

export function removeMany(keys) {
  keys.forEach(remove)
}

/* -------------------------------------------------------------------------- */
/* Per-tab storage (sessionStorage)                                           */
/*                                                                            */
/* Survives a refresh, dies with the tab — exactly what an in-progress game    */
/* needs: a phone reload can pick the table back up, but closing the tab ends  */
/* it. Falls back to memory whenever storage is unavailable (private mode).    */
/* -------------------------------------------------------------------------- */

const sessionMemory = new Map()

function sessionArea() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) return window.sessionStorage
  } catch {
    /* storage blocked */
  }
  return null
}

export function readSession(key, fallback = null) {
  try {
    const area = sessionArea()
    const raw = area ? area.getItem(key) : sessionMemory.get(key)
    if (raw === null || raw === undefined) return fallback
    const parsed = JSON.parse(raw)
    return parsed === null ? fallback : parsed
  } catch {
    return fallback
  }
}

export function writeSession(key, value) {
  const raw = JSON.stringify(value)
  try {
    const area = sessionArea()
    if (area) area.setItem(key, raw)
    else sessionMemory.set(key, raw)
    return true
  } catch {
    sessionMemory.set(key, raw)
    return false
  }
}

export function removeSession(key) {
  try {
    const area = sessionArea()
    if (area) area.removeItem(key)
  } catch {
    /* ignore */
  }
  sessionMemory.delete(key)
}

/** Namespaced helper for a single logical store. */
export function createStore(prefix) {
  return {
    get: (key, fallback = null) => readJSON(`${prefix}.${key}`, fallback),
    set: (key, value) => writeJSON(`${prefix}.${key}`, value),
    remove: (key) => remove(`${prefix}.${key}`),
  }
}
