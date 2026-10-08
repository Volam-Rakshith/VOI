/**
 * adGate.js — the two small honest rules behind "your own room code".
 *
 *  • A custom code must survive the same readability rules as a generated one:
 *    six characters, and never an ambiguous glyph (O, I, L, 0, 1, S, Z, 2, 5 —
 *    those get misread across a noisy party). The input filter enforces it as
 *    you type; validateCustomRoomCode is the backstop and runs the app's ONE
 *    canonical room-code validator, so the format can never drift apart.
 *  • The "ad" is a real interstitial: 15 seconds of watching before the skip
 *    button arms. No ad, no videos installed? The space shows its own animated
 *    plate and still runs the same clock — nobody is punished for the organiser
 *    not having dropped the mp4s in yet.
 */

import { LIMITS } from '../data/constants.js'
import { validateRoomCode } from '../utils/validate.js'

/** Seconds of watching before the skip button arms. */
export const AD_SKIP_AFTER_S = 15

/** Playlist the ad player reads at run time — drop new entries here to rotate ads. */
export const AD_PLAYLIST_PATH = 'ads/playlist.json'

/** Ambiguous glyphs the room alphabet never carries. */
const BANNED = /[OIL01SZ25]/g

/** Keep typing safe: uppercase, drop banned glyphs on the keypress. */
export function filterCustomCodeInput(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(BANNED, '')
    .slice(0, LIMITS.ROOM_CODE_LENGTH)
}

export function validateCustomRoomCode(raw) {
  const value = filterCustomCodeInput(raw)
  if (!value) return { ok: false, error: `Type the ${LIMITS.ROOM_CODE_LENGTH}-character code you want.` }
  const check = validateRoomCode(value)
  if (!check.ok) return { ok: false, error: check.error }
  return { ok: true, value: check.value }
}

/**
 * The skip clock as pure math so the 15-second rule is testable without a
 * video, a DOM, or an hourglass: seconds watched in, button state out.
 */
export function adSkipState(secondsWatched) {
  const whole = Math.max(0, Math.floor(Number(secondsWatched) || 0))
  const ready = whole >= AD_SKIP_AFTER_S
  return {
    secondsLeft: ready ? 0 : AD_SKIP_AFTER_S - whole,
    skipEnabled: ready,
    /* An ad that ended early (a 9-second clip) holds its last frame until the
       clock is up — the watch time is the deal, not the file length. */
    complete: ready,
  }
}

export default { AD_SKIP_AFTER_S, AD_PLAYLIST_PATH, filterCustomCodeInput, validateCustomRoomCode, adSkipState }
