/**
 * App — shell, routing and global overlays.
 * Hash routing keeps every screen refresh-safe on GitHub Pages.
 */

import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ROUTES } from './data/constants.js'
import { useRouter } from './lib/router.jsx'
import { AmbientBackground } from './components/effects/AmbientBackground.jsx'
import { SplashScreen } from './components/effects/SplashScreen.jsx'
import { Home } from './pages/Home.jsx'
import { LoadingScreen, ErrorState } from './components/ui/Feedback.jsx'
import { ErrorBoundary } from './components/ui/ErrorBoundary.jsx'
import { BlackBoxGate } from './components/admin/BlackBoxGate.jsx'
import { isUnlocked } from './lib/blackbox.js'
import { markBooted } from './lib/boot.js'

/* Heavier screens are code-split so the menu stays instant on mobile. */
const LocalGame = lazy(() => import('./pages/LocalGame.jsx').then((m) => ({ default: m.LocalGame })))
const OnlineGame = lazy(() => import('./pages/OnlineGame.jsx').then((m) => ({ default: m.OnlineGame })))
const Lobby = lazy(() => import('./pages/Lobby.jsx').then((m) => ({ default: m.Lobby })))
const HowToPlay = lazy(() => import('./pages/HowToPlay.jsx').then((m) => ({ default: m.HowToPlay })))
const Settings = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.Settings })))
const BlackBox = lazy(() => import('./pages/BlackBox.jsx').then((m) => ({ default: m.BlackBox })))

export function App() {
  const { path, navigate } = useRouter()
  const [splashDone, setSplashDone] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)

  const handleSecret = useCallback(() => {
    setGateOpen(true)
  }, [])

  useEffect(() => {
    // Tell the pre-React shell in index.html that the app is alive, which
    // stands down the "could not start" failsafe and dissolves the Loading plate.
    markBooted()
  }, [])

  const renderRoute = () => {
    switch (path) {
      case ROUTES.local:
        return <LocalGame onNavigate={navigate} />
      case ROUTES.online:
        return <OnlineGame onNavigate={navigate} />
      case ROUTES.lobby:
        return <Lobby onNavigate={navigate} />
      case ROUTES.howto:
        return <HowToPlay onNavigate={navigate} />
      case ROUTES.settings:
        return <Settings onNavigate={navigate} />
      case ROUTES.blackbox:
        return isUnlocked() ? (
          <BlackBox onNavigate={navigate} onLock={() => navigate(ROUTES.home)} />
        ) : (
          <Home onNavigate={navigate} onSecretAccess={handleSecret} />
        )
      case ROUTES.home:
      default:
        return <Home onNavigate={navigate} onSecretAccess={handleSecret} />
    }
  }

  return (
    <ErrorBoundary title="Something broke" onReset={() => navigate(ROUTES.home)}>
      <AmbientBackground />

      <AnimatePresence>{!splashDone && <SplashScreen key="splash" onDone={() => setSplashDone(true)} />}</AnimatePresence>

      <main className={splashDone ? 'relative z-10' : 'pointer-events-none relative z-10 opacity-0'}>
        <Suspense fallback={<LoadingScreen title="Loading" caption="Spinning up the HUD…" />}>
          {/* Route swaps are immediate: a stalled exit animation must never be
              able to trap the user on an old screen. */}
          {renderRoute()}
        </Suspense>
      </main>

      <BlackBoxGate
        open={gateOpen}
        onCancel={() => setGateOpen(false)}
        onUnlocked={() => {
          setGateOpen(false)
          navigate(ROUTES.blackbox)
        }}
      />
    </ErrorBoundary>
  )
}

export default App
