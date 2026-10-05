/* ===========================================================================
   IMPOSTER — service worker (optional, production only)

   Why it exists: local pass & play is offline-first, so the app itself should
   survive a dropped connection or a plane-hopping session. The strategy is
   chosen so it can never serve a mismatched build:

     • navigations        → network first, cache fallback (fresh app when online,
                            boots offline when not)
     • hashed build assets → cache first (their filenames change when they change)
     • everything else     → passthrough (Supabase, share targets, etc.)

   Nothing is precached speculatively; the first visit fills the cache naturally.
   =========================================================================== */

const CACHE = 'imposter-v1'
const OFFLINE_ENTRIES = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(OFFLINE_ENTRIES.map((entry) => cache.add(new Request(entry, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .catch(() => {}),
  )
})

const isBuildAsset = (url) => url.pathname.includes('/assets/')

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Never intercept cross-origin calls (Supabase realtime/REST, etc.).
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {})
          return response
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    )
    return
  }

  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              if (response.ok) {
                const copy = response.clone()
                caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
              }
              return response
            })
            .catch(() => cached),
      ),
    )
  }
})
