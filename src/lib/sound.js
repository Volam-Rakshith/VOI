/**
 * Tiny procedural sound engine (Web Audio, zero assets).
 * Everything is synthesised on demand so the game stays a single static bundle
 * with no audio files to load. Audio only starts after a user gesture, and the
 * whole engine is opt-in via Settings -> Sound.
 */

let ctx = null
let master = null
let unlocked = false
let enabled = true

function ensureContext() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try {
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.18
      master.connect(ctx.destination)
    } catch {
      ctx = null
    }
  }
  return ctx
}

export function setSoundEnabled(value) {
  enabled = Boolean(value)
  if (master && ctx) master.gain.value = enabled ? 0.18 : 0
}

export function unlockAudio() {
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  unlocked = true
}

export const isAudioReady = () => Boolean(ctx && unlocked)

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.5, slideTo = null, delay = 0 }) {
  const c = ensureContext()
  if (!c || !enabled) return
  const start = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function noise({ dur = 0.25, gain = 0.35, filterFreq = 1200, delay = 0 }) {
  const c = ensureContext()
  if (!c || !enabled) return
  const start = c.currentTime + delay
  const frames = Math.floor(c.sampleRate * dur)
  const buffer = c.createBuffer(1, frames, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = filterFreq
  const g = c.createGain()
  g.gain.value = gain
  src.connect(filter)
  filter.connect(g)
  g.connect(master)
  src.start(start)
}

/** Public API — every cue is a short, tasteful synth gesture. */
export const sfx = {
  tap() {
    tone({ freq: 620, dur: 0.06, type: 'triangle', gain: 0.35 })
  },
  hover() {
    tone({ freq: 900, dur: 0.04, type: 'sine', gain: 0.12 })
  },
  confirm() {
    tone({ freq: 520, dur: 0.09, type: 'triangle', gain: 0.4 })
    tone({ freq: 780, dur: 0.12, type: 'triangle', gain: 0.3, delay: 0.07 })
  },
  back() {
    tone({ freq: 380, dur: 0.09, type: 'triangle', gain: 0.3, slideTo: 240 })
  },
  error() {
    tone({ freq: 180, dur: 0.22, type: 'sawtooth', gain: 0.32, slideTo: 120 })
  },
  swipe() {
    noise({ dur: 0.18, gain: 0.22, filterFreq: 900 })
  },
  cardReveal() {
    noise({ dur: 0.3, gain: 0.25, filterFreq: 2200 })
    tone({ freq: 320, dur: 0.34, type: 'sine', gain: 0.32, slideTo: 720 })
  },
  cardHide() {
    noise({ dur: 0.18, gain: 0.2, filterFreq: 700 })
    tone({ freq: 420, dur: 0.16, type: 'sine', gain: 0.24, slideTo: 180 })
  },
  tick() {
    tone({ freq: 1180, dur: 0.035, type: 'square', gain: 0.12 })
  },
  warning() {
    tone({ freq: 300, dur: 0.14, type: 'sawtooth', gain: 0.28 })
  },
  timeUp() {
    tone({ freq: 220, dur: 0.5, type: 'sawtooth', gain: 0.34, slideTo: 90 })
    noise({ dur: 0.4, gain: 0.2, filterFreq: 500 })
  },
  vote() {
    tone({ freq: 700, dur: 0.08, type: 'triangle', gain: 0.35 })
    tone({ freq: 1040, dur: 0.1, type: 'sine', gain: 0.22, delay: 0.06 })
  },
  reveal() {
    ;[0, 0.1, 0.2, 0.32].forEach((d, i) => tone({ freq: 420 + i * 180, dur: 0.28, type: 'triangle', gain: 0.3, delay: d }))
  },
  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.32, delay: i * 0.11 })
      tone({ freq: f * 2, dur: 0.4, type: 'sine', gain: 0.12, delay: i * 0.11 })
    })
  },
  defeat() {
    const notes = [392, 349.23, 261.63, 196]
    notes.forEach((f, i) => tone({ freq: f, dur: 0.55, type: 'sawtooth', gain: 0.26, delay: i * 0.16 }))
    noise({ dur: 0.9, gain: 0.16, filterFreq: 320, delay: 0.2 })
  },
}

export const playSfx = (name) => {
  const fn = sfx[name]
  if (typeof fn === 'function' && enabled) fn()
}

/** Global listener: gives every button a click without wiring per-component. */
export function attachGlobalClickSound() {
  if (typeof document === 'undefined') return () => {}
  const handler = (event) => {
    if (!enabled) return
    const el = event.target?.closest?.('button, [role="button"], a[href]')
    if (!el || el.disabled) return
    if (el.dataset.silent === 'true') return
    sfx.tap()
  }
  document.addEventListener('pointerdown', handler, { passive: true })
  return () => document.removeEventListener('pointerdown', handler)
}
