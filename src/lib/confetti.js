/**
 * Victory / defeat effects built on canvas-confetti.
 * A single import keeps the main bundle lean; all bursts are time-boxed so
 * they never run forever on low-end devices.
 */

import confetti from 'canvas-confetti'

/**
 * canvas-confetti throws if it cannot create a 2D context (locked-down
 * browsers, some embedded webviews, headless test environments). Celebrations
 * are never worth a crash, so every burst goes through this guard.
 */
function safe(fn) {
  try {
    fn()
  } catch {
    /* effects are decorative only */
  }
}

const THEME = {
  cyan: '#22d3ee',
  purple: '#a855f7',
  magenta: '#ff2bd1',
  pink: '#ff5fa2',
  white: '#ffffff',
}

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

/** Bright, celebratory burst for a crew victory. */
export function crewVictoryCanvases(intensity = 1) {
  if (reduceMotion()) return
  const shots = Math.max(1, Math.round(intensity))
  safe(() => {
    confetti({
      particleCount: 90 * shots,
      spread: 78,
      startVelocity: 42,
      origin: { y: 0.68 },
      ticks: 220,
      colors: [THEME.cyan, THEME.purple, THEME.white, THEME.pink],
      scalar: 1.05,
      disableForReducedMotion: true,
    })
  })
  setTimeout(() => {
    safe(() =>
      confetti({
        particleCount: 60 * shots,
        angle: 60,
        spread: 62,
        origin: { x: 0, y: 0.75 },
        colors: [THEME.cyan, THEME.white],
        disableForReducedMotion: true,
      }),
    )
    safe(() =>
      confetti({
        particleCount: 60 * shots,
        angle: 120,
        spread: 62,
        origin: { x: 1, y: 0.75 },
        colors: [THEME.purple, THEME.magenta],
        disableForReducedMotion: true,
      }),
    )
  }, 220)
}

/** Dark, glitchy confetti for an imposter victory. */
export function imposterVictoryCanvases(intensity = 1) {
  if (reduceMotion()) return
  const shots = Math.max(1, Math.round(intensity))
  safe(() =>
    confetti({
      particleCount: 70 * shots,
      spread: 130,
      startVelocity: 34,
      gravity: 0.9,
      decay: 0.92,
      origin: { y: 0.5 },
      colors: [THEME.magenta, '#7f1d3f', THEME.purple, '#0b001a'],
      shapes: ['square'],
      scalar: 1.2,
      disableForReducedMotion: true,
    }),
  )
  setTimeout(() => {
    safe(() =>
      confetti({
        particleCount: 34 * shots,
        spread: 200,
        startVelocity: 20,
        gravity: 0.55,
        origin: { y: 0.62 },
        colors: [THEME.magenta, THEME.pink],
        shapes: ['circle'],
        disableForReducedMotion: true,
      }),
    )
  }, 180)
}

/** Small pop used when a round resolves. */
export function popBurst(origin = { x: 0.5, y: 0.5 }, color = THEME.cyan) {
  if (reduceMotion()) return
  safe(() =>
    confetti({
      particleCount: 34,
      spread: 70,
      startVelocity: 26,
      gravity: 0.8,
      origin,
      colors: [color, THEME.white],
      ticks: 140,
      disableForReducedMotion: true,
    }),
  )
}

/** Emergency stop — used when leaving a screen mid-effect. */
export function stopConfetti() {
  try {
    confetti.reset()
  } catch {
    /* canvas-confetti versions without reset() */
  }
}
