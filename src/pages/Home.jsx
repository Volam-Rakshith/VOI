/**
 * Home — the cinematic main menu, plus the invisible BLACK BOX access zone
 * (three quick taps in the top-right corner; nothing is rendered as a button).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BRAND, ROUTES } from '../data/constants.js'
import { Button } from '../components/ui/Button.jsx'
import { Badge, Glyph, ScreenShell } from '../components/ui/Layout.jsx'
import { Logo } from '../components/ui/Logo.jsx'
import { isConfigured, refreshConfiguration } from '../lib/onlineService.js'
import { useSettings } from '../context/SettingsContext.jsx'
import { playSfx } from '../lib/sound.js'

const TAP_WINDOW_MS = 1400
const TAPS_REQUIRED = 3

function AdminHotzone({ onUnlock }) {
  const taps = useRef([])
  const [hint, setHint] = useState(0)

  const handleTap = useCallback(() => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < TAP_WINDOW_MS), now]
    const count = taps.current.length
    setHint(count >= 2 ? count : 0)
    if (count >= TAPS_REQUIRED) {
      taps.current = []
      setHint(0)
      onUnlock?.()
    } else if (count === 2) {
      playSfx('tick')
    }
    setTimeout(() => setHint((current) => (Date.now() - (taps.current.at(-1) || 0) > TAP_WINDOW_MS ? 0 : current)), TAP_WINDOW_MS + 60)
  }, [onUnlock])

  return (
    <div
      aria-hidden="true"
      onPointerDown={handleTap}
      className="absolute right-0 top-0 z-40 h-20 w-20 sm:h-24 sm:w-24"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {hint > 0 && (
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.55, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute right-4 top-6 h-1.5 w-1.5 rounded-full bg-cyan-300/70 shadow-neon-cyan"
        />
      )}
    </div>
  )
}

export function Home({ onNavigate, onSecretAccess }) {
  const [onlineReady, setOnlineReady] = useState(false)
  const { settings } = useSettings()

  useEffect(() => {
    // Resolve runtime configuration (device settings → runtime-config.json →
    // build variables) so the ONLINE ROOM tile reflects reality even when the
    // values were never baked into this build.
    let alive = true
    setOnlineReady(isConfigured())
    refreshConfiguration()
      .then((ready) => {
        if (alive) setOnlineReady(ready)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const menu = [
    {
      id: 'local',
      label: 'PLAY LOCAL',
      caption: 'Pass & play · 2–20 players · one device',
      icon: 'users',
      variant: 'primary',
      route: ROUTES.local,
    },
    {
      id: 'online',
      label: 'ONLINE ROOM',
      caption: onlineReady ? 'Each player on their own phone' : 'Create or join with a 6-letter code',
      icon: 'bolt',
      variant: 'default',
      route: ROUTES.online,
      badge: onlineReady ? 'ready' : 'setup',
    },
    { id: 'howto', label: 'HOW TO PLAY', caption: 'Learn the loop in 40 seconds', icon: 'book', variant: 'ghost', route: ROUTES.howto },
    { id: 'settings', label: 'SETTINGS', caption: 'Sound, motion, data', icon: 'gear', variant: 'ghost', route: ROUTES.settings },
  ]

  return (
    <ScreenShell>
      <AdminHotzone onUnlock={onSecretAccess} />

      <div className="shell-narrow flex flex-1 flex-col items-center justify-center gap-7 py-10 safe-t safe-b">
        <motion.div
          initial={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <Logo size="md" />
          <p className="mt-4 text-balance text-[13px] leading-relaxed text-violet-200/60">{BRAND.tagline} Give one clue. Find them before they find you.</p>
        </motion.div>

        <nav aria-label="Main menu" className="w-full max-w-md space-y-2.5">
          {menu.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + index * 0.06, type: 'spring', stiffness: 260, damping: 24 }}
            >
              <Button
                variant={item.variant}
                size="lg"
                fullWidth
                className="!justify-between !px-4"
                onClick={() => onNavigate(item.route)}
              >
                <span className="flex min-w-0 items-center gap-3 text-left">
                  <Glyph name={item.icon} size={18} className="shrink-0 opacity-85" />
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] font-normal normal-case tracking-normal text-violet-100/55">
                      {item.caption}
                    </span>
                  </span>
                </span>
                {item.badge ? <Badge tone={item.badge === 'ready' ? 'emerald' : 'amber'}>{item.badge}</Badge> : <span aria-hidden="true" className="text-violet-200/40">›</span>}
              </Button>
            </motion.div>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Badge tone="muted">v{BRAND.version}</Badge>
            {settings.reducedMotion && <Badge tone="muted">reduced motion</Badge>}
            {!onlineReady && <Badge tone="muted">offline build</Badge>}
          </div>
          <p className="max-w-xs text-center text-[11px] leading-relaxed text-violet-200/35">
            Built as a static bundle — runs from GitHub Pages, works offline, no accounts, no servers.
          </p>
        </div>
      </div>
    </ScreenShell>
  )
}

export default Home
