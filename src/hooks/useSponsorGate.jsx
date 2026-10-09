/**
 * useSponsorGate — the single decision in front of every door into play:
 * starting a local game, creating an online room and joining one all ask this
 * hook first. A completed 15-second break buys a short grace window (see
 * adGate.AD_GRACE_MS) so a mistyped code or a quick retry never demands a
 * second ad — but the ad is REAL for a fresh session: no break, no play.
 *
 * ✕ during the break = the tap is cancelled outright; nothing is remembered.
 * A completed break is written to storage, so the other tabs' doors and the
 * custom-code unlock all open on the same watching.
 */

import { useCallback, useRef, useState } from 'react'
import { AdBreak } from '../components/lobby/AdBreak.jsx'
import { adGateNeedsBreak } from '../lib/adGate.js'
import { STORAGE_KEYS } from '../data/constants.js'
import { readJSON, writeJSON } from '../utils/storage.js'

const lastWatchedAt = () => {
  try {
    return readJSON(STORAGE_KEYS.adWatch, null)?.at ?? null
  } catch {
    return null
  }
}

export function useSponsorGate() {
  const [open, setOpen] = useState(false)
  const pending = useRef(null)

  /** Run `proceed` now, or after a watched sponsor break. */
  const request = useCallback((proceed) => {
    if (!adGateNeedsBreak(lastWatchedAt())) {
      proceed()
      return
    }
    pending.current = proceed
    setOpen(true)
  }, [])

  const done = useCallback(() => {
    setOpen(false)
    try {
      writeJSON(STORAGE_KEYS.adWatch, { at: Date.now() })
    } catch {
      /* private-mode storage failures must not eat the unlock the player just earned */
    }
    const proceed = pending.current
    pending.current = null
    proceed?.()
  }, [])

  const cancel = useCallback(() => {
    setOpen(false)
    pending.current = null
  }, [])

  const overlay = open ? <AdBreak onDone={done} onClose={cancel} /> : null

  return { request, overlay, needsBreak: () => adGateNeedsBreak(lastWatchedAt()) }
}

export default useSponsorGate
