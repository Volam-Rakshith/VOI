/**
 * App — shell, routing and global overlays.
 * Hash routing keeps every screen refresh-safe on GitHub Pages.
 */

import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ROUTES } from './data/constants.js'
import { useRouter } from './lib/router.jsx'
import { AmbientBackground } from './components/effects/AmbientBackground.jsx'
import { SplashScreen } from './components/effects/SplashScreen.jsx'
import { Home } from './pages/Home.jsx'
import { LoadingScreen, ErrorState } from './components/ui/Feedback.jsx'
import { Button } from './components/ui/Button.jsx'
import { BlackBoxGate } from './components/admin/BlackBoxGate.jsx'
import { isUnlocked } from './lib/blackbox.js'

/* Heavier screens are code-split so the menu stays instant on mobile. */
const LocalGame = lazy(() => import('./pages/LocalGame.jsx').then((m) => ({ default: m.LocalGame })))
const OnlineGame = lazy(() => import('./pages/OnlineGame.jsx').then((m) => ({ default: m.OnlineGame })))
const Lobby = lazy(() => import('./pages/Lobby.jsx').then((m) => ({ default: m.Lobby })))
const HowToPlay = lazy(() => import('./pages/HowToPlay.jsx').then((m) => ({ default: m.HowToPlay })))
const Settings = lazy(() => import('./pages/Settings.jsx').then((m) => ({ default: m.Settings })))
const BlackBox = lazy(() => import('./pages/BlackBox.jsx').then((m) => ({ default: m.BlackBox })))

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept intentionally quiet for players; useful in a local dev console.
    if (import.meta.env.DEV) console.error('[imposter] render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen items-center justify-center px-4 py-16">
          <ErrorState
            title="Something broke"
            message="The app hit an unexpected error. Reloading usually clears it — your settings and words are stored safely on this device."
            action={
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => window.location.reload()}>
                  Reload
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { window.location.hash = '#/home'; window.location.reload() }}>
                  Back to menu
                </Button>
              </div>
            }
          />
        </div>
      )
    }
    return this.props.children
  }
}

export function App() {
  const { path, navigate } = useRouter()
  const [splashDone, setSplashDone] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)

  const handleSecret = useCallback(() => {
    setGateOpen(true)
  }, [])

  useEffect(() => {
    // Remove the pre-hydration paint plate once React owns the screen.
    const boot = document.getElementById('boot')
    if (boot) {
      boot.style.opacity = '0'
      setTimeout(() => boot.remove(), 420)
    }
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
    <ErrorBoundary>
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
