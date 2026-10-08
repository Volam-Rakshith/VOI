/**
 * Refresh guard — notices that this tab was reloaded mid-game.
 *
 * How it works: while a game is in progress the page leaves a small marker in
 * sessionStorage just before it unloads (`beforeunload` / `pagehide`, so it
 * catches both the F5 key and a phone's pull-to-refresh). sessionStorage
 * survives a reload but dies with the tab, so a marker still sitting there on
 * the next load means exactly one thing: this page was refreshed, and a game
 * was running when it happened.
 *
 * `beforeunload` is also the one hook a browser lets us use to ASK first — the
 * native "Leave site?" prompt — which is registered alongside it. Where the
 * browser ignores that (iOS Safari), the marker is what catches the reload.
 */

import { STORAGE_KEYS } from '../data/constants.js'
import { readSession, removeSession, writeSession } from '../utils/storage.js'

/** Remember that a refresh is about to throw a game away. */
export function armRefreshGuard(mode = 'local') {
  writeSession(STORAGE_KEYS.reloadFlag, { mode, at: Date.now() })
}

/** The marker, if this page was reloaded while a game was running. */
export function reloadHappened() {
  const marker = readSession(STORAGE_KEYS.reloadFlag, null)
  if (!marker || typeof marker !== 'object') return null
  return marker
}

export function clearRefreshGuard() {
  removeSession(STORAGE_KEYS.reloadFlag)
}

/**
 * Register the unload handlers for as long as `active` stays true.
 * Returns a teardown function.
 */
export function watchUnloads(active, mode = 'local') {
  if (!active || typeof window === 'undefined') return () => {}
  const mark = () => armRefreshGuard(mode)
  /* `returnValue` is legacy, but several browsers still need it to prompt. */
  const onBeforeUnload = (event) => {
    mark()
    try {
      event.preventDefault()
      event.returnValue = ''
    } catch {
      /* older browsers only had returnValue */
    }
    return ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', mark)
  window.addEventListener('unload', mark)
  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('pagehide', mark)
    window.removeEventListener('unload', mark)
  }
}
