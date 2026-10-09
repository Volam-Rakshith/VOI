/**
 * HAPTIC PATTERNS — one place for every vibration cue the game plays.
 *
 * Design rules (these matter for the game, not just for taste):
 *  • Cues are ROLE-AGNOSTIC. The reveal cue is identical for crew and imposters,
 *    so nobody can read a neighbour's hand from a buzz. Where a moment needs
 *    emphasis it is the *moment* that is emphasised, never the role.
 *  • Short and low-impact by default: a phone lying on a wooden table should not
 *    announce the game to the room.
 *  • Every call is a safe no-op when unsupported, disabled, or during a
 *    non-user-initiated render — `navigator.vibrate` simply isn't called.
 *
 * Patterns are `number | number[]` in the shape the Vibration API expects:
 * a number is a single buzz (ms), an array alternates vibrate/pause/vibrate…
 */

export const HAPTIC = {
  /* Lifecycle ------------------------------------------------------------- */
  gameStart: [12, 60, 24], // dealt: two rising taps
  roleReveal: 16, // same for EVERY player — never role-specific
  roleHidden: 8,

  /* Round flow ------------------------------------------------------------ */
  roundStart: [10, 45, 14],
  turnChange: 10,
  myTurn: [16, 70, 16], // a two-tap knock — "your clue turn" on any phone, any role
  timerWarning: [8, 60, 8], // 10s left
  timerCritical: [14, 45, 14, 45, 14], // 5s left
  timerEnd: [40, 70, 40], // time up

  /* Voting ---------------------------------------------------------------- */
  votingStart: [10, 50, 18],
  voteSubmitted: 22,
  votingEnded: [14, 50, 14],
  eliminated: [28, 55, 28],

  /* Verdict --------------------------------------------------------------- */
  result: [18, 70, 18, 70, 40],
  chaosResult: [22, 60, 22, 60, 22, 60, 46],

  /* Chaos ---------------------------------------------------------------- */
  chaosRound: [16, 40, 16, 40, 30], // a round whose roles were re-rolled
  chaosAll: [30, 50, 30, 50, 30, 50, 52], // every player was an imposter
}

/**
 * Fire a named cue.
 *
 * @param {string} name    key of HAPTIC
 * @param {Function} vibrate  the settings-aware helper from SettingsContext
 * @param {number} [scale] optional multiplier for intensity tuning (1 = default)
 */
export function haptic(name, vibrate, scale = 1) {
  if (typeof vibrate !== 'function') return false
  const pattern = HAPTIC[name]
  if (!pattern) return false
  if (!scale || scale === 1) {
    vibrate(pattern)
    return true
  }
  const scaled = Array.isArray(pattern) ? pattern.map((value) => Math.max(1, Math.round(value * scale))) : Math.max(1, Math.round(pattern * scale))
  vibrate(scaled)
  return true
}

export default haptic
