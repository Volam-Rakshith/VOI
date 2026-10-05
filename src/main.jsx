import './styles/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import { RouterProvider } from './lib/router.jsx'
import { SettingsProvider } from './context/SettingsContext.jsx'
import { WordBankProvider } from './context/WordBankContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'

/**
 * Optional offline shell.
 * Registered only in a production build served over http(s) — never in dev, and
 * never from file:// (where service workers are unavailable). If registration
 * fails, the app simply keeps working online.
 */
function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!/^https?:$/.test(window.location.protocol)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline shell is a bonus, never a requirement */
    })
  })
}

const container = document.getElementById('root')

if (!container) {
  // Should be impossible with index.html in place, but never fail silently.
  document.body.innerHTML =
    '<p style="color:#fff;font-family:system-ui;padding:24px">Imposter could not start: root element missing.</p>'
} else {
  createRoot(container).render(
    <StrictMode>
      <RouterProvider>
        <SettingsProvider>
          <WordBankProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </WordBankProvider>
        </SettingsProvider>
      </RouterProvider>
    </StrictMode>,
  )
  registerServiceWorker()
}
