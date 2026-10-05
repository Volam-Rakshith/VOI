/**
 * Boot handshake with the pre-React shell in index.html.
 *
 * index.html paints a lightweight "Loading" plate and arms a failsafe timer.
 * As soon as React has painted *something* usable — the app, or a friendly
 * error screen — we flag the boot as ready so the failsafe stands down, then
 * dissolve the plate.
 *
 * Safe to call from multiple places (StrictMode double-invokes effects, and an
 * error boundary may call it as well): the first call wins, later calls no-op.
 */

function telemetry() {
  if (typeof window === 'undefined') return null
  if (!window.__IMPOSTER_BOOT__) window.__IMPOSTER_BOOT__ = { ready: false, error: null }
  return window.__IMPOSTER_BOOT__
}

/** True once React owns the screen and the failsafe card must not appear. */
export function isBooted() {
  const t = telemetry()
  return Boolean(t && t.ready)
}

/** Mark the app as successfully painted and remove the pre-hydration plate. */
export function markBooted() {
  const t = telemetry()
  if (!t || t.ready) return
  t.ready = true

  if (typeof document === 'undefined') return
  const plate = document.getElementById('boot')
  if (!plate) return
  plate.style.opacity = '0'
  setTimeout(() => {
    // The failsafe may have swapped the plate for its card in the meantime.
    const current = document.getElementById('boot')
    if (current && current === plate) current.remove()
  }, 420)
}
