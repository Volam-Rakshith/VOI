/**
 * Hash router.
 *
 * Why not React Router? GitHub Pages serves static files only — with
 * history-based routing any deep link or refresh on `/lobby` returns 404 unless
 * you add a 404.html shim. Hash routing keeps every route inside `index.html`,
 * so refresh, sharing and back/forward work identically on
 * `username.github.io/repo/`, a custom domain, or even `file://`.
 *
 * Routes look like:  #/local   #/lobby?room=A7KQ   #/blackbox
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ROUTES } from '../data/constants.js'

const RouterContext = createContext(null)

function readHash() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  if (!raw) return { path: ROUTES.home, params: {} }
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = pathPart.replace(/\/+$/, '') || ROUTES.home
  const params = {}
  new URLSearchParams(queryPart).forEach((value, key) => {
    params[key] = value
  })
  return { path, params }
}

const KNOWN_ROUTES = new Set(Object.values(ROUTES))

export function RouterProvider({ children }) {
  const [state, setState] = useState(() => (typeof window === 'undefined' ? { path: ROUTES.home, params: {} } : readHash()))

  useEffect(() => {
    const onChange = () => setState(readHash())
    window.addEventListener('hashchange', onChange)
    // Normalise the very first load (e.g. "index.html" with no hash at all).
    if (!window.location.hash) window.history.replaceState(null, '', '#/home')
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path, params) => {
    const target = KNOWN_ROUTES.has(path) ? path : ROUTES.home
    const query = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : ''
    const next = `#/${target}${query}`
    if (window.location.hash === next) {
      setState(readHash())
      return
    }
    window.location.hash = next
    // Anchor scroll reset keeps mobile UX predictable between screens.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back()
    else navigate(ROUTES.home)
  }, [navigate])

  const value = useMemo(
    () => ({
      path: KNOWN_ROUTES.has(state.path) ? state.path : ROUTES.home,
      params: state.params,
      navigate,
      back,
    }),
    [state, navigate, back],
  )

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>')
  return ctx
}

/** Read a single query param from the current hash route. */
export function useRouteParam(key) {
  const { params } = useRouter()
  return params[key]
}
